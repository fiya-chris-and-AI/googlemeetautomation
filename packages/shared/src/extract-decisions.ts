/**
 * Shared logic for AI-powered decision extraction from transcripts.
 *
 * Used by both the single-transcript and batch extraction API routes
 * to avoid duplicating prompts, parsing, and normalization logic.
 */
import type { DecisionDomain, DecisionConfidence } from './types';
import { callGemini, stripMarkdownFences } from './gemini';
import { normalizeAssigneeSingle } from './normalize-assignee';

// ── Topic categories ────────────────────────────

/** Fixed set of broad topic categories for decision grouping. */
export const DECISION_TOPIC_CATEGORIES = [
    'UI & Design',
    'AI & Automation',
    'Translation',
    'DevOps',
    'Business & Legal',
    'Product Features',
    'Branding & Content',
    'Process & Meetings',
    'Accounts & Access',
    'Personal',
] as const;

export type DecisionTopic = (typeof DECISION_TOPIC_CATEGORIES)[number];

// ── Gemini system prompt ────────────────────────

export const DECISION_EXTRACTION_SYSTEM_PROMPT = `You extract DECISIONS from meeting transcripts. A decision is a CHOICE BETWEEN ALTERNATIVES that was resolved during the meeting — something that could have gone a different way but the participants committed to a specific direction.

## What IS a decision (extract these):
- Choosing between options: "Let's go with Supabase instead of Firebase"
- Resolving an open question: "We'll launch in Q2, not Q3"
- Changing direction: "We're switching from polling to WebSockets"
- Committing to a specific approach after discussion: "OK so we'll use the single-column layout"
- Scope decisions: "Let's cut feature X from the MVP"
- Process changes: "We'll do standups twice a week instead of daily"

## What is NOT a decision (do NOT extract these):
- Describing how something currently works or will work ("The search bar will display results below it") — this is a SPECIFICATION, not a decision
- Stating a fact or observation ("The API is slow") — this is an OBSERVATION
- Explaining a plan without choosing between alternatives ("We'll build the search feature next") — this is a PLAN unless they debated WHEN to build it
- Simple agreements with no alternative considered ("Yeah that sounds good") — there's no CHOICE here
- Feature descriptions or requirements ("Search results should show title and snippet") — this is a SPEC
- Status updates ("The recording setup is done") — this is an UPDATE
- Restating something already decided before this meeting — NOT a new decision

## The key test:
Ask yourself: "What was the ALTERNATIVE they rejected?" If you cannot identify a rejected alternative or a question that was open before this discussion, it is NOT a decision — it's just a statement. Skip it.

Return a JSON array of objects with these fields:
- topic (string, required): Classify into exactly one of: "UI & Design", "AI & Automation", "Translation", "DevOps", "Business & Legal", "Product Features", "Branding & Content", "Process & Meetings", "Accounts & Access", "Personal". Pick the single best fit.
- decision_text (string, required): A concise, standalone statement of what was decided. Write it as a direct statement (e.g. "Use Supabase over Firebase for auth" or "Defer mobile app to Q3"). Do NOT start with "We decided", "The team agreed", or similar preambles. Maximum 1 sentence. Include what was chosen AND what was rejected or changed from, when clear.
- context (string | null): 1-2 sentences on what alternatives were considered and why this direction was chosen. Null only if truly no context exists.
- domain (string): Classify into exactly one of: "architecture", "product", "business", "design", "infrastructure", "operations", "general"
  • "architecture" — Technology choices, stack decisions, system design, API design, database schema
  • "product" — Feature scope, MVP definitions, user experience decisions, prioritization
  • "business" — Pricing, partnerships, legal, hiring, marketing, company strategy
  • "design" — UI/UX, branding, visual design, layout choices
  • "infrastructure" — Hosting, deployment, CI/CD, monitoring, DevOps
  • "operations" — Process decisions, workflow changes, tool adoption, meeting cadence
  • "general" — Anything that doesn't clearly fit the above categories
- confidence (string): How clearly was this stated as a decision?
  • "high" — Explicit agreement: "let's go with", "agreed", "confirmed", "OK we'll do X"
  • "medium" — Implied: one person states direction, the other doesn't object, or "I think we should" + "yeah, makes sense"
  • "low" — Ambiguous: could be tentative rather than firm
- source_text (string): The exact 2-4 sentence excerpt from the transcript showing the moment the decision was made (the discussion, the proposal, and the agreement).
- assigned_to (string | null): The person who PROPOSED or CHAMPIONED this decision. MUST be exactly one of: "Lutfiya Miller", "Chris Müller", or null. Never use alternate spellings like "Chris-Steven Müller", "Chris Muller", or "Chris Mueller". Pay close attention to who PROPOSED the direction — "I think we should go with X" or "Let's use X" means the speaker is the champion. If both contributed equally, assign to the person who first raised the topic.

Extraction rules:
- Apply the "rejected alternative" test strictly — if there's no alternative, it's not a decision
- If a topic is discussed but DEFERRED ("let's revisit next week"), do NOT extract it
- If someone proposes but the other pushes back without resolution, do NOT extract it
- Most meetings produce 2-6 genuine decisions. If you're finding more than 8, you're probably including specs/statements
- Deduplicate within the same transcript
- If there are no real decisions, return an empty array — this is perfectly fine

Return ONLY valid JSON, no markdown fences or extra text.`;

