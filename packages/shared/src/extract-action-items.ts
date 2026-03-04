/**
 * Shared logic for AI-powered action item extraction from transcripts.
 *
 * Used by both the single-transcript and bulk extraction API routes
 * to avoid duplicating prompts, parsing, and normalization logic.
 */
import { normalizeAssignee } from './normalize-assignee';

// ── Claude system prompt ────────────────────────

export const EXTRACTION_SYSTEM_PROMPT = `You extract action items from meeting transcripts.
Return a JSON array of objects with these fields:
- title (string, required): A concise description of the action item
- description (string | null): Additional context if needed
- assigned_to (string | null): The person responsible. MUST be exactly one of: "Lutfiya Miller", "Chris Müller", or null. Never use alternate spellings like "Chris-Steven Müller", "Chris Muller", or "Chris Mueller". If the task is assigned to BOTH people, emit two separate action items — one for each person. Never use composite values like "Both" or "Lutfiya Miller and Chris Müller".
- priority ("low" | "medium" | "high" | "urgent"): Infer from context and urgency cues
- due_date (string | null): ISO date if a deadline is mentioned, otherwise null
- source_text (string): The exact excerpt from the transcript that implies this action item
- group_label (string | null): A short label (1-3 words, title-cased) for the project, tool, or topic this item relates to. Use null if it doesn't clearly belong to a group. If multiple items relate to the same topic, give them the same label.
- effort ("quick_fix" | "moderate" | "significant"): Estimate the effort required to complete this task:
  • "quick_fix" — Can likely be done in under 30 minutes (e.g. sending an email, a quick decision, looking something up)
  • "moderate" — Likely takes 30 minutes to a few hours (e.g. writing a short document, setting up a tool, a focused work session)
  • "significant" — Likely takes multiple hours or spans multiple days (e.g. building a feature, conducting research, coordinating across people)
  Base this on the nature of the task described in the transcript, not on its urgency or priority.

Only return action items that are clearly implied by the transcript — do not fabricate tasks.
If there are no action items, return an empty array.
Return ONLY valid JSON, no markdown fences or extra text.`;

// ── Types ───────────────────────────────────────

/** Shape of a single extracted item from Claude (pre-normalization). */
export interface RawExtractedItem {
    title: string;
    description?: string | null;
    assigned_to?: string | null;
    priority?: string;
    due_date?: string | null;
    source_text?: string;
    group_label?: string | null;
    effort?: string;
}

/** Transcript fields needed for extraction. */
export interface TranscriptForExtraction {
    id: string;
    meeting_title: string;
    raw_transcript: string;
    participants: string[];
}

// ── Core extraction call ────────────────────────

/**
 * Call Claude to extract action items from a single transcript's text.
 * Returns the raw parsed array (may be empty).
 *
 * Throws on network / parsing errors so callers can handle them.
 */
export async function extractActionItemsFromTranscript(
    transcript: TranscriptForExtraction,
    anthropicKey: string,
): Promise<RawExtractedItem[]> {
    // Guard against null participants (some transcripts may have null instead of [])
    const participants = transcript.participants ?? [];

    const requestBody = {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: EXTRACTION_SYSTEM_PROMPT,
        messages: [
            {
                role: 'user',
                content: `Meeting: ${transcript.meeting_title}\nParticipants: ${participants.join(', ')}\n\nTranscript:\n${transcript.raw_transcript}`,
            },
        ],
    };

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(requestBody),
    });

    if (!anthropicRes.ok) {
        const errorBody = await anthropicRes.text();
        console.error(`[extract-helper] Claude API error ${anthropicRes.status}: ${errorBody}`);
        throw new Error(`Claude API returned ${anthropicRes.status}: ${errorBody}`);
    }

    const data = (await anthropicRes.json()) as { content?: { text?: string }[] };
    const rawText: string = data.content?.[0]?.text ?? '[]';

    console.log(`[extract-helper] Claude response for "${transcript.meeting_title}": ${rawText.slice(0, 200)}...`);

    const extracted: RawExtractedItem[] = JSON.parse(rawText);
    if (!Array.isArray(extracted)) return [];

    console.log(`[extract-helper] Extracted ${extracted.length} items from "${transcript.meeting_title}"`);
    return extracted;
}

// ── Row builder ─────────────────────────────────

/**
 * Normalize assignees and build database insertion rows from raw extracted items.
 *
 * Joint assignments are split into separate rows (one per person).
 * Optional `overrides` are merged onto every row (e.g. `is_duplicate`, `duplicate_of`).
 */
export function buildInsertionRows(
    extracted: RawExtractedItem[],
    transcriptId: string,
    overrides?: Record<string, unknown>,
): Record<string, unknown>[] {
    const rows: Record<string, unknown>[] = [];

    for (const item of extracted) {
        const assignees = normalizeAssignee(item.assigned_to);
        const names = assignees.length > 0 ? assignees : [null];

        for (const name of names) {
            rows.push({
                transcript_id: transcriptId,
                title: item.title,
                description: item.description ?? null,
                assigned_to: name,
                status: 'open',
                priority: item.priority ?? 'medium',
                due_date: item.due_date ?? null,
                source_text: item.source_text ?? null,
                created_by: 'ai',
                group_label: item.group_label ?? null,
                effort: item.effort ?? null,
                ...overrides,
            });
        }
    }

    return rows;
}
