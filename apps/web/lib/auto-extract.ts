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
        const anthropicKey = process.env.ANTHROPIC_API_KEY;
        if (!anthropicKey) {
            console.warn(`${tag} ANTHROPIC_API_KEY not set — skipping extraction`);
            return;
        }

        const supabase = getServerSupabase();

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

        // 2. Call Claude
        const extracted = await extractActionItemsFromTranscript(
            transcript as TranscriptForExtraction,
            anthropicKey,
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
    } catch (err) {
        // Never propagate — upload must succeed even if extraction fails
        console.error(`${tag} Failed for ${transcriptId}:`, err);
    }
}
