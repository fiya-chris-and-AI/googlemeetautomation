# Prompt: Fix Action Item Extraction + Optimize Decision Quality + Add Topic Pills

> **Target model:** Claude 4.6 Opus — Google Antigravity IDE
> **App:** ScienceExperts.ai — Transcript Pipeline (Next.js 14 App Router + Supabase + Gemini 2.5 Flash + OpenAI embeddings)
> **Date generated:** 2026-03-06

---

## Problems to Fix

### Problem 1 — Action items are not being extracted from uploaded transcripts
After uploading a transcript, the "Action Items" column in the Transcript Library shows `—` (zero items). The auto-extraction pipeline fires but the Gemini prompt is too generic and misses implicit commitments like "I'll handle that" or "Can you take care of X?". The prompt needs to be rewritten to catch these patterns.

### Problem 2 — Decisions extracted are just statements, not actual decisions
The Decision Ledger shows 14 "decisions" from a single meeting, but most are feature specifications or observations — not real decisions. Examples of bad extractions:
- "The search bar should always be visible" → This is a SPEC, not a decision
- "Search results will be displayed as a single column list" → This is a SPEC
- "The keyboard shortcut to focus on the search bar will be Command-K" → This is a SPEC
- "Text highlighting in search snippets will be yellow" → This is a SPEC

These should NOT be extracted. Only actual choices between alternatives (where something was rejected) should be decisions.

### Problem 3 — Decision display is too text-heavy
The Decision Ledger cards show full-sentence `decision_text` as the primary display. This should instead show short topic pills (2-5 words like "Auth Provider", "Search Layout") with the full text as secondary.

---

## Current Architecture (READ THIS FIRST)

### Tech Stack
- **Framework:** Next.js 14.2 (App Router) with TypeScript
- **Database:** Supabase (PostgreSQL + pgvector)
- **AI:** Gemini 2.5 Flash via REST API (`packages/shared/src/gemini.ts`), OpenAI `text-embedding-3-small` for embeddings
- **Monorepo:** Turbo workspaces — `apps/web` (frontend + API), `packages/shared` (extraction logic)

### Key Files to Modify

**1. Action Item Extraction Prompt** — `packages/shared/src/extract-action-items.ts`
- Contains `EXTRACTION_SYSTEM_PROMPT` — the Gemini system prompt for action item extraction
- Contains `extractActionItemsFromTranscript()` — calls Gemini, parses JSON response
- Contains `buildInsertionRows()` — normalizes assignees, builds DB rows
- Uses `callGemini()` from `packages/shared/src/gemini.ts`

**2. Decision Extraction Prompt** — `packages/shared/src/extract-decisions.ts`
- Contains `DECISION_EXTRACTION_SYSTEM_PROMPT` — the Gemini system prompt for decision extraction
- Contains `extractDecisionsFromTranscript()` — calls Gemini, parses JSON response
- Contains `buildDecisionInsertionRows()` — validates domain/confidence, builds DB rows
- Contains `RawExtractedDecision` interface — needs new `topic` field

**3. Shared Types** — `packages/shared/src/types.ts`
- `Decision` interface — needs new `topic: string | null` field
- `RawExtractedDecision` interface — needs new `topic?: string` field

**4. Database Migration** — Create `supabase/migrations/008_decisions_topic.sql`
- Add `topic TEXT` column to `decisions` table
- Add index on `topic`

**5. Decision Ledger UI** — `apps/web/app/decisions/page.tsx`
- `DecisionCard` component — update to show `topic` as a colored pill alongside `decision_text`
- Show domain badge only when no `topic` exists (avoid redundancy since topic pill already uses domain colors)

**6. Decisions API** — `apps/web/app/api/decisions/route.ts`
- GET: Update search to query both `decision_text` and `topic`
- POST: Pass `topic` field through to DB on manual creation

**7. Transcripts API** — `apps/web/app/api/transcripts/route.ts`
- Update decision query to select `topic` in addition to `decision_text`
- Use `topic` as the preferred preview label (fall back to `decision_text` if null)

**8. Auto-Extract Decisions** — `apps/web/lib/auto-extract-decisions.ts`
- No prompt changes needed here (it already calls `extractDecisionsFromTranscript` from shared package)
- The `topic` field will flow through automatically via `buildDecisionInsertionRows`

---

