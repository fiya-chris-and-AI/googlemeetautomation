/**
 * Fire-and-forget action item extraction.
 *
 * Call this after processUpload() to automatically extract action items
 * from a newly uploaded transcript. It never throws — errors are logged
 * silently so the upload flow is never blocked.
 */
import { getServerSupabase } from './supabase';
import {
    extractActionItemsFromTranscript,
    buildInsertionRows,
} from '@meet-pipeline/shared';
import type { TranscriptForExtraction } from '@meet-pipeline/shared';

/**
 * Extract action items from a transcript and insert them into the database.
 * This function catches all errors internally — it will never throw.
 */
export async function autoExtractActionItems(transcriptId: string): Promise<void> {
    const tag = '[auto-extract]';

    try {
        const geminiKey = process.env.GEMINI_API_KEY;
        if (!geminiKey) {
            console.warn(`${tag} GEMINI_API_KEY not set — skipping extraction`);
            return;
        }

        const supabase = getServerSupabase();

        // Guard: skip if this transcript already has action items (prevents duplicates
        // from race conditions when upload and summarize both trigger extraction)
        const { count: existingCount } = await supabase
            .from('action_items')
            .select('id', { count: 'exact', head: true })
            .eq('transcript_id', transcriptId);

        if ((existingCount ?? 0) > 0) {
            console.log(`${tag} Transcript ${transcriptId} already has ${existingCount} action items — skipping`);
            return;
        }

        // 1. Fetch the transcript
        const { data: transcript, error: txErr } = await supabase
            .from('transcripts')
            .select('id, meeting_title, raw_transcript, participants')
            .eq('id', transcriptId)
            .single();

        if (txErr || !transcript) {
            console.error(`${tag} Transcript not found: ${transcriptId}`);
            return;
        }

        console.log(`${tag} Extracting from: ${transcript.meeting_title}`);

        // 2. Call Gemini
        const extracted = await extractActionItemsFromTranscript(
            transcript as TranscriptForExtraction,
            geminiKey,
        );

        if (extracted.length === 0) {
            console.log(`${tag} No action items found in: ${transcript.meeting_title}`);
            // Log so extract-all doesn't retry this transcript later
            await supabase.from('activity_log').insert({
                event_type: 'bulk_extraction_attempted',
                entity_type: 'transcript',
                entity_id: transcriptId,
                actor: 'system',
                summary: `Auto-extraction found 0 items in: ${transcript.meeting_title}`,
                metadata: { transcript_id: transcriptId, items_found: 0, result: 'empty', auto: true },
            });
            return;
        }

        // 3. Build rows and insert
        const rows = buildInsertionRows(extracted, transcriptId);

        const { data: inserted, error: insertErr } = await supabase
            .from('action_items')
            .insert(rows)
            .select();

        if (insertErr) {
            console.error(`${tag} Insert failed for ${transcriptId}:`, insertErr.message);
            return;
        }

        const insertedItems = inserted ?? [];
        console.log(`${tag} Inserted ${insertedItems.length} action items from: ${transcript.meeting_title}`);

        // 4. Log each creation to activity_log
        const activityRows = insertedItems.map((item) => ({
            event_type: 'action_item_created',
            entity_type: 'action_item',
            entity_id: item.id,
            actor: 'system',
            summary: `AI auto-extracted action item: ${item.title}`,
            metadata: {
                transcript_id: transcriptId,
                priority: item.priority,
                assigned_to: item.assigned_to,
                auto: true,
            },
        }));

        if (activityRows.length > 0) {
            await supabase.from('activity_log').insert(activityRows);
        }

        // 5. Fire-and-forget: generate implementation prompts for the new action items
        autoGeneratePrompts(transcriptId).catch(promptErr =>
            console.error(`${tag} Prompt generation failed (non-blocking):`, promptErr),
        );
    } catch (err) {
        // Never propagate — upload must succeed even if extraction fails
        console.error(`${tag} Failed for ${transcriptId}:`, err);
    }
}

/**
 * Auto-generate implementation prompts for all action items from a transcript.
 * Fire-and-forget — errors are caught and logged, never propagated.
 */
async function autoGeneratePrompts(transcriptId: string): Promise<void> {
    const tag = '[auto-prompt]';

    try {
        const geminiKey = process.env.GEMINI_API_KEY;
        if (!geminiKey) return;

        const supabase = getServerSupabase();

        // Fetch items that need prompts (just inserted, so generated_prompt is NULL)
        const { data: items } = await supabase
            .from('action_items')
            .select('id, title, description, assigned_to, priority, effort, due_date, source_text, group_label, created_by, screenshot_alt')
            .eq('transcript_id', transcriptId)
            .is('generated_prompt', null);

        if (!items?.length) return;

        // Fetch transcript context
        const { data: transcript } = await supabase
            .from('transcripts')
            .select('meeting_title, meeting_date, participants, raw_transcript')
            .eq('id', transcriptId)
            .single();

        if (!transcript) return;

        // Fetch related decisions
        const { data: decisions } = await supabase
            .from('decisions')
            .select('decision_text')
            .eq('transcript_id', transcriptId)
            .limit(10);

        const relatedDecisions = (decisions ?? []).map((d: { decision_text: string }) => d.decision_text);

        // Import the batch generator
        const { generatePromptsForBatch } = await import('@meet-pipeline/shared');

        const results = await generatePromptsForBatch(
            items.map(i => ({ ...i, categories: [] as string[] })),
            {
                meeting_title: transcript.meeting_title,
                meeting_date: transcript.meeting_date,
                participants: transcript.participants ?? [],
                raw_transcript: transcript.raw_transcript ?? '',
            },
            relatedDecisions,
            geminiKey,
        );

        // Store all generated prompts
        const now = new Date().toISOString();
        let count = 0;

        for (const [itemId, generated] of results) {
            const { error } = await supabase
                .from('action_items')
                .update({
                    generated_prompt: generated.prompt,
                    prompt_model: generated.model,
                    prompt_generated_at: now,
                    prompt_version: generated.version,
                    updated_at: now,
                })
                .eq('id', itemId);

            if (!error) count++;
        }

        console.log(`${tag} Generated ${count}/${items.length} prompts for transcript ${transcriptId}`);

        await supabase.from('activity_log').insert({
            event_type: 'prompts_auto_generated',
            entity_type: 'action_item',
            entity_id: transcriptId,
            actor: 'system',
            summary: `Auto-generated ${count} implementation prompts for transcript`,
            metadata: { transcript_id: transcriptId, total: items.length, success: count },
        });
    } catch (err) {
        console.error(`${tag} Failed for ${transcriptId}:`, err);
    }
}
