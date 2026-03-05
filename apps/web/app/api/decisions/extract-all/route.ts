import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getServerSupabase } from '../../../../lib/supabase';
import {
    extractDecisionsFromTranscript,
    buildDecisionInsertionRows,
} from '@meet-pipeline/shared';
import type { TranscriptForDecisionExtraction } from '@meet-pipeline/shared';

export const dynamic = 'force-dynamic';

/** Wait ms milliseconds. */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Delay between Claude API calls (in ms).
 *
 * With a 30k input TPM limit, a typical 3000-word transcript uses ~4k tokens.
 * At 20s intervals, that's ~12k TPM — well under the limit even for long transcripts.
 */
const THROTTLE_MS = 20_000;

/** Max retries when we hit a 429 rate-limit error. */
const MAX_RETRIES = 5;

/**
 * POST /api/decisions/extract-all
 *
 * Bulk-extract decisions from every unprocessed transcript.
 *
 * Uses Server-Sent Events (SSE) to stream real-time progress to the client,
 * so the UI can show which transcript is being processed instead of appearing stuck.
 */
export async function POST() {
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
        return NextResponse.json(
            { error: 'ANTHROPIC_API_KEY is not configured' },
            { status: 503 },
        );
    }

    const supabase = getServerSupabase();

    // ── 1. Find unprocessed transcripts ─────────────
    const { data: allTranscripts, error: txErr } = await supabase
        .from('transcripts')
        .select('id, meeting_title, meeting_date, raw_transcript, participants')
        .order('meeting_date', { ascending: true });

    if (txErr) {
        return NextResponse.json({ error: txErr.message }, { status: 500 });
    }

    const { data: existingDecisions, error: decErr } = await supabase
        .from('decisions')
        .select('transcript_id')
        .eq('created_by', 'ai');

    if (decErr) {
        return NextResponse.json({ error: decErr.message }, { status: 500 });
    }

    const hasDecisions = new Set(
        (existingDecisions ?? []).map((r: any) => r.transcript_id).filter(Boolean),
    );

    const { data: previousAttempts } = await supabase
        .from('activity_log')
        .select('metadata')
        .eq('event_type', 'decision_extraction_attempted');

    const previouslyAttempted = new Set<string>();
    for (const row of previousAttempts ?? []) {
        const meta = row.metadata as Record<string, unknown> | null;
        if (meta?.transcript_id && typeof meta.transcript_id === 'string') {
            previouslyAttempted.add(meta.transcript_id);
        }
    }

    const unprocessed = (allTranscripts ?? []).filter(
        (t: any) => !hasDecisions.has(t.id) && !previouslyAttempted.has(t.id),
    ) as TranscriptForDecisionExtraction[];

    const skippedCount = (allTranscripts ?? []).length - unprocessed.length;

    if (unprocessed.length === 0) {
        return NextResponse.json({
            transcripts_processed: 0,
            transcripts_skipped: skippedCount,
            transcripts_empty: 0,
            transcripts_failed: 0,
            decisions_extracted: 0,
        });
    }

    // ── 2. Stream progress via SSE ──────────────────
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            /** Send a JSON event line to the client. */
            const send = (event: Record<string, unknown>) => {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
            };

            send({
                type: 'start',
                total: unprocessed.length,
                skipped: skippedCount,
            });

            const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
            let totalExtracted = 0;
            let emptyCount = 0;
            let failedCount = 0;
            let processedCount = 0;

            for (let i = 0; i < unprocessed.length; i++) {
                const transcript = unprocessed[i];

                // Throttle between transcripts
                if (i > 0) {
                    send({
                        type: 'waiting',
                        index: i + 1,
                        total: unprocessed.length,
                        seconds: THROTTLE_MS / 1000,
                        title: transcript.meeting_title,
                    });
                    await sleep(THROTTLE_MS);
                }

                send({
                    type: 'processing',
                    index: i + 1,
                    total: unprocessed.length,
                    title: transcript.meeting_title,
                    id: transcript.id,
                });

                // Extract decisions via Claude with retry on rate limit
                let extracted: Awaited<ReturnType<typeof extractDecisionsFromTranscript>> | null = null;
                for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                    try {
                        extracted = await extractDecisionsFromTranscript(transcript, anthropicKey);
                        break;
                    } catch (err) {
                        const msg = err instanceof Error ? err.message : String(err);
                        const isRateLimit = msg.includes('429') || msg.toLowerCase().includes('rate_limit');

                        if (isRateLimit && attempt < MAX_RETRIES) {
                            // Progressive backoff: 30s, 60s, 90s, 120s
                            const backoff = 30_000 * attempt;
                            send({
                                type: 'rate_limited',
                                index: i + 1,
                                attempt,
                                maxRetries: MAX_RETRIES,
                                backoffSeconds: backoff / 1000,
                                title: transcript.meeting_title,
                            });
                            console.warn(`[Decision-Extract-All] Rate limited (attempt ${attempt}/${MAX_RETRIES}) for ${transcript.id} — waiting ${backoff / 1000}s`);
                            await sleep(backoff);
                            continue;
                        }

                        console.error(`[Decision-Extract-All] Failed ${transcript.id} (attempt ${attempt}/${MAX_RETRIES}):`, msg);
                        send({
                            type: 'error',
                            index: i + 1,
                            title: transcript.meeting_title,
                            error: isRateLimit ? 'Rate limit exhausted after retries' : msg.slice(0, 200),
                        });
                        break;
                    }
                }

                if (extracted === null) {
                    failedCount++;
                    continue;
                }

                if (extracted.length === 0) {
                    emptyCount++;
                    await supabase.from('activity_log').insert({
                        event_type: 'decision_extraction_attempted',
                        entity_type: 'transcript',
                        entity_id: transcript.id,
                        actor: 'system',
                        summary: `Decision extraction found 0 decisions in: ${transcript.meeting_title}`,
                        metadata: { transcript_id: transcript.id, decisions_found: 0, result: 'empty' },
                    });
                    send({
                        type: 'empty',
                        index: i + 1,
                        title: transcript.meeting_title,
                    });
                    continue;
                }

                processedCount++;

                // Build rows, embed, insert
                const rows = buildDecisionInsertionRows(extracted, {
                    id: transcript.id,
                    meeting_date: transcript.meeting_date,
                    participants: transcript.participants,
                });

                const texts = rows.map(r => r.decision_text as string);
                const embeddingRes = await openai.embeddings.create({
                    model: 'text-embedding-3-small',
                    input: texts,
                });
                for (let j = 0; j < rows.length; j++) {
                    rows[j].embedding = embeddingRes.data[j].embedding;
                }

                const { data: inserted, error: insertErr } = await supabase
                    .from('decisions')
                    .insert(rows)
                    .select();

                if (insertErr) {
                    console.error(`[Decision-Extract-All] Insert failed for ${transcript.id}:`, insertErr.message);
                    failedCount++;
                    send({ type: 'error', index: i + 1, title: transcript.meeting_title, error: insertErr.message });
                    continue;
                }

                const insertedItems = inserted ?? [];
                totalExtracted += insertedItems.length;

                // Log activity
                const activityRows = insertedItems.map((item: any) => ({
                    event_type: 'decision_extracted',
                    entity_type: 'decision',
                    entity_id: item.id,
                    actor: 'system',
                    summary: `AI extracted decision (bulk): ${item.decision_text.slice(0, 80)}...`,
                    metadata: { transcript_id: transcript.id, domain: item.domain, confidence: item.confidence, bulk: true },
                }));
                if (activityRows.length > 0) {
                    await supabase.from('activity_log').insert(activityRows);
                }

                send({
                    type: 'extracted',
                    index: i + 1,
                    title: transcript.meeting_title,
                    count: insertedItems.length,
                    totalSoFar: totalExtracted,
                });
            }

            // Final summary
            send({
                type: 'done',
                transcripts_processed: processedCount,
                transcripts_skipped: skippedCount,
                transcripts_empty: emptyCount,
                transcripts_failed: failedCount,
                decisions_extracted: totalExtracted,
            });

            controller.close();
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
        },
    });
}