## Change 1: Rewrite Action Item Extraction Prompt

**File:** `packages/shared/src/extract-action-items.ts`

Replace the entire `EXTRACTION_SYSTEM_PROMPT` constant with the following optimized prompt. The key improvements are:
1. Defines what IS vs what is NOT an action item with concrete examples
2. Adds a "key test" — "Could someone put this on a to-do list and check it off?"
3. Requires every item to have a VERB
4. Explicitly instructs to catch implicit commitments ("I'll", "I can", "let me") and requests ("Can you", "Could you")
5. Tells the model to re-read for implicit commitments if finding 0 items

```typescript
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
- group_label (string | null): A short label (1-3 words, Title Case) for the project or topic this relates to. Use consistent labels across items from the same topic area.
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
```

No other changes needed in this file — the function signatures, types, and row builder remain the same.

---

## Change 2: Rewrite Decision Extraction Prompt + Add `topic` Field

**File:** `packages/shared/src/extract-decisions.ts`

### 2a. Replace the entire `DECISION_EXTRACTION_SYSTEM_PROMPT` constant

The critical innovation here is the **"rejected alternative" test** — every decision must have an identifiable alternative that was NOT chosen. This single filter eliminates 80% of the false positives (specs, observations, plans).

```typescript
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
- topic (string, required): A 2-5 word label capturing the subject area (e.g. "Auth provider", "Launch timeline", "Search layout", "Meeting cadence"). This is used as a short pill/badge in the UI.
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

Extraction rules:
- Apply the "rejected alternative" test strictly — if there's no alternative, it's not a decision
- If a topic is discussed but DEFERRED ("let's revisit next week"), do NOT extract it
- If someone proposes but the other pushes back without resolution, do NOT extract it
- Most meetings produce 2-6 genuine decisions. If you're finding more than 8, you're probably including specs/statements
- Deduplicate within the same transcript
- If there are no real decisions, return an empty array — this is perfectly fine

Return ONLY valid JSON, no markdown fences or extra text.`;
```

### 2b. Add `topic` to `RawExtractedDecision` interface

```typescript
export interface RawExtractedDecision {
    topic?: string;        // ← ADD THIS
    decision_text: string;
    context?: string | null;
    domain?: string;
    confidence?: string;
    source_text?: string;
}
```

### 2c. Pass `topic` through in `buildDecisionInsertionRows()`

In the `return extracted.map(...)` block, add `topic: item.topic ?? null,` right before `decision_text`:

```typescript
return extracted.map((item) => ({
    transcript_id: transcript.id,
    topic: item.topic ?? null,           // ← ADD THIS
    decision_text: item.decision_text,
    context: item.context ?? null,
    // ... rest unchanged
}));
```

---

## Change 3: Update Shared Types

**File:** `packages/shared/src/types.ts`

### 3a. Add `topic` to `Decision` interface

```typescript
export interface Decision {
    id: string;
    transcript_id: string | null;
    topic: string | null;            // ← ADD THIS
    decision_text: string;
    // ... rest unchanged
}
```

### 3b. Add `topic` to `RawExtractedDecision` interface

```typescript
export interface RawExtractedDecision {
    topic?: string;                  // ← ADD THIS
    decision_text: string;
    // ... rest unchanged
}
```

---

## Change 4: Database Migration

**Create new file:** `supabase/migrations/008_decisions_topic.sql`

```sql
-- Add short topic label column for pill-style display in the Decision Ledger UI.
-- Populated by AI extraction (2-5 word label like "Auth provider", "Launch timeline").
-- Nullable for backward compatibility with existing decisions.

ALTER TABLE decisions ADD COLUMN IF NOT EXISTS topic TEXT;

-- Index for topic-based search and filtering
CREATE INDEX IF NOT EXISTS idx_decisions_topic ON decisions(topic);
```

**IMPORTANT:** Run this migration against Supabase before deploying the code changes.

---

## Change 5: Update Decision Ledger UI for Topic Pills

**File:** `apps/web/app/decisions/page.tsx`

In the `DecisionCard` component, update the header section. Replace the current flat `<p>` that shows `decision_text` with a layout that shows a colored topic pill followed by the decision text:

### Current (replace this):
```tsx
<div className="min-w-0 flex-1">
    <p className={`text-sm font-medium text-theme-text-primary ${style.strike ? 'line-through opacity-60' : ''}`}>
        {stripDecisionPrefix(decision.decision_text)}
    </p>
    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
        {/* Domain badge */}
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${DOMAIN_STYLE[decision.domain]}`}>
            {decision.domain}
        </span>
```

