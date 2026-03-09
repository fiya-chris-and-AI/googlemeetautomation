/**
 * Shared logic for AI-powered action item extraction from transcripts.
 *
 * Used by both the single-transcript and bulk extraction API routes
 * to avoid duplicating prompts, parsing, and normalization logic.
 */
import { normalizeAssignee } from './normalize-assignee';
import { callGemini, stripMarkdownFences } from './gemini';

// ── Topic categories ────────────────────────────

/** Fixed set of broad topic categories for action item grouping. */
export const ACTION_ITEM_TOPIC_CATEGORIES = [
    'UI & Design',
    'AI & Automation',
    'Translation',
    'DevOps',
    'Business & Legal',
    'Product Features',
    'Branding & Content',
    'Process & Meetings',
    'Accounts & Access',
    'Data & Analytics',
    'Documentation',
    'Personal',
] as const;

export type ActionItemTopic = (typeof ACTION_ITEM_TOPIC_CATEGORIES)[number];

// ── Gemini system prompt ────────────────────────

export const EXTRACTION_SYSTEM_PROMPT = `You extract action items from meeting transcripts. An action item is a CONCRETE TASK that someone committed to doing or was asked to do.

## What IS an action item (extract these):
- Explicit commitments: "I'll set up the CI pipeline this week"
- Direct assignments: "Chris, can you handle the API integration?"
- Volunteering: "I can take care of the DNS migration"
- Agreed-upon next steps: "OK so next step is we need to write the migration script"
- Follow-ups: "Let's circle back after you've tested the staging deploy"
- Research tasks: "I need to look into whether Vercel supports that"

## What is NOT an action item (do NOT extract these):
- Decisions or agreements ("We'll use Supabase") — this is a DECISION, not a task
- Descriptions of how something works ("The API returns JSON") — this is INFORMATION
- Vague intentions with no owner ("We should probably look into that someday") — too vague
- Past completed work ("I already fixed that yesterday") — ALREADY DONE
- Observations or opinions ("I think the UI looks good") — NOT a task

## The key test:
Ask yourself: "Could someone put this on a to-do list and check it off when done?" If not, skip it. Every action item needs a VERB (build, send, write, set up, investigate, fix, create, update, test, deploy, review, etc.).

Return a JSON array of objects with these fields:
- title (string, required): A concise, actionable description starting with a verb (e.g. "Set up CI/CD pipeline on GitHub Actions", "Research Vercel edge function limits"). Max 15 words.
- description (string | null): Additional context only if the title alone is ambiguous. Usually null.
- assigned_to (string | null): The person responsible. MUST be exactly one of: "Lutfiya Miller", "Chris Müller", or null. Never use alternate spellings like "Chris-Steven Müller", "Chris Muller", or "Chris Mueller". If the task is assigned to BOTH people, emit two separate action items — one for each person. Never use composite values like "Both" or "Lutfiya Miller and Chris Müller". Pay close attention to who VOLUNTEERED or was ASKED — "I'll do X" means the speaker is assigned; "Can you do X?" means the listener is assigned.
- priority ("low" | "medium" | "high" | "urgent"): Infer from urgency cues, deadlines, and blockers. Default to "medium" if unclear.
- due_date (string | null): ISO date if a deadline is mentioned, otherwise null
- source_text (string): The exact excerpt from the transcript (2-4 sentences) that contains or implies this action item.
- group_label (string, required): Classify into exactly one of: "UI & Design", "AI & Automation", "Translation", "DevOps", "Business & Legal", "Product Features", "Branding & Content", "Process & Meetings", "Accounts & Access", "Data & Analytics", "Documentation", "Personal". Pick the single best fit.
- effort ("quick_fix" | "moderate" | "significant"): Estimate effort:
  • "quick_fix" — Under 30 min (send an email, look something up, quick config change)
  • "moderate" — 30 min to a few hours (write a doc, set up a tool, focused work session)
  • "significant" — Multiple hours or days (build a feature, major research, cross-team coordination)

Extraction rules:
- Every extracted item MUST have a clear verb — if you can't phrase it as "Do X", it's not an action item
- Look carefully for implicit commitments: "I'll", "I can", "I need to", "let me", "I'm going to" — these are action items even without explicit assignment language
- Also catch requests: "Can you", "Could you", "Would you mind", "You should" — the person being asked is the assignee
- Most meetings produce 3-10 action items. If you're finding 0, re-read for implicit commitments. If finding more than 15, you may be including decisions or observations.
- If there are genuinely no action items, return an empty array
- Deduplicate: if the same task is mentioned multiple times, extract it only once

Return ONLY valid JSON, no markdown fences or extra text.`;

/**
 * Additional instructions appended to the system prompt when processing
 * WhatsApp conversations (shorter, more informal messages).
 */
export const WHATSAPP_ACTION_ITEM_ADDENDUM = `

## WhatsApp-Specific Instructions
You are now processing a WhatsApp group conversation (not a meeting transcript).
Messages are shorter and more informal — adapt your extraction accordingly:

- Look for IMPLICIT commitments: "I'll do it", "on it", "will push tonight", "let me handle that", "I got this"
- Short replies like "ok I'll check" or "sure, will send" are valid action items
- Emoji reactions (👍, ✅) on a message about a task can indicate acceptance of ownership
- Pay attention to REPLY CHAINS — the quoted context (lines starting with "↳") often contains the task being agreed to
- Participants may use first names, nicknames, or initials — map them to known team members when possible
- Code snippets, links, and technical references are common and should be captured in the source_text
- WhatsApp chats typically produce fewer action items (1-5) than meetings — don't force extraction
`;

// ── Types ───────────────────────────────────────

/** Shape of a single extracted item from the AI (pre-normalization). */
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
    /** When 'whatsapp', the WhatsApp-specific prompt addendum is appended. */
    extraction_method?: string;
}

// ── Core extraction call ────────────────────────

/**
 * Call Gemini to extract action items from a single transcript's text.
 * Returns the raw parsed array (may be empty).
 *
 * Throws on network / parsing errors so callers can handle them.
 */
export async function extractActionItemsFromTranscript(
    transcript: TranscriptForExtraction,
    geminiKey: string,
): Promise<RawExtractedItem[]> {
    // Guard against null participants (some transcripts may have null instead of [])
    const participants = transcript.participants ?? [];

    const userMessage = `Meeting: ${transcript.meeting_title}\nParticipants: ${participants.join(', ')}\n\nTranscript:\n${transcript.raw_transcript}`;

    // Append WhatsApp-specific instructions when processing chat conversations
    const systemPrompt = transcript.extraction_method === 'whatsapp'
        ? EXTRACTION_SYSTEM_PROMPT + WHATSAPP_ACTION_ITEM_ADDENDUM
        : EXTRACTION_SYSTEM_PROMPT;

    const rawText = await callGemini(
        systemPrompt,
        userMessage,
        geminiKey,
        { maxOutputTokens: 65536 },
    );

    console.log(`[extract-helper] Gemini response for "${transcript.meeting_title}": ${rawText.slice(0, 200)}...`);

    // Strip markdown fences if present
    const cleaned = stripMarkdownFences(rawText);

    const extracted: RawExtractedItem[] = JSON.parse(cleaned || '[]');
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
