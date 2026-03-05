# Optimized Prompt — AI Effort Estimation for Action Items

Use the following prompt in your IDE session. It is grounded in the exact current implementation across the extraction pipeline, shared types, database schema, and UI.

---

## Prompt

```
You are working on the MeetScript codebase — a Next.js 14 (App Router) + Supabase + TypeScript monorepo. AI features use Anthropic Claude (currently `claude-sonnet-4-20250514`). Styling is Tailwind CSS.

### Task

Add an AI-powered **effort estimation** dimension to action items. Currently, the `priority` field ("low" | "medium" | "high" | "urgent") is inferred by Claude during extraction but reflects *urgency*, not *effort*. The new field will estimate how much work an action item will take to complete, categorized as "quick_fix", "moderate", or "significant". Generate an implementation plan first.

### Why This Matters

The two dimensions serve different purposes:
- **Priority** (existing) = "How urgently does this need attention?" — driven by deadlines, blockers, stakeholder pressure.
- **Effort** (new) = "How much time/work will this take?" — driven by task complexity, scope, number of steps.

A task can be high-priority but quick (e.g., "Reply to investor email today") or low-priority but significant effort (e.g., "Refactor the onboarding flow"). Users need both signals to plan their work.

### Current Implementation — What Touches Action Items

**1. Database schema** — `supabase/migrations/002_action_items.sql` (line 9):
```sql
priority TEXT DEFAULT 'medium',  -- 'low' | 'medium' | 'high' | 'urgent'
```
There is no effort column today.

**2. TypeScript types** — `packages/shared/src/types.ts`:
```typescript
// Line 90:
export type ActionItemPriority = 'low' | 'medium' | 'high' | 'urgent';

// Lines 93–112: ActionItem interface — no effort field exists yet.
```

**3. Single-transcript extraction** — `apps/web/app/api/action-items/extract/route.ts`:
- The Claude system prompt (lines 48–60) tells the AI to infer `priority` from "context and urgency cues."
- The extracted JSON shape (lines 86–94) includes `priority?: string`.
- Insertion (lines 119–131) sets `priority: item.priority ?? 'medium'`.

**4. Bulk extraction** — `apps/web/app/api/action-items/extract-all/route.ts`:
- Calls the shared `extractActionItemsFromTranscript()` helper (line 79), which uses the same system prompt internally.
- Calls `buildInsertionRows()` (line 94) to normalize and format rows — this would also need the new field.

**5. Action Items UI** — `apps/web/app/action-items/page.tsx`:
- Priority is displayed via `PRIORITY_DOT` (lines 12–17) and `PRIORITY_LABEL` (lines 19–24) lookup maps.
- `ActionItemCard` (line 577+) renders a colored priority dot and label text on each card.
- The filter bar has a priority filter dropdown (lines 293–302).
- The create modal (lines 529–540) has a priority `<select>`.

**6. Action Items API** — `apps/web/app/api/action-items/route.ts`:
- GET supports `?priority=` filter query param.
- POST accepts `priority` in the body for manual creation.

**7. PATCH endpoint** — `apps/web/app/api/action-items/[id]/route.ts`:
- Accepts `priority` in the PATCH body for updates.

### Requirements

#### 1. New type and database column

**Type** — Add to `packages/shared/src/types.ts`:
```typescript
export type ActionItemEffort = 'quick_fix' | 'moderate' | 'significant';
```

Add `effort` field to the `ActionItem` interface:
```typescript
effort: ActionItemEffort | null;  // null for legacy items without estimation
```

**Migration** — Create `supabase/migrations/006_action_items_effort.sql`:
```sql
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS effort TEXT;
-- No default — legacy rows stay NULL; AI will populate going forward.
CREATE INDEX idx_action_items_effort ON action_items(effort) WHERE effort IS NOT NULL;
```

#### 2. Update the Claude extraction prompt

In the system prompt (used in both `extract/route.ts` line 48 and the shared extraction helper used by `extract-all/route.ts`), add a new field to the JSON schema:

```
- effort ("quick_fix" | "moderate" | "significant"): Estimate the effort required to complete this task:
  • "quick_fix" — Can likely be done in under 30 minutes. Examples: sending an email, making a quick decision, looking something up, a short reply.
  • "moderate" — Likely takes 30 minutes to a few hours. Examples: writing a short document, setting up a tool, having a focused work session, scheduling and conducting a call.
  • "significant" — Likely takes multiple hours or spans multiple days. Examples: building a feature, conducting research, creating a presentation, coordinating across multiple people or steps.
  Base this on the nature of the task described in the transcript, not on its urgency or priority.
