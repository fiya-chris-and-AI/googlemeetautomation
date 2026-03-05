import type { MeetingTranscript, TranscriptChunk, ProcessingLogEntry, LogStatus, ExtractionMethod } from '@meet-pipeline/shared';
import { getSupabaseClient } from './supabase.js';

/**
 * Check whether we've already processed an email, preventing duplicate work.
 */
export async function isDuplicate(sourceEmailId: string): Promise<boolean> {
    const { data } = await getSupabaseClient()
        .from('transcripts')
        .select('id')
        .eq('source_email_id', sourceEmailId)
        .limit(1);

    return (data?.length ?? 0) > 0;
}

/**
 * Insert a fully normalized transcript record.
 */
export async function insertTranscript(transcript: MeetingTranscript): Promise<void> {
    const { error } = await getSupabaseClient()
        .from('transcripts')
        .insert({
            id: transcript.transcript_id,
            meeting_title: transcript.meeting_title,
            meeting_date: transcript.meeting_date,
            participants: transcript.participants,
            raw_transcript: transcript.raw_transcript,
            source_email_id: transcript.source_email_id,
            extraction_method: transcript.extraction_method,
            word_count: transcript.word_count,
            processed_at: transcript.processed_at,
        });

    if (error) {
        throw new Error(`Failed to insert transcript: ${error.message}`);
    }
}

/**
 * Insert an array of embedded chunks in a single batch.
 */
export async function insertChunks(chunks: TranscriptChunk[]): Promise<void> {
    const rows = chunks.map((c) => ({
        id: c.id,
        transcript_id: c.transcript_id,
        meeting_title: c.meeting_title,
        meeting_date: c.meeting_date,
        participants: c.participants,
        chunk_index: c.chunk_index,
        total_chunks: c.total_chunks,
        text: c.text,
        embedding: c.embedding,
        token_estimate: c.token_estimate,
    }));

    const { error } = await getSupabaseClient()
        .from('transcript_chunks')
        .insert(rows);

    if (error) {
        throw new Error(`Failed to insert chunks: ${error.message}`);
    }
}

/**
 * Write a processing log entry (success, skipped, or error).
 * The `sourceSender` field is optional — if the `source_sender` column
 * doesn't exist in the table, Supabase will ignore it gracefully.
 */
export async function logProcessing(params: {
    sourceEmailId: string;
    emailSubject: string;
    status: LogStatus;
    extractionMethod?: ExtractionMethod | null;
    errorMessage?: string | null;
    sourceSender?: string | null;
}): Promise<void> {
    const { error } = await getSupabaseClient()
        .from('processing_log')
        .insert({
            source_email_id: params.sourceEmailId,
            email_subject: params.emailSubject,
            status: params.status,
            extraction_method: params.extractionMethod ?? null,
            error_message: params.errorMessage ?? null,
            source_sender: params.sourceSender ?? null,
        });

    if (error) {
        console.error('Failed to write processing log:', error.message);
    }
}

/**
 * Fetch all transcripts, newest first.
 */
export async function getTranscripts(limit = 50): Promise<MeetingTranscript[]> {
    const { data, error } = await getSupabaseClient()
        .from('transcripts')
        .select('*')
        .order('meeting_date', { ascending: false })
        .limit(limit);

    if (error) throw new Error(`Failed to fetch transcripts: ${error.message}`);

    return (data ?? []).map(mapRowToTranscript);
}

/**
 * Fetch a single transcript by ID.
 */
export async function getTranscriptById(id: string): Promise<MeetingTranscript | null> {
    const { data, error } = await getSupabaseClient()
        .from('transcripts')
        .select('*')
        .eq('id', id)
        .single();

    if (error) return null;
    return data ? mapRowToTranscript(data) : null;
}

/**
 * Fetch all processing log entries, newest first.
 */
export async function getProcessingLogs(limit = 100): Promise<ProcessingLogEntry[]> {
    const { data, error } = await getSupabaseClient()
        .from('processing_log')
        .select('*')
        .order('processed_at', { ascending: false })
        .limit(limit);

    if (error) throw new Error(`Failed to fetch logs: ${error.message}`);

    return (data ?? []) as ProcessingLogEntry[];
}

/**
 * Call the match_chunks RPC function for similarity search.
 */
export async function matchChunks(
    queryEmbedding: number[],
    matchCount = 10,
    matchThreshold = 0.3,
    transcriptId?: string
): Promise<Array<{
    id: string;
    transcript_id: string;
    meeting_title: string;
    meeting_date: string;
    text: string;
    similarity: number;
}>> {
    const { data, error } = await getSupabaseClient()
        .rpc('match_chunks', {
            query_embedding: queryEmbedding,
            match_count: matchCount,
            match_threshold: matchThreshold,
            filter_transcript_id: transcriptId ?? null,
        });

    if (error) throw new Error(`match_chunks RPC failed: ${error.message}`);
    return data ?? [];
}

// ── Helpers ──

/** Maps a raw Supabase row to our canonical interface. */
function mapRowToTranscript(row: Record<string, unknown>): MeetingTranscript {
    return {
        transcript_id: row['id'] as string,
        meeting_title: row['meeting_title'] as string,
        meeting_date: row['meeting_date'] as string,
        participants: row['participants'] as string[],
        raw_transcript: row['raw_transcript'] as string,
        source_email_id: row['source_email_id'] as string,
        extraction_method: row['extraction_method'] as MeetingTranscript['extraction_method'],
        word_count: row['word_count'] as number,
        processed_at: row['processed_at'] as string,
    };
}
