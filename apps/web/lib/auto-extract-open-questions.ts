/**
 * Fire-and-forget open question extraction.
 *
 * Call this after processUpload() or summarize to automatically extract
 * open questions from a transcript. It never throws — errors are logged
 * silently so the upload/summary flow is never blocked.
 *
 * Follows the same pattern as auto-extract.ts and auto-extract-decisions.ts.
 * Unlike decisions, open questions do NOT require embeddings.
 */
import { getServerSupabase } from './supabase';
import {
    extractOpenQuestionsFromTranscript,
    buildOpenQuestionInsertionRows,
} from '@meet-pipeline/shared';
import type { TranscriptForOpenQuestionExtraction } from '@meet-pipeline/shared';

/**
 * Extract open questions from a transcript and insert them into the database.
 * This function catches all errors internally — it will never throw.
 */
export async function autoExtractOpenQuestions(transcriptId: string): Promise<void> {
    const tag = '[auto-extract-open-questions]';

    try {
        const geminiKey = process.env.GEMINI_API_KEY;
        if (!geminiKey) {
            console.warn(`${tag} GEMINI_API_KEY not set — skipping extraction`);
            return;
        }

        const supabase = getServerSupabase();

        // Guard: skip if this transcript already has open questions
        const { count: existingCount } = await supabase
            .from('open_questions')
            .select('id', { count: 'exact', head: true })
            .eq('transcript_id', transcriptId);

        if ((existingCount ?? 0) > 0) {
            console.log(`${tag} Transcript ${transcriptId} already has ${existingCount} open questions — skipping`);
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

        // 2. Call Gemini to extract open questions
        const extracted = await extractOpenQuestionsFromTranscript(
            transcript as TranscriptForOpenQuestionExtraction,
            geminiKey,
        );

        if (extracted.length === 0) {
            console.log(`${tag} No open questions found in: ${transcript.meeting_title}`);
            // Log so summarize doesn't retry this transcript later
            await supabase.from('activity_log').insert({
                event_type: 'open_question_extraction_attempted',
                entity_type: 'transcript',
                entity_id: transcriptId,
                actor: 'system',
                summary: `Auto-extraction found 0 open questions in: ${transcript.meeting_title}`,
                metadata: { transcript_id: transcriptId, items_found: 0, result: 'empty', auto: true },
            });
            return;
        }

        // 3. Build rows and insert
        const rows = buildOpenQuestionInsertionRows(extracted, transcriptId);

        const { data: inserted, error: insertErr } = await supabase
            .from('open_questions')
            .insert(rows)
            .select();

        if (insertErr) {
            console.error(`${tag} Insert failed for ${transcriptId}:`, insertErr.message);
            return;
        }

        const insertedItems = inserted ?? [];
        console.log(`${tag} Inserted ${insertedItems.length} open questions from: ${transcript.meeting_title}`);

        // 4. Log each creation to activity_log
        const activityRows = insertedItems.map((item: any) => ({
            event_type: 'open_question_extracted',
            entity_type: 'open_question',
            entity_id: item.id,
            actor: 'system',
            summary: `AI auto-extracted open question: ${item.question_text.slice(0, 80)}...`,
            metadata: {
                transcript_id: transcriptId,
                topic: item.topic,
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
