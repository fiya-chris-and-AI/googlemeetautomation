import { NextResponse } from 'next/server';
import { getServerSupabase } from '../../../../lib/supabase';
import {
    extractActionItemsFromTranscript,
    buildInsertionRows,
} from '@meet-pipeline/shared';
import type { TranscriptForExtraction, RawExtractedItem } from '@meet-pipeline/shared';

export const dynamic = 'force-dynamic';

/**
 * POST /api/action-items/extract-all
 *
 * Bulk-extract action items from every unprocessed transcript.
 * Deduplicates new items against existing action items using Claude.
 *
 * Returns: { transcripts_processed, transcripts_skipped, items_extracted, items_flagged_duplicate }
 */
export async function POST() {
    try {
        const anthropicKey = process.env.ANTHROPIC_API_KEY;
        if (!anthropicKey) {
            return NextResponse.json(
                { error: 'ANTHROPIC_API_KEY is not configured' },
                { status: 503 },
            );
        }

        const supabase = getServerSupabase();

        // ── 1. Find unprocessed transcripts ─────────────
        // A transcript is "processed" if it has AI-created action items
        // OR if a previous bulk extraction yielded zero items (logged in activity_log).

        const { data: allTranscripts, error: txErr } = await supabase
            .from('transcripts')
            .select('id, meeting_title, raw_transcript, participants')
            .order('meeting_date', { ascending: true });

        if (txErr) {
            return NextResponse.json({ error: txErr.message }, { status: 500 });
        }

        // Transcripts that already have AI action items
        const { data: existingAiItems, error: aiErr } = await supabase
            .from('action_items')
            .select('transcript_id')
            .eq('created_by', 'ai');

        if (aiErr) {
            return NextResponse.json({ error: aiErr.message }, { status: 500 });
        }

        const hasAiItems = new Set(
            (existingAiItems ?? []).map((r) => r.transcript_id).filter(Boolean),
        );

        // Transcripts previously attempted via bulk extraction (including empty results)
        const { data: previousAttempts } = await supabase
            .from('activity_log')
            .select('metadata')
            .eq('event_type', 'bulk_extraction_attempted');

        const previouslyAttempted = new Set<string>();
        for (const row of previousAttempts ?? []) {
            const meta = row.metadata as Record<string, unknown> | null;
            if (meta?.transcript_id && typeof meta.transcript_id === 'string') {
                previouslyAttempted.add(meta.transcript_id);
            }
        }

        const unprocessed = (allTranscripts ?? []).filter(
            (t) => !hasAiItems.has(t.id) && !previouslyAttempted.has(t.id),
        ) as TranscriptForExtraction[];

        const skippedCount = (allTranscripts ?? []).length - unprocessed.length;

        if (unprocessed.length === 0) {
            return NextResponse.json({
                transcripts_processed: 0,
                transcripts_skipped: skippedCount,
                items_extracted: 0,
                items_flagged_duplicate: 0,
                transcripts_empty: 0,
                transcripts_failed: 0,
            });
        }

        // ── 2. Process each transcript sequentially ─────
        let totalExtracted = 0;
        let totalDuplicates = 0;
        let emptyCount = 0;
        let failedCount = 0;
        let processedCount = 0;

        for (const transcript of unprocessed) {
            console.log(`[Extract-All] Processing: ${transcript.meeting_title} (${transcript.id})`);

            // 2a. Extract action items via Claude
            let extracted: RawExtractedItem[];
            try {
                extracted = await extractActionItemsFromTranscript(transcript, anthropicKey);
            } catch (err) {
                console.error(`[Extract-All] Extraction failed for ${transcript.id}:`, err);
                failedCount++;
                // Log the failure so we don't retry endlessly
                await supabase.from('activity_log').insert({
                    event_type: 'bulk_extraction_attempted',
                    entity_type: 'transcript',
                    entity_id: transcript.id,
                    actor: 'system',
                    summary: `Bulk extraction failed for: ${transcript.meeting_title}`,
                    metadata: {
                        transcript_id: transcript.id,
                        error: err instanceof Error ? err.message : 'Unknown error',
                        result: 'failed',
                    },
                });
                continue;
            }

            if (extracted.length === 0) {
                console.log(`[Extract-All] No action items found in: ${transcript.meeting_title}`);
                emptyCount++;
                // Log so this transcript isn't re-processed on the next run
                await supabase.from('activity_log').insert({
                    event_type: 'bulk_extraction_attempted',
                    entity_type: 'transcript',
                    entity_id: transcript.id,
                    actor: 'system',
                    summary: `Bulk extraction found 0 items in: ${transcript.meeting_title}`,
                    metadata: {
                        transcript_id: transcript.id,
                        items_found: 0,
                        result: 'empty',
                    },
                });
                continue;
            }

            processedCount++;

            // 2b. Build base rows (without dedup info yet)
            const baseRows = buildInsertionRows(extracted, transcript.id);

            // 2c. Deduplicate against existing action items
            const { data: allExisting } = await supabase
                .from('action_items')
                .select('id, title, assigned_to')
                .neq('status', 'dismissed');

            const existingItems = allExisting ?? [];

            // Ask Claude to identify duplicates
            const dupMapping = await findDuplicates(
                baseRows,
                existingItems,
                anthropicKey,
            );

            // 2d. Apply dedup flags and insert
            const finalRows = baseRows.map((row, index) => {
                const originalId = dupMapping[index] ?? null;
                if (originalId) {
                    return { ...row, is_duplicate: true, duplicate_of: originalId };
                }
                return { ...row, is_duplicate: false, duplicate_of: null };
            });

            const { data: inserted, error: insertErr } = await supabase
                .from('action_items')
                .insert(finalRows)
                .select();

            if (insertErr) {
                console.error(`[Extract-All] Insert failed for ${transcript.id}:`, insertErr.message);
                failedCount++;
                continue;
            }

            const insertedItems = inserted ?? [];
            const duplicateCount = finalRows.filter((r) => r.is_duplicate).length;

            totalExtracted += insertedItems.length;
            totalDuplicates += duplicateCount;

            console.log(`[Extract-All] Inserted ${insertedItems.length} items (${duplicateCount} duplicates) from: ${transcript.meeting_title}`);

            // 2e. Log each creation to activity_log
            const activityRows = insertedItems.map((item) => ({
                event_type: 'action_item_created',
                entity_type: 'action_item',
                entity_id: item.id,
                actor: 'system',
                summary: `AI extracted action item (bulk): ${item.title}${item.is_duplicate ? ' [duplicate]' : ''}`,
                metadata: {
                    transcript_id: transcript.id,
                    priority: item.priority,
                    assigned_to: item.assigned_to,
                    is_duplicate: item.is_duplicate,
                    duplicate_of: item.duplicate_of,
                    bulk: true,
                },
            }));

            if (activityRows.length > 0) {
                await supabase.from('activity_log').insert(activityRows);
            }
        }

        return NextResponse.json({
            transcripts_processed: processedCount,
            transcripts_skipped: skippedCount,
            transcripts_empty: emptyCount,
            transcripts_failed: failedCount,
            items_extracted: totalExtracted,
            items_flagged_duplicate: totalDuplicates,
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error('Extract-all error:', msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

// ── Deduplication helper ────────────────────────

/**
 * Use Claude to semantically compare new action items against existing ones.
 *
 * Returns a mapping: rowIndex → existingItemId (or undefined if not a duplicate).
 */
async function findDuplicates(
    newRows: Record<string, unknown>[],
    existingItems: { id: string; title: string; assigned_to: string | null }[],
    anthropicKey: string,
): Promise<Record<number, string>> {
    // If there are no existing items, nothing can be a duplicate
    if (existingItems.length === 0 || newRows.length === 0) {
        return {};
    }

    const newItemsSummary = newRows.map((r, i) => ({
        index: i,
        title: r.title,
        assigned_to: r.assigned_to,
    }));

    const existingItemsSummary = existingItems.map((e) => ({
        id: e.id,
        title: e.title,
        assigned_to: e.assigned_to,
    }));

    const systemPrompt = `You identify duplicate action items.

You will receive two lists:
1. "new_items" — action items just extracted from a transcript (each has an "index", "title", and "assigned_to")
2. "existing_items" — action items that already exist in the database (each has an "id", "title", and "assigned_to")

For each new item, determine if it is semantically a duplicate of an existing item. An item is a duplicate if:
- Its title describes essentially the same task (not just similar words — the SAME intended action)
- AND it is assigned to the same person (or both are unassigned)

Return a JSON object mapping new item index (as a number) to the existing item's "id" string.
Only include entries for items that ARE duplicates. If a new item is not a duplicate, omit it.

Example: { "0": "abc-123", "3": "def-456" }

Return ONLY valid JSON, no markdown fences or extra text. If no duplicates, return {}.`;

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 2048,
            system: systemPrompt,
            messages: [
                {
                    role: 'user',
                    content: JSON.stringify({
                        new_items: newItemsSummary,
                        existing_items: existingItemsSummary,
                    }),
                },
            ],
        }),
    });

    const data = (await anthropicRes.json()) as { content?: { text?: string }[] };
    const rawText: string = data.content?.[0]?.text ?? '{}';

    try {
        const parsed = JSON.parse(rawText) as Record<string, string>;
        // Convert string keys to number keys
        const result: Record<number, string> = {};
        for (const [key, value] of Object.entries(parsed)) {
            const idx = parseInt(key, 10);
            if (!isNaN(idx) && typeof value === 'string') {
                result[idx] = value;
            }
        }
        return result;
    } catch {
        console.error('Dedup Claude response not valid JSON:', rawText);
        return {}; // Fail open — treat everything as non-duplicate
    }
}
