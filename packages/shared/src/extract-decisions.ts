/**
 * Shared logic for AI-powered decision extraction from transcripts.
 *
 * Used by both the single-transcript and batch extraction API routes
 * to avoid duplicating prompts, parsing, and normalization logic.
 */
import type { DecisionDomain, DecisionConfidence } from './types';

// ── Claude system prompt ────────────────────────

export const DECISION_EXTRACTION_SYSTEM_PROMPT = `You extract DECISIONS from meeting transcripts. Decisions are concluded determinations — choices made, directions set, questions answered.

IMPORTANT: Decisions are NOT action items. Do NOT extract tasks, to-dos, or assignments. Only extract statements where the participants clearly decided, agreed, chose, or concluded something.

Return a JSON array of objects with these fields:
- decision_text (string, required): A concise, standalone statement of the decision. Write it as a direct, third-person statement (e.g. "Use Supabase for authentication" or "Defer the mobile app until Q3"). Do NOT start with "We decided", "The team agreed", or similar preambles. Maximum 2 sentences.
- context (string | null): A 1-2 sentence summary of the discussion that led to this decision (what alternatives were considered, why this was chosen). Null if the decision appears without much surrounding context.
- domain (string): Classify into exactly one of: "architecture", "product", "business", "design", "infrastructure", "operations", "general"
  • "architecture" — Technology choices, stack decisions, system design, API design, database schema
  • "product" — Feature scope, MVP definitions, user experience decisions, prioritization, what to build/not build
  • "business" — Pricing, partnerships, legal, hiring, marketing, company strategy
  • "design" — UI/UX, branding, visual design, layout choices
  • "infrastructure" — Hosting, deployment, CI/CD, monitoring, DevOps
  • "operations" — Process decisions, workflow changes, tool adoption, meeting cadence
  • "general" — Anything that doesn't clearly fit the above categories
- confidence (string): How clearly was this stated as a decision?
  • "high" — Explicit agreement language: "we decided", "let's go with", "agreed", "confirmed"
  • "medium" — Implied agreement: one person states a direction and the other doesn't object, or "I think we should" followed by "yeah, makes sense"
  • "low" — Ambiguous: could be a tentative direction rather than a firm decision
- source_text (string): The exact excerpt from the transcript that contains or implies this decision. Include enough context (2-4 sentences) to understand the decision without reading the full transcript.

Extraction rules:
- Only extract decisions that are clearly present in the transcript — do not infer or fabricate
- If a topic is discussed but explicitly DEFERRED ("let's revisit next week"), do NOT extract it as a decision
- If someone proposes something but the other person pushes back, do NOT extract it as a decision
- One transcript may contain 0-15 decisions; most meetings have 2-6 decisions
- Remove any decisions that are merely restatements of previously extracted decisions within the same transcript
- If there are no decisions, return an empty array

Return ONLY valid JSON, no markdown fences or extra text.`;

// ── Types ───────────────────────────────────────

/** Shape of a single extracted decision from Claude (pre-normalization). */
export interface RawExtractedDecision {
    decision_text: string;
    context?: string | null;
    domain?: string;
    confidence?: string;
    source_text?: string;
}

/** Transcript fields needed for decision extraction. */
export interface TranscriptForDecisionExtraction {
    id: string;
    meeting_title: string;
    meeting_date: string;
    raw_transcript: string;
    participants: string[];
}

// ── Core extraction call ────────────────────────

/**
 * Call Claude to extract decisions from a single transcript.
 * Returns the raw parsed array (may be empty).
 *
 * Throws on network / parsing errors so callers can handle them.
 */
export async function extractDecisionsFromTranscript(
    transcript: TranscriptForDecisionExtraction,
    anthropicKey: string,
): Promise<RawExtractedDecision[]> {
    // Guard against null participants (some transcripts may have null instead of [])
    const participants = transcript.participants ?? [];

    const requestBody = {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: DECISION_EXTRACTION_SYSTEM_PROMPT,
        messages: [
            {
                role: 'user',
                content: `Meeting: ${transcript.meeting_title}\nDate: ${transcript.meeting_date}\nParticipants: ${participants.join(', ')}\n\nTranscript:\n${transcript.raw_transcript}`,
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
        console.error(`[extract-decisions] Claude API error ${anthropicRes.status}: ${errorBody}`);
        throw new Error(`Claude API returned ${anthropicRes.status}: ${errorBody}`);
    }

    const data = (await anthropicRes.json()) as { content?: { text?: string }[] };
    let rawText: string = data.content?.[0]?.text ?? '[]';

    console.log(`[extract-decisions] Claude response for "${transcript.meeting_title}": ${rawText.slice(0, 200)}...`);

    // Claude sometimes wraps JSON in markdown fences despite the prompt saying not to
    rawText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

    const extracted: RawExtractedDecision[] = JSON.parse(rawText);
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
        decision_text: item.decision_text,
        context: item.context ?? null,
        domain: VALID_DOMAINS.has(item.domain ?? '') ? item.domain : 'general',
        confidence: VALID_CONFIDENCE.has(item.confidence ?? '') ? item.confidence : 'medium',
        participants: transcript.participants ?? [],
        decided_at: transcript.meeting_date,
        source_text: item.source_text ?? null,
        status: 'active',
        created_by: 'ai',
        ...overrides,
    }));
}