### New (replace with this):
```tsx
<div className="min-w-0 flex-1">
    {/* Topic pill + short decision text */}
    <div className="flex items-center gap-2 flex-wrap">
        {decision.topic && (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${DOMAIN_STYLE[decision.domain]}`}>
                {decision.topic}
            </span>
        )}
        <p className={`text-sm text-theme-text-primary ${style.strike ? 'line-through opacity-60' : ''}`}>
            {stripDecisionPrefix(decision.decision_text)}
        </p>
    </div>
    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
        {/* Domain badge (only show if no topic, to avoid redundancy) */}
        {!decision.topic && (
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${DOMAIN_STYLE[decision.domain]}`}>
                {decision.domain}
            </span>
        )}
```

The topic pill takes the domain's color and acts as the visual anchor. The full decision text sits next to it in regular weight. When no topic exists (older decisions), the domain badge shows as before — graceful fallback.

---

## Change 6: Update Decisions API

**File:** `apps/web/app/api/decisions/route.ts`

### 6a. Update search to query both fields (GET handler)

Replace:
```typescript
if (search) query = query.ilike('decision_text', `%${search}%`);
```

With:
```typescript
if (search) query = query.or(`decision_text.ilike.%${search}%,topic.ilike.%${search}%`);
```

### 6b. Pass topic on manual creation (POST handler)

In the `row` object for manual decision creation, add:
```typescript
const row = {
    topic: body.topic ?? null,       // ← ADD THIS
    decision_text: body.decision_text.trim(),
    // ... rest unchanged
};
```

---

## Change 7: Update Transcripts API for Topic Preview

**File:** `apps/web/app/api/transcripts/route.ts`

### 7a. Add `topic` to decisions query

```typescript
supabase
    .from('decisions')
    .select('transcript_id, topic, decision_text')    // ← ADD topic
    .eq('created_by', 'ai')
    .not('transcript_id', 'is', null),
```

### 7b. Use topic as preferred preview label

In the decision map builder, prefer `topic` over `decision_text` for the preview titles:

```typescript
if (entry.titles.length < 3) {
    // Prefer short topic pill label; fall back to decision_text
    const label = (row.topic as string | null) ?? (row.decision_text as string);
    entry.titles.push(label);
}
```

---

## Verification Checklist

After making all changes:

1. **Build shared package:** `npm run build --workspace=packages/shared` — should compile with zero errors
2. **Type-check web app:** `npx tsc --noEmit --project apps/web/tsconfig.json` — should pass
3. **Run migration:** Execute `008_decisions_topic.sql` against Supabase
4. **Test re-extraction:** Upload a transcript or use "Extract All" on the Decision Ledger to verify:
   - Action items are now being extracted (should find 3-10 per meeting)
   - Decisions are fewer but higher quality (2-6 per meeting, each with a clear rejected alternative)
   - Each decision has a short `topic` label displayed as a colored pill
5. **Backward compatibility:** Existing decisions with `topic = null` should still display correctly (domain badge shows as fallback)

---

## Summary of Changes

| # | File | What Changes |
|---|------|-------------|
| 1 | `packages/shared/src/extract-action-items.ts` | Rewrite `EXTRACTION_SYSTEM_PROMPT` — add IS/NOT examples, verb requirement, implicit commitment detection |
| 2 | `packages/shared/src/extract-decisions.ts` | Rewrite `DECISION_EXTRACTION_SYSTEM_PROMPT` — add "rejected alternative" test, `topic` field, strict filtering |
| 3 | `packages/shared/src/types.ts` | Add `topic: string \| null` to `Decision` and `RawExtractedDecision` |
| 4 | `supabase/migrations/008_decisions_topic.sql` | Add `topic TEXT` column + index |
| 5 | `apps/web/app/decisions/page.tsx` | Show topic as colored pill, domain badge as fallback |
| 6 | `apps/web/app/api/decisions/route.ts` | Search across topic + decision_text; pass topic on manual create |
| 7 | `apps/web/app/api/transcripts/route.ts` | Use topic as preferred preview label in transcript library |
