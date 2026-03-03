import type { MeetingTranscript, ProcessingLogEntry, QueryResponse } from '@meet-pipeline/shared';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

/**
 * Typed fetch wrapper with error handling.
 */
async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${APP_URL}${path}`, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
    });

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`API ${res.status}: ${body}`);
    }

    return res.json() as Promise<T>;
}

/** Fetch all transcripts. */
export function fetchTranscripts(): Promise<MeetingTranscript[]> {
    return apiFetch('/api/transcripts');
}

/** Fetch a single transcript by ID. */
export function fetchTranscript(id: string): Promise<MeetingTranscript> {
    return apiFetch(`/api/transcripts/${encodeURIComponent(id)}`);
}

/** Fetch processing logs. */
export function fetchLogs(): Promise<ProcessingLogEntry[]> {
    return apiFetch('/api/logs');
}

/** Send a natural language query. */
export function askQuestion(question: string, transcriptId?: string): Promise<QueryResponse> {
    return apiFetch('/api/query', {
        method: 'POST',
        body: JSON.stringify({ question, transcript_id: transcriptId }),
    });
}