```

This keeps effort estimation grounded in transcript context — Claude can judge task complexity from how it was discussed (e.g., "just shoot them a quick email" → quick_fix vs. "we need to put together a full proposal" → significant).

#### 3. Update insertion logic

**Single extraction** (`extract/route.ts`, lines 86–131):
- Add `effort?: string` to the parsed type (line 90 area).
- Include `effort: item.effort ?? null` in the insertion row (line 125 area).

**Bulk extraction** (`extract-all/route.ts`):
- The shared `buildInsertionRows()` helper in `packages/shared` needs to pass through the `effort` field.
- The shared `RawExtractedItem` type needs an `effort` field.

**Manual creation** (`POST /api/action-items` in `route.ts`):
- Accept optional `effort` in the request body.

**PATCH** (`/api/action-items/[id]/route.ts`):
- Accept optional `effort` in the PATCH body.

#### 4. Update the Action Items UI

**Effort indicator on cards** — In `ActionItemCard` (line 577+), display effort alongside the existing priority dot. Use a distinct visual treatment so the two dimensions are clearly separate:

```typescript
const EFFORT_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
    quick_fix:   { icon: '⚡', label: 'Quick Fix',   color: 'text-emerald-400' },
    moderate:    { icon: '🔧', label: 'Moderate',    color: 'text-brand-400' },
    significant: { icon: '🏗️', label: 'Significant', color: 'text-amber-400' },
};
```

Display as a small badge next to the priority label on each card. For items with `effort = null` (legacy), show nothing (graceful fallback).

**Effort filter** — Add an effort filter dropdown to the filter bar (after the existing priority filter):
```typescript
<FilterSelect
    value={effortFilter}
    onChange={setEffortFilter}
    options={[
        { value: 'all', label: 'All Effort Levels' },
        { value: 'quick_fix', label: '⚡ Quick Fix' },
        { value: 'moderate', label: '🔧 Moderate' },
        { value: 'significant', label: '🏗️ Significant' },
    ]}
/>
```

**Create modal** — Add an effort `<select>` to the create form (lines 518–551), alongside the existing priority dropdown. Default to `null` (let the user optionally set it for manually-created items).

**GET API filter** — Support `?effort=quick_fix` query param in `GET /api/action-items`.

#### 5. Backfill strategy for existing items

Existing action items have `effort = null`. Provide a way to estimate effort for legacy items:

- Add a one-time **"Estimate Effort"** button in the UI header (next to "Smart Group"). On click:
  1. Fetch all items where `effort IS NULL` and `status != 'dismissed'`.
  2. Send their titles + descriptions to Claude in a single batch call.
  3. Claude returns a mapping: `{ itemId: effortLevel }`.
  4. Batch-update all items.
- This follows the exact same pattern as the existing Smart Group feature (`handleSmartGroup` on line 200 of `page.tsx` → `POST /api/action-items/group`).

Create `apps/web/app/api/action-items/estimate-effort/route.ts` for this endpoint.

### Constraints

- The existing `priority` field and all its UI/API surface must remain untouched. Effort is an *additional* dimension, not a replacement.
- Follow the existing extraction prompt style: bullet-pointed field documentation with examples, in the same system prompt string.
- Follow migration naming: `006_action_items_effort.sql` (next in sequence after 005).
- Follow the established pattern for batch AI operations: Smart Group (`/api/action-items/group`) is the template. Match its request/response shape, error handling, and loading state pattern in the UI.
- Use `claude-sonnet-4-20250514` for all Claude calls (matching existing model usage).
- Effort should be a separate, independent axis from priority in all UI and data contexts — never conflate the two.

### Implementation Plan Format

Structure your plan as:
1. **Schema & types** — Migration SQL, TypeScript type additions
2. **Extraction prompt changes** — Exact wording additions to the system prompt
3. **API changes** — Which route files change, what fields are added
4. **Shared helper changes** — Updates to `packages/shared` (types, extraction helper, insertion builder)
5. **UI changes** — Card display, filter bar, create modal, backfill button
6. **Backfill endpoint** — New route, Claude prompt, batch update logic
7. **Testing plan** — How to verify each layer works
```

---

## Why This Prompt Is Optimized

| Technique | How It's Applied |
|---|---|
| **Distinguishes effort from priority** | Opens with an explicit "Why This Matters" section clarifying the two dimensions — prevents the model from conflating them or replacing priority |
| **Every touchpoint enumerated** | Lists all 7 files/areas that reference priority or action items, with line numbers — the model knows the complete surface area before writing a plan |
| **Extraction prompt wording provided** | Gives the exact text to add to the Claude system prompt, including the 3-tier definitions with concrete examples. This prevents vague categorizations |
| **Examples anchored to the user's domain** | Uses examples relevant to a startup co-founder context ("Reply to investor email" / "Build a feature") rather than generic software tasks |
| **Backfill strategy specified** | Explicitly addresses legacy items with `effort = null`, and points to the Smart Group feature as the exact code pattern to follow |
| **Both extraction paths covered** | Calls out both `extract/route.ts` (single) and `extract-all/route.ts` (bulk) plus the shared helpers in `packages/shared` — prevents the model from only updating one path |
| **Visual treatment suggested** | Provides the `EFFORT_CONFIG` object with icons, labels, and Tailwind colors matching the codebase's existing palette conventions |
| **Graceful null handling** | Specifies that `effort` defaults to `null` (not a value), so legacy items don't break and the UI degrades gracefully |
| **Plan format prescribed** | Requests 7 specific sections matching the natural implementation order, so the output is immediately actionable |
