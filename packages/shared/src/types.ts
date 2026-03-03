/** Method used to extract transcript content from the email. */
export type ExtractionMethod = 'inline' | 'google_doc' | 'attachment';

/** Status of a processing log entry. */
export type LogStatus = 'success' | 'skipped' | 'error';

/**
 * A fully normalized meeting transcript record.
 * This is the canonical shape stored in the `transcripts` table.
 */
export interface MeetingTranscript {
    /** Format: YYYY-MM-DD_meeting-title-slug */
    transcript_id: string;
    meeting_title: string;
    /** ISO 8601 date string */
    meeting_date: string;
    /** Speaker names parsed from transcript body */
    participants: string[];
    /** Full cleaned transcript text */
    raw_transcript: string;
    /** Gmail message ID — used for deduplication */
    source_email_id: string;
    extraction_method: ExtractionMethod;
    word_count: number;
    /** ISO 8601 timestamp */
    processed_at: string;
}

/**
 * A single chunk of transcript text with its embedding vector.
 * Stored in the `transcript_chunks` table for RAG retrieval.
 */
export interface TranscriptChunk {
    id: string;
    transcript_id: string;
    meeting_title: string;
    meeting_date: string;
    participants: string[];
    chunk_index: number;
    total_chunks: number;
    text: string;
    /** 1536-dimensional vector from text-embedding-3-small */
    embedding: number[];
    token_estimate: number;
    created_at: string;
}

/**
 * An entry in the `processing_log` table tracking every
 * email the worker processes (or skips / fails on).
 */
export interface ProcessingLogEntry {
    id: string;
    source_email_id: string;
    email_subject: string;
    status: LogStatus;
    extraction_method: ExtractionMethod | null;
    error_message: string | null;
    processed_at: string;
}

/** Payload sent to the `/api/query` endpoint. */
export interface QueryRequest {
    question: string;
    /** If provided, scope the search to this single transcript. */
    transcript_id?: string;
}

/** A single source chunk returned alongside the AI answer. */
export interface SourceChunk {
    chunk_id: string;
    transcript_id: string;
    meeting_title: string;
    meeting_date: string;
    text: string;
    similarity: number;
}

/** Response from the `/api/query` endpoint. */
export interface QueryResponse {
    answer: string;
    sources: SourceChunk[];
}
