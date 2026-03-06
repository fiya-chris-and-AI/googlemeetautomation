/**
 * Fire-and-forget decision extraction.
 *
 * Call this after processUpload() to automatically extract decisions
 * from a newly uploaded transcript. It never throws — errors are logged
 * silently so the upload flow is never blocked.
 *
 * Unlike action items, decisions require OpenAI embeddings before insertion
 * (the decisions table has a vector(1536) column used by match_decisions()).
 */
import OpenAI from 'openai';
import { getServerSupabase } from './supabase';
import {
    extractDecisionsFromTranscript,
    buildDecisionInsertionRows,
} from '@meet-pipeline/shared';
import type { TranscriptForDecisionExtraction } from '@meet-pipeline/shared';

/**
 * Extract decisions from a transcript, generate embeddings, and insert them.
 * This function catches all errors internally — it will never throw.
 */
export async function autoExtractDecisions(transcriptId: string): Promise<void> {
    const tag = '[auto-extract-decisions]';

    try {
        const geminiKey = process.env.GEMINI_API_KEY;
        const openaiKey = process.env.OPENAI_API_KEY;

        if (!geminiKey) {
            console.warn(`${tag} GEMINI_API_KEY not set — skipping extraction`);
            return;
        }
        if (!openaiKey) {
            console.warn(`${tag} OPENAI_API_KEY not set — skipping extraction (embeddings required)`);
            return;
        }

        const supabase = getServerSupabase();

        // Guard: skip if this transcript already has decisions (prevents duplicates
        // from race conditions when upload and summarize both trigger extraction)
        const { count: existingCount } = await supabase
            .from('decisions')
            .select('id', { count: 'exact', head: true })
            .eq('transcript_id', transcriptId);

        if ((existingCount ?? 0) > 0) {
            console.log(`${tag} Transcript ${transcriptId} already has ${existingCount} decisions — skipping`);
            return;
        }

        // 1. Fetch the transcript (includes meeting_date for buildDecisionInsertionRows)
        const { data: transcript, error: txErr } = await supabase
            .from('transcripts')
            .select('id, meeting_title, meeting_date, raw_transcript, participants')
            .eq('id', transcriptId)
            .single();

        if (txErr || !transcript) {
            console.error(`${tag} Transcript not found: ${transcriptId}`);
            return;
        }

        console.log(`${tag} Extracting from: ${transcript.meeting_title}`);

        // 2. Call Gemini to extract decisions
        const extracted = await extractDecisionsFromTranscript(
            transcript as TranscriptForDecisionExtraction,
            geminiKey,
        );

        if (extracted.length === 0) {
            console.log(`${tag} No decisions found in: ${transcript.meeting_title}`);
            // Log so extract-all / summarize doesn't retry this transcript later
            await supabase.from('activity_log').insert({
                event_type: 'decision_extraction_attempted',
                entity_type: 'transcript',
                entity_id: transcriptId,
                actor: 'system',
                summary: `Auto-extraction found 0 decisions in: ${transcript.meeting_title}`,
                metadata: { transcript_id: transcriptId, items_found: 0, result: 'empty', auto: true },
            });
            return;
        }

        // 3. Build insertion rows
        const rows = buildDecisionInsertionRows(extracted, {
            id: transcript.id,
            meeting_date: transcript.meeting_date,
            participants: transcript.participants ?? [],
        });

        // 4. Generate embeddings for each decision_text (required for semantic search)
        const openai = new OpenAI({ apiKey: openaiKey });
        const texts = rows.map(r => r.decision_text as string);
        const embeddingRes = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: texts,
        });
        for (let i = 0; i < rows.length; i++) {
            rows[i].embedding = embeddingRes.data[i].embedding;
        }

        // 5. Bulk-insert into decisions table
        const { data: inserted, error: insertErr } = await supabase
            .from('decisions')
            .insert(rows)
            .select();

        if (insertErr) {
            console.error(`${tag} Insert failed for ${transcriptId}:`, insertErr.message);
            return;
        }

        const insertedItems = inserted ?? [];
        console.log(`${tag} Inserted ${insertedItems.length} decisions from: ${transcript.meeting_title}`);

        // 6. Log each creation to activity_log
        const activityRows = insertedItems.map((item: any) => ({
            event_type: 'decision_extracted',
            entity_type: 'decision',
            entity_id: item.id,
            actor: 'system',
            summary: `AI auto-extracted decision: ${item.decision_text.slice(0, 80)}...`,
            metadata: {
                transcript_id: transcriptId,
                domain: item.domain,
                confidence: item.confidence,
                auto: true,
            },
        }));

        if (activityRows.length > 0) {
            await supabase.from('activity_log').insert(activityRows);
        }
    } catch (err) {
        // Never propagate — upload must succeed even if extraction fails
        console.error(`${tag} Failed for ${transcriptId}:`, err);
    }
}