/**
 * Additional instructions for WhatsApp conversation decision extraction.
 */
export const WHATSAPP_DECISION_ADDENDUM = `

## WhatsApp-Specific Instructions
You are now processing a WhatsApp group conversation (not a meeting transcript).
Decisions in chat are expressed differently — adapt accordingly:

- Quick agreements count as decisions: "sounds good", "let's go with that", "+1", "👍", "agreed"
- Look at REPLY CHAINS — when someone proposes something and the reply is an agreement emoji or "ok", that IS a decision
- Decisions may span several short messages rather than one paragraph
- Participants may use first names, nicknames, or initials
- Links shared with agreement ("let's use this: [URL]" + "👍") represent tool/resource decisions
- WhatsApp chats typically produce fewer decisions (1-3) than meetings — don't force extraction
`;

// ── Types ───────────────────────────────────────

/** Shape of a single extracted decision from the AI (pre-normalization). */
export interface RawExtractedDecision {
    topic?: string;
    decision_text: string;
    context?: string | null;
    domain?: string;
    confidence?: string;
    source_text?: string;
    assigned_to?: string | null;
}

/** Transcript fields needed for decision extraction. */
export interface TranscriptForDecisionExtraction {
    id: string;
    meeting_title: string;
    meeting_date: string;
    raw_transcript: string;
    participants: string[];
    /** When 'whatsapp', the WhatsApp-specific prompt addendum is appended. */
    extraction_method?: string;
}

// ── Core extraction call ────────────────────────

/**
 * Call Gemini to extract decisions from a single transcript.
 * Returns the raw parsed array (may be empty).
 *
 * Throws on network / parsing errors so callers can handle them.
 */
export async function extractDecisionsFromTranscript(
    transcript: TranscriptForDecisionExtraction,
    geminiKey: string,
): Promise<RawExtractedDecision[]> {
    // Guard against null participants (some transcripts may have null instead of [])
    const participants = transcript.participants ?? [];

    const userMessage = `Meeting: ${transcript.meeting_title}\nDate: ${transcript.meeting_date}\nParticipants: ${participants.join(', ')}\n\nTranscript:\n${transcript.raw_transcript}`;

    // Append WhatsApp-specific instructions when processing chat conversations
    const systemPrompt = transcript.extraction_method === 'whatsapp'
        ? DECISION_EXTRACTION_SYSTEM_PROMPT + WHATSAPP_DECISION_ADDENDUM
        : DECISION_EXTRACTION_SYSTEM_PROMPT;

    const rawText = await callGemini(
        systemPrompt,
        userMessage,
        geminiKey,
        { maxOutputTokens: 65536 },
    );

    console.log(`[extract-decisions] Gemini response for "${transcript.meeting_title}": ${rawText.slice(0, 200)}...`);

    // Strip markdown fences if present
    const cleaned = stripMarkdownFences(rawText);

    const extracted: RawExtractedDecision[] = JSON.parse(cleaned || '[]');
    if (!Array.isArray(extracted)) return [];

    console.log(`[extract-decisions] Extracted ${extracted.length} decisions from "${transcript.meeting_title}"`);
    return extracted;
}

// ── Row builder ─────────────────────────────────

const VALID_DOMAINS: Set<string> = new Set(['architecture', 'product', 'business', 'design', 'infrastructure', 'operations', 'general']);
const VALID_CONFIDENCE: Set<string> = new Set(['high', 'medium', 'low']);

/**
 * Normalize extracted decisions and build database insertion rows.
 */
export function buildDecisionInsertionRows(
    extracted: RawExtractedDecision[],
    transcript: { id: string; meeting_date: string; participants: string[] },
    overrides?: Record<string, unknown>,
): Record<string, unknown>[] {
    return extracted.map((item) => ({
        transcript_id: transcript.id,
        topic: item.topic?.trim() || null,
        decision_text: item.decision_text,
        context: item.context ?? null,
        domain: VALID_DOMAINS.has(item.domain ?? '') ? item.domain : 'general',
        confidence: VALID_CONFIDENCE.has(item.confidence ?? '') ? item.confidence : 'medium',
        participants: transcript.participants ?? [],
        decided_at: transcript.meeting_date,
        source_text: item.source_text ?? null,
        assigned_to: normalizeAssigneeSingle(item.assigned_to),
        status: 'active',
        created_by: 'ai',
        ...overrides,
    }));
}
