# Optimized Prompt — Bulk Action Item Extraction

Use the following prompt in your IDE session. It is tailored to the MeetScript codebase architecture, file paths, naming conventions, and existing patterns.

---

## Prompt

```
You are working on the MeetScript codebase — a Next.js 14 (App Router) + Supabase + TypeScript monorepo located in this workspace. The project uses Tailwind CSS, the Supabase JS SDK, and Anthropic Claude Sonnet 4 for AI features.

### Task

Add a **bulk "Extract Action Items" button** to the Transcript Library page that processes all unprocessed transcripts in one operation and deduplicates results against existing action items.

### Context: Existing Architecture

The single-transcript extraction flow already works end-to-end:

- **API endpoint:** `apps/web/app/api/action-items/extract/route.ts`
  — Accepts `{ transcript_id }`, fetches the transcript, calls Claude, normalizes assignees using `CANONICAL_NAMES`, and inserts into the `action_items` table.
- **Transcript library UI:** `apps/web/app/transcripts/page.tsx`
  — Sortable table with columns: Title, Date, Participants, Words, Method, AI Items. Already shows `ai_extracted_count` per row.
- **Transcript detail page:** `apps/web/app/transcripts/[id]/page.tsx`
  — Has the existing per-transcript "Extract" button.
- **Action items API:** `apps/web/app/api/action-items/route.ts`
  — GET (with filtering/sorting) and POST (create).
- **Smart grouping:** `apps/web/app/api/action-items/group/route.ts`
  — Groups ungrouped items via Claude. Called separately.
- **Shared types:** `packages/shared/src/types.ts`
  — `MeetingTranscript`, `ActionItem`, `ActionItemStatus`, `ActionItemPriority`, `ActionItemCreatedBy`.
- **Database:** Supabase PostgreSQL. Tables: `transcripts`, `action_items`, `activity_log`. Action items link to transcripts via `transcript_id`. The `created_by` field is `'ai'` | `'manual'`.

### Requirements

#### 1. New API endpoint: `POST /api/action-items/extract-all`

Create `apps/web/app/api/action-items/extract-all/route.ts`:

- **Identify unprocessed transcripts:** Query `transcripts` and LEFT JOIN `action_items` to find transcripts that have zero AI-extracted action items (i.e., no rows in `action_items` where `transcript_id` matches and `created_by = 'ai'`).
- **Process sequentially** (not in parallel) to avoid rate-limiting Claude. For each unprocessed transcript, reuse the same extraction logic from the existing `extract/route.ts` — specifically the Claude system prompt, assignee normalization (`CANONICAL_NAMES.LUTFIYA`, `CANONICAL_NAMES.CHRIS`), and insert pattern.
- **Deduplicate across transcripts:** After extracting items from each transcript, before inserting, compare each new item against all *existing* action items (across all transcripts). Flag a new item as a duplicate if its `title` is semantically very similar to an existing item's `title` AND it is assigned to the same person. For flagged duplicates:
  - Still insert the item into the database (for auditability).
  - Set a new field `is_duplicate` to `true` (see migration below).
  - Store `duplicate_of` referencing the `id` of the original item.
- **Return a summary response:**
  ```json
  {
    "transcripts_processed": 5,
    "transcripts_skipped": 12,
    "items_extracted": 14,
    "items_flagged_duplicate": 3
  }
  ```
- **Log each extraction** to `activity_log` following the existing pattern in `extract/route.ts`.
- **Stream progress** via the response (or return after completion — your judgment on UX).

#### 2. Database migration: `supabase/migrations/005_action_items_dedup.sql`

Follow the naming pattern of existing migrations (e.g., `003_action_items_group_label.sql`):

```sql
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS is_duplicate BOOLEAN DEFAULT FALSE;
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS duplicate_of TEXT REFERENCES action_items(id);
CREATE INDEX idx_action_items_duplicate ON action_items(is_duplicate) WHERE is_duplicate = TRUE;
```

Also update `packages/shared/src/types.ts` to add `is_duplicate: boolean` and `duplicate_of: string | null` to the `ActionItem` interface.

#### 3. UI: Add button to Transcript Library page

In `apps/web/app/transcripts/page.tsx`:

- Add an **"Extract All Action Items"** button in the header toolbar (next to the existing "Sync Inbox" and "Upload" buttons).
- Follow the existing button styling pattern (Tailwind classes already used in that file).
- On click:
  - Show a loading/progress state (follow the `syncing` state pattern already in the component).
  - Call `POST /api/action-items/extract-all`.
  - On success, display a toast or inline summary showing the counts from the response.
  - Refresh the transcript list to update `ai_extracted_count` values.
- Disable the button if there are no unprocessed transcripts (check this client-side from the existing data, or add an indicator to the API response).

#### 4. UI: Surface duplicates in the Action Items view

In `apps/web/app/action-items/page.tsx`:

- Duplicates (`is_duplicate = true`) should display with a visual indicator (e.g., a subtle "Duplicate" badge or strikethrough styling).
- Add a filter option to show/hide duplicates (default: hidden).
- When a duplicate is shown, include a link or reference to the original item (`duplicate_of`).

### Deduplication Strategy

For comparing new items against existing ones, use Claude to do a semantic similarity check. The approach:

1. After extracting items from a transcript, collect all existing action items (`status != 'dismissed'`).
2. Send the new items + existing item titles/assignees to Claude in a single call.
3. Ask Claude to return a mapping: `{ newItemIndex: existingItemId | null }` for each new item.
4. This avoids embedding-based similarity and stays consistent with the project's pattern of using Claude for intelligence tasks.

### Constraints

- Do NOT modify the existing single-transcript `extract/route.ts` — the new bulk endpoint should coexist with it.
- Follow existing code patterns: named exports for `POST`, Supabase client usage, error handling with `NextResponse.json()`, activity logging.
- Use the existing `CANONICAL_NAMES` normalization logic (import or duplicate from extract route — prefer extracting shared logic into a helper if it improves maintainability).
- Keep the Claude model consistent: use `claude-sonnet-4-20250514` as already configured in the codebase.
```

---

## Why This Prompt Is Optimized

| Technique | How It's Applied |
|---|---|
| **Grounding in real code** | References exact file paths, table schemas, field names, and existing patterns — eliminates guesswork |
| **Explicit architecture context** | Lists every relevant file so the model understands the dependency graph before writing code |
| **Numbered deliverables** | Four clear, scoped work items (API, migration, library UI, action items UI) |
| **Concrete data shapes** | Shows the expected JSON response, SQL migration, and TypeScript interface changes |
| **Deduplication strategy prescribed** | Specifies the Claude-based semantic comparison approach rather than leaving it ambiguous |
| **Constraints section** | Prevents common mistakes (breaking existing endpoint, wrong model, inconsistent patterns) |
| **Naming conventions embedded** | Uses the codebase's actual naming: `CANONICAL_NAMES`, `ai_extracted_count`, `activity_log`, migration numbering |
| **UX guidance with flexibility** | Prescribes behavior (loading state, toast, filter) but leaves implementation detail to the model |
