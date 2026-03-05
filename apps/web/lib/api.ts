import type {
    MeetingTranscript,
    ProcessingLogEntry,
    QueryResponse,
    ActionItem,
    ActivityLogEntry,
    Decision,
} from '@meet-pipeline/shared';

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

/** Fetch action items with optional filters and sorting. */
export function fetchActionItems(filters?: {
    status?: string;
    assigned_to?: string;
    transcript_id?: string;
    priority?: string;
    sort?: 'created_at' | 'due_date' | 'priority';
    order?: 'asc' | 'desc';
}): Promise<ActionItem[]> {
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    if (filters?.assigned_to) params.set('assigned_to', filters.assigned_to);
    if (filters?.transcript_id) params.set('transcript_id', filters.transcript_id);
    if (filters?.priority) params.set('priority', filters.priority);
    if (filters?.sort) params.set('sort', filters.sort);
    if (filters?.order) params.set('order', filters.order);
    const qs = params.toString();
    return apiFetch(`/api/action-items${qs ? `?${qs}` : ''}`);
}

/** Fetch a single action item by ID. */
export function fetchActionItem(id: string): Promise<ActionItem> {
    return apiFetch(`/api/action-items/${encodeURIComponent(id)}`);
}

/** Create a new action item. */
export function createActionItem(item: Partial<ActionItem>): Promise<ActionItem> {
    return apiFetch('/api/action-items', {
        method: 'POST',
        body: JSON.stringify(item),
    });
}

/** Update an action item by ID. */
export function updateActionItem(id: string, updates: Partial<ActionItem>): Promise<ActionItem> {
    return apiFetch(`/api/action-items/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
    });
}

/** Soft-delete an action item (sets status to 'dismissed'). */
export function dismissActionItem(id: string): Promise<ActionItem> {
    return apiFetch(`/api/action-items/${encodeURIComponent(id)}`, {
        method: 'DELETE',
    });
}

/** Delete a transcript and all its related data. */
export function deleteTranscript(id: string): Promise<{ success: boolean }> {
    return apiFetch(`/api/transcripts/${encodeURIComponent(id)}`, {
        method: 'DELETE',
    });
}

/** Trigger AI extraction of action items from a transcript. */
export function extractActionItems(transcriptId: string): Promise<{ items: ActionItem[]; count: number }> {
    return apiFetch('/api/action-items/extract', {
        method: 'POST',
        body: JSON.stringify({ transcript_id: transcriptId }),
    });
}

/** Fetch activity log entries with pagination and optional event_type filter. */
export function fetchActivity(options?: {
    limit?: number;
    offset?: number;
    event_type?: string;
}): Promise<ActivityLogEntry[]> {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));
    if (options?.event_type) params.set('event_type', options.event_type);
    const qs = params.toString();
    return apiFetch(`/api/activity${qs ? `?${qs}` : ''}`);
}

// ── Decisions ───────────────────────────────────

/** Fetch decisions with optional filters. */
export function fetchDecisions(filters?: {
    domain?: string;
    status?: string;
    confidence?: string;
    search?: string;
    sort?: 'decided_at' | 'created_at';
    order?: 'asc' | 'desc';
    limit?: number;
}): Promise<Decision[]> {
    const params = new URLSearchParams();
    if (filters?.domain) params.set('domain', filters.domain);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.confidence) params.set('confidence', filters.confidence);
    if (filters?.search) params.set('search', filters.search);
    if (filters?.sort) params.set('sort', filters.sort);
    if (filters?.order) params.set('order', filters.order);
    if (filters?.limit) params.set('limit', String(filters.limit));
    const qs = params.toString();
    return apiFetch(`/api/decisions${qs ? `?${qs}` : ''}`);
}

/** Fetch a single decision by ID. */
export function fetchDecision(id: string): Promise<Decision> {
    return apiFetch(`/api/decisions/${encodeURIComponent(id)}`);
}

/** Create a decision manually. */
export function createDecision(decision: Partial<Decision>): Promise<Decision> {
    return apiFetch('/api/decisions', {
        method: 'POST',
        body: JSON.stringify(decision),
    });
}

/** Update a decision by ID. */
export function updateDecision(id: string, updates: Partial<Decision>): Promise<Decision> {
    return apiFetch(`/api/decisions/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
    });
}

/** Trigger AI extraction of decisions from a transcript. */
export function extractDecisions(transcriptId: string): Promise<{ decisions: Decision[]; count: number }> {
    return apiFetch('/api/decisions/extract', {
        method: 'POST',
        body: JSON.stringify({ transcript_id: transcriptId }),
    });
}

/** Trigger batch extraction of decisions from all unprocessed transcripts. */
export function extractAllDecisions(): Promise<{
    transcripts_processed: number;
    transcripts_skipped: number;
    transcripts_empty: number;
    transcripts_failed: number;
    decisions_extracted: number;
}> {
    return apiFetch('/api/decisions/extract-all', { method: 'POST' });
}

