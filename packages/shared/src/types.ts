/** Method used to extract transcript content from the email. */
export type ExtractionMethod = 'inline' | 'google_doc' | 'attachment' | 'upload' | 'pdf_upload' | 'paste';

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

// ── Action Items ────────────────────────────────

export type ActionItemStatus = 'open' | 'in_progress' | 'done' | 'dismissed';
export type ActionItemPriority = 'low' | 'medium' | 'high' | 'urgent';
export type ActionItemCreatedBy = 'ai' | 'manual';

export interface ActionItem {
    id: string;
    transcript_id: string | null;
    title: string;
    description: string | null;
    assigned_to: string | null;
    status: ActionItemStatus;
    priority: ActionItemPriority;
    due_date: string | null;
    source_text: string | null;
    created_by: ActionItemCreatedBy;
    created_at: string;
    updated_at: string;
    completed_at: string | null;
    group_label: string | null;
}

// ── Activity Log ────────────────────────────────

export interface ActivityLogEntry {
    id: string;
    event_type: string;
    entity_type: string | null;
    entity_id: string | null;
    actor: string;
    summary: string;
    metadata: Record<string, unknown>;
    created_at: string;
}

// ── Calendar & Scoreboard ────────────────────────

/** Aggregated stats for a single calendar day. */
export interface DayMeetingSummary {
    date: string;                  // YYYY-MM-DD
    meetings: {
        transcript_id: string;
        title: string;
        participants: string[];
        word_count: number;
        extraction_method: string;
    }[];
    totalMeetings: number;
    totalWords: number;
    uniqueParticipants: string[];
}

/** Monthly/weekly aggregated scoreboard metrics. */
export interface ScoreboardMetrics {
    period: string;                // e.g. "2025-01" or "2025-W03"
    totalMeetings: number;
    totalHours: number;            // estimated from word count (avg ~150 wpm speech)
    totalActionItems: number;
    completedActionItems: number;
    topicsDiscussed: string[];     // unique group_labels from action items
    meetingsByParticipant: Record<string, number>;
    busiestDay: string;            // day of week
    averageMeetingsPerWeek: number;
    actionItemCompletionRate: number; // 0-100
    streakDays: number;            // consecutive days with at least 1 meeting
    // Co-founder pair analysis
    meetingsTogether: number;
    lutfiyaSolo: number;
    chrisSolo: number;
    withExternalGuests: number;
    // Action Item velocity
    actionItemsCreated: number;
    actionItemsCompleted: number;
    // No-meeting weekdays
    freeDays: number;
}

/** Cumulative all-time statistics across all transcripts and action items. */
export interface CumulativeStats {
    totalMeetings: number;
    totalHours: number;              // estimated from word count (totalWords / 150 / 60)
    totalWords: number;
    totalActionItems: number;
    completedActionItems: number;
    actionItemCompletionRate: number; // 0-100
    topicsDiscussed: string[];       // all unique group_labels ever
    uniqueParticipants: string[];    // every participant name ever seen
    meetingsByParticipant: Record<string, number>;
    busiestDay: string;              // all-time busiest day of week
    firstMeetingDate: string | null; // ISO date of earliest transcript
    lastMeetingDate: string | null;  // ISO date of most recent transcript
    totalMonthsActive: number;       // number of distinct YYYY-MM months with meetings
    meetingsTogether: number;
    lutfiyaSolo: number;
    chrisSolo: number;
    withExternalGuests: number;
    averageMeetingsPerMonth: number;
}
