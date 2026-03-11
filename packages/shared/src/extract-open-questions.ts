/**
 * Shared logic for AI-powered open question extraction from transcripts.
 *
 * Follows the same pattern as extract-action-items.ts and extract-decisions.ts.
 * Open questions are unresolved topics, ambiguities, or follow-ups
 * that were raised but not answered during the meeting.
 */
import { callGemini, stripMarkdownFences } from './gemini';
import { normalizeAssigneeSingle } from './normalize-assignee';
import { ACTION_ITEM_TOPIC_CATEGORIES } from './extract-action-items';

// ── Gemini system prompt ────────────────────────

export const OPEN_QUESTION_EXTRACTION_SYSTEM_PROMPT = `You extract OPEN QUESTIONS from meeting transcripts. An open question is an UNRESOLVED TOPIC, AMBIGUITY, or FOLLOW-UP that was raised during the meeting but NOT answered or decided upon.

## What IS an open question (extract these):
- Explicit questions that went unanswered: "What exactly do we need to send them?"
- Ambiguous plans needing clarification: "We said we'd handle the anti-gravity system, but the specifics weren't discussed"
- Missing details: "The exact nature of the item Lutfiya needed to send was not specified"
- Deferred topics: "We need to figure out the pricing model — let's revisit that"
- Uncertain commitments: "I think we might need to check with legal first?"
- Open-ended follow-ups: "We should probably look into whether that's even possible"

## What is NOT an open question (do NOT extract these):
- Questions that WERE answered during the meeting — those are decisions or information
- Rhetorical questions ("Isn't that interesting?") — not actionable
- Action items with clear owners ("Can you look into that?" → that's an action item, not an open question)
- Decisions that were made ("Let's go with Supabase") — that's a decision
- Status updates or observations ("The API seems slow") — not a question

## The key test:
Ask yourself: "Was this raised but LEFT UNRESOLVED by the end of the meeting?" If it was answered or decided, it's NOT an open question. If someone would need to follow up on this in a future meeting, it IS an open question.

Return a JSON array of objects with these fields:
- question_text (string, required): A clear, standalone statement of the unresolved question or ambiguity. Write it as a declarative observation (e.g. "The exact timeline for the migration was not established" or "Further details on the automated writing system were not fully elaborated"). Maximum 2 sentences.
- context (string | null): 1-2 sentences on what was being discussed when this came up. Null only if truly no context exists.
- topic (string, required): Classify into exactly one of: "UI & Design", "AI & Automation", "Translation", "DevOps", "Business & Legal", "Product Features", "Branding & Content", "Process & Meetings", "Accounts & Access", "Data & Analytics", "Documentation", "Personal". Pick the single best fit.
- raised_by (string | null): The person who raised or surfaced this question. MUST be exactly one of: "Lutfiya Miller", "Chris Müller", or null. Never use alternate spellings.
- source_text (string): The exact 2-4 sentence excerpt from the transcript that contains or implies this open question.

Extraction rules:
- Focus on questions/ambiguities that would genuinely benefit from follow-up
- If the answer becomes clear later in the transcript, do NOT extract it
- Most meetings produce 1-4 open questions. If you're finding more than 6, you may be including resolved items
- If there are genuinely no open questions, return an empty array
- Deduplicate within the same transcript

Return ONLY valid JSON, no markdown fences or extra text.`;

// ── Types ───────────────────────────────────────

/** Shape of a single extracted open question from the AI (pre-normalization). */
export interface RawExtractedOpenQuestion {
    question_text: string;
    context?: string | null;
    topic?: string;
    raised_by?: string | null;
    source_text?: string;
}

/** Transcript fields needed for open question extraction. */
export interface TranscriptForOpenQuestionExtraction {
    id: string;
    meeting_title: string;
    raw_transcript: string;
    participants: string[];
}

// ── Core extraction call ────────────────────────

/**
 * Call Gemini to extract open questions from a single transcript.
 * Returns the raw parsed array (may be empty).
 *
 * Throws on network / parsing errors so callers can handle them.
 */
export async function extractOpenQuestionsFromTranscript(
    transcript: TranscriptForOpenQuestionExtraction,
    geminiKey: string,
): Promise<RawExtractedOpenQuestion[]> {
    // Guard against null participants
    const participants = transcript.participants ?? [];

    const userMessage = `Meeting: ${transcript.meeting_title}\nParticipants: ${participants.join(', ')}\n\nTranscript:\n${transcript.raw_transcript}`;

    const rawText = await callGemini(
        OPEN_QUESTION_EXTRACTION_SYSTEM_PROMPT,
        userMessage,
        geminiKey,
        { maxOutputTokens: 4096 },
    );

    console.log(`[extract-open-questions] Gemini response for "${transcript.meeting_title}": ${rawText.slice(0, 200)}...`);

    const cleaned = stripMarkdownFences(rawText);

    const extracted: RawExtractedOpenQuestion[] = JSON.parse(cleaned || '[]');
    if (!Array.isArray(extracted)) return [];

    console.log(`[extract-open-questions] Extracted ${extracted.length} open questions from "${transcript.meeting_title}"`);
    return extracted;
}

// ── Row builder ─────────────────────────────────

/** Validate topic against the known category list. */
const VALID_TOPICS: Set<string> = new Set(ACTION_ITEM_TOPIC_CATEGORIES);

/**
 * Normalize extracted open questions and build database insertion rows.
 */
export function buildOpenQuestionInsertionRows(
    extracted: RawExtractedOpenQuestion[],
    transcriptId: string,
): Record<string, unknown>[] {
    return extracted.map((item) => ({
        transcript_id: transcriptId,
        question_text: item.question_text,
        context: item.context ?? null,
        topic: VALID_TOPICS.has(item.topic ?? '') ? item.topic : null,
        raised_by: normalizeAssigneeSingle(item.raised_by),
        source_text: item.source_text ?? null,
        status: 'open',
        created_by: 'ai',
    }));
}
