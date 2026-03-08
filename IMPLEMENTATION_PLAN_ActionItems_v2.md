# Action Item System Enhancement — Implementation Plan

**Author:** Claude 4.6 Opus · Senior Full-Stack Architect
**Date:** 2026-03-08
**Target IDE:** Claude 4.6 Opus in Google Antigravity IDE
**Stack:** Next.js 14 (App Router) · Supabase (PostgreSQL + Storage) · TypeScript · Tailwind CSS · Turbo Monorepo

---

## Executive Summary

This plan covers three phased enhancements to the Action Item tracking system in the Google Meet Transcript Automation Pipeline. Each phase builds on the existing Kanban board (`apps/web/app/action-items/page.tsx`), the shared type system (`packages/shared/src/types.ts`), the Supabase backend, and the Gemini-powered prompt generation pipeline (`packages/shared/src/generate-action-prompt.ts`).

Phases at a glance:

| Phase | Feature | Effort | Migration |
|-------|---------|--------|-----------|
| 1 | Screenshot attachment to action items | Moderate | `015_action_item_screenshots.sql` |
| 2 | Dynamic category assignment (select or create) | Moderate | `016_action_item_categories.sql` |
| 3 | Multi-select action items → unified prompt | Significant | `017_unified_prompts.sql` |

---

## Phase 1: Screenshot Attachment

### 1.1 Goal

Allow users to attach a single screenshot (PNG/JPG/WebP, max 5 MB) to any action item — either during creation or by editing an existing item. The screenshot must be retrievable by the AI prompt generation pipeline so Claude receives visual context alongside the task description.

### 1.2 Data Model Changes

**New migration: `supabase/migrations/015_action_item_screenshots.sql`**

```sql
-- 1. Add screenshot columns to action_items
ALTER TABLE action_items
  ADD COLUMN screenshot_path  TEXT     DEFAULT NULL,
  ADD COLUMN screenshot_url   TEXT     DEFAULT NULL,
  ADD COLUMN screenshot_alt   TEXT     DEFAULT NULL,
  ADD COLUMN screenshot_size  INTEGER  DEFAULT NULL;

COMMENT ON COLUMN action_items.screenshot_path IS 'Supabase Storage object path (bucket/folder/filename)';
COMMENT ON COLUMN action_items.screenshot_url  IS 'Signed or public URL for rendering in the UI';
COMMENT ON COLUMN action_items.screenshot_alt  IS 'AI-generated alt text describing the screenshot content';
COMMENT ON COLUMN action_items.screenshot_size IS 'File size in bytes';

-- 2. Create the storage bucket (run via Supabase Dashboard or CLI)
-- INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- VALUES (
--   'action-item-screenshots',
--   'action-item-screenshots',
--   false,
--   5242880,  -- 5 MB
--   ARRAY['image/png', 'image/jpeg', 'image/webp']
-- );
```

**Type update: `packages/shared/src/types.ts`**

Add four fields to the `ActionItem` interface:

```typescript
export interface ActionItem {
    // ... existing fields ...

    /** Supabase Storage object path for attached screenshot. */
    screenshot_path: string | null;
    /** Signed URL for rendering the screenshot in the UI. */
    screenshot_url: string | null;
    /** AI-generated alt text describing the screenshot content. */
    screenshot_alt: string | null;
    /** Screenshot file size in bytes. */
    screenshot_size: number | null;
}
```

### 1.3 Backend: API Changes

**New API route: `apps/web/app/api/action-items/[id]/screenshot/route.ts`**

Handles upload, replacement, and deletion of screenshots.

```
POST   /api/action-items/:id/screenshot  — Upload or replace screenshot
DELETE /api/action-items/:id/screenshot  — Remove screenshot
```

**POST handler logic:**

1. Accept `multipart/form-data` with a single `file` field.
2. Validate: file exists, MIME type is `image/png|jpeg|webp`, size ≤ 5 MB.
3. If the action item already has a `screenshot_path`, delete the old object from Supabase Storage first.
4. Upload to `action-item-screenshots/{action_item_id}/{timestamp}_{filename}`.
5. Generate a signed URL (1-hour expiry for security, refreshed on each GET).
6. Optionally: call Gemini with the image to generate a brief `screenshot_alt` description (useful for prompt generation and accessibility).
7. Update the `action_items` row with `screenshot_path`, `screenshot_url`, `screenshot_alt`, `screenshot_size`.
8. Log to `activity_log` with `event_type: 'screenshot_uploaded'`.

**Modify existing routes:**

- `GET /api/action-items` — Include the `screenshot_url` field in the select. Re-sign URLs if they're expired (check `screenshot_path` is set but URL is stale).
- `POST /api/action-items` — Accept optional `screenshot` file in a multipart request, or support a two-step flow (create item → upload screenshot).
- `POST /api/action-items/:id/prompt` — Feed `screenshot_alt` into the `PromptContext` so the generated IDE prompt references the visual context.

### 1.4 Frontend: UI/UX Plan

**Location:** Modify `apps/web/app/action-items/page.tsx` and create `apps/web/components/screenshot-upload.tsx`.

**A. Screenshot Upload Component (`screenshot-upload.tsx`)**

This is a self-contained React component with three states:

| State | Display |
|-------|---------|
| **Empty** | Dashed border dropzone with camera icon. Text: "Drop screenshot or click to upload". Subtle `border-theme-border` styling. |
| **Uploading** | Progress spinner inside the dropzone. File name displayed below. |
| **Attached** | Thumbnail preview (120×80px, `object-cover`, rounded corners). Overlay on hover shows a trash icon (remove) and an expand icon (lightbox). |

**Interaction model:**

- **Drag & drop:** `onDragOver`/`onDrop` handlers on the dropzone `<div>`. Set `e.dataTransfer.effectAllowed = 'copy'`. On drop, read the first `File` from `e.dataTransfer.files`, validate type/size client-side, then upload.
- **Click to upload:** Hidden `<input type="file" accept="image/png,image/jpeg,image/webp">` triggered by clicking the dropzone.
- **Paste from clipboard:** `onPaste` handler on the parent form — check `e.clipboardData.files` for image types. This supports the common "take screenshot → Ctrl+V" workflow.
- **Replacement:** If a screenshot already exists, the dropzone shows the thumbnail. Dropping/pasting a new file triggers a confirmation ("Replace existing screenshot?") then calls DELETE followed by POST.
- **Deletion:** Trash icon on hover calls DELETE, clears the local state.

**Client-side validation before upload:**

- Max 5 MB (show toast: "Screenshot must be under 5 MB")
- Allowed types only (show toast: "Only PNG, JPG, and WebP are supported")
- Single file only (ignore additional files from multi-select)

**B. Integration into the Kanban board**

- **Create modal:** Add the `<ScreenshotUpload>` component below the description textarea in the existing create form. Two-step: create the action item first, then upload the screenshot to the returned ID.
- **Expanded card view:** When `expandedId` is set, show the screenshot thumbnail (if present) between the description and the `<ActionPrompt>` component. Clicking the thumbnail opens a lightbox overlay with the full-resolution image.
- **Card preview:** On the Kanban card itself, show a small camera icon badge in the top-right corner if `screenshot_path` is non-null. This is a visual indicator without loading the actual image on the board.

**C. Lightbox component (`screenshot-lightbox.tsx`)**

Simple overlay: dark backdrop (`bg-black/80`), centered image scaled to fit viewport with `max-h-[85vh] max-w-[90vw]`, close on Escape or backdrop click.

### 1.5 AI Prompt Integration

**Modify `packages/shared/src/generate-action-prompt.ts`:**

Add `screenshot_alt` to the `ActionItemForPrompt` interface:

```typescript
export interface ActionItemForPrompt {
    // ... existing fields ...
    screenshot_alt: string | null;
}
```

In `generateActionItemPrompt()`, add a new section to the user message when `screenshot_alt` is present:

```typescript
if (item.screenshot_alt) {
    parts.push(`\n## Attached Screenshot Context`);
    parts.push(`The developer attached a screenshot to this task. Description of the screenshot:`);
    parts.push(item.screenshot_alt);
    parts.push(`\nUse this visual context to inform your implementation approach. The screenshot may show a bug, a design mockup, an error message, or a UI state that needs attention.`);
}
```

This ensures Claude in Antigravity IDE receives visual context when generating implementation prompts.

---

## Phase 2: Dynamic Category Assignment

### 2.1 Goal

Allow users to assign one or more categories to an action item — either selecting from existing categories or typing a new one inline. Categories should be lightweight (tag-like) and support efficient filtering and grouping on the Kanban board.

### 2.2 Design Decision: Tags vs. Dedicated Field

The current `group_label` field is a free-text `TEXT` column set during AI extraction. It works for grouping on the board but has no normalization, no reuse tracking, and no multi-select.

**Chosen approach: Normalized tag system with a junction table.**

This gives us: deduplication, usage counts, color assignment, and the ability to assign multiple categories per item.

### 2.3 Data Model Changes

**New migration: `supabase/migrations/016_action_item_categories.sql`**

```sql
-- 1. Categories lookup table
CREATE TABLE categories (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    slug        TEXT NOT NULL UNIQUE,           -- lowercase, hyphenated
    color       TEXT DEFAULT NULL,               -- hex color for pill display
    usage_count INTEGER DEFAULT 0,               -- denormalized for sort-by-popularity
    created_by  TEXT DEFAULT 'manual',           -- 'ai' | 'manual'
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_categories_slug ON categories (slug);
CREATE INDEX idx_categories_usage ON categories (usage_count DESC);

-- 2. Junction table: action_items ↔ categories (many-to-many)
CREATE TABLE action_item_categories (
    action_item_id UUID NOT NULL REFERENCES action_items(id) ON DELETE CASCADE,
    category_id    UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    assigned_at    TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (action_item_id, category_id)
);

CREATE INDEX idx_aic_action_item ON action_item_categories (action_item_id);
CREATE INDEX idx_aic_category    ON action_item_categories (category_id);

-- 3. Seed with existing group_label values (one-time migration)
INSERT INTO categories (name, slug, created_by)
SELECT DISTINCT
    group_label,
    lower(regexp_replace(group_label, '[^a-zA-Z0-9]+', '-', 'g')),
    'ai'
FROM action_items
WHERE group_label IS NOT NULL
ON CONFLICT (name) DO NOTHING;

-- 4. Backfill junction table from existing group_label
INSERT INTO action_item_categories (action_item_id, category_id)
SELECT ai.id, c.id
FROM action_items ai
JOIN categories c ON c.name = ai.group_label
WHERE ai.group_label IS NOT NULL
ON CONFLICT DO NOTHING;

-- 5. Update usage counts
UPDATE categories c
SET usage_count = (
    SELECT COUNT(*) FROM action_item_categories aic WHERE aic.category_id = c.id
);

-- 6. RPC: Increment/decrement usage_count atomically
CREATE OR REPLACE FUNCTION update_category_usage()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE categories SET usage_count = usage_count + 1 WHERE id = NEW.category_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE categories SET usage_count = usage_count - 1 WHERE id = OLD.category_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_category_usage
AFTER INSERT OR DELETE ON action_item_categories
FOR EACH ROW EXECUTE FUNCTION update_category_usage();
```

**Type updates: `packages/shared/src/types.ts`**

```typescript
export interface Category {
    id: string;
    name: string;
    slug: string;
    color: string | null;
    usage_count: number;
    created_by: 'ai' | 'manual';
    created_at: string;
}

export interface ActionItem {
    // ... existing fields ...
    /** Categories assigned to this action item (populated via join). */
    categories?: Category[];
}
```

### 2.4 Backend: API Changes

**New API route: `apps/web/app/api/categories/route.ts`**

```
GET  /api/categories              — List all categories (sorted by usage_count DESC)
POST /api/categories              — Create a new category { name: string, color?: string }
```

**Modify existing action item routes:**

- `GET /api/action-items` — Join through `action_item_categories` → `categories` to include `categories[]` on each item. Use Supabase's nested select: `.select('*, action_item_categories(category:categories(*))')`.
- `POST /api/action-items` — Accept optional `category_ids: string[]` and/or `new_categories: string[]` in the request body. For new categories: insert into `categories` table, get back IDs. Then insert all into `action_item_categories`.
- `PATCH /api/action-items/:id` — Accept `category_ids` for updating assignments. Delete existing junction rows, insert new ones (simple replace strategy).

**New API route: `apps/web/app/api/action-items/[id]/categories/route.ts`**

```
PUT /api/action-items/:id/categories — Replace categories for an item
    Body: { category_ids: string[], new_categories?: string[] }
```

### 2.5 Frontend: UI/UX Plan

**A. Category Combobox Component (`apps/web/components/category-combobox.tsx`)**

A combined dropdown + text input (combobox pattern):

| Behavior | Detail |
|----------|--------|
| **Default state** | Text input with placeholder "Add category..." and a subtle dropdown chevron. |
| **On focus/click** | Opens a floating panel below. Top section: list of existing categories sorted by usage count. Each row shows the category name, a colored dot, and the usage count. |
| **Typing** | Filters the dropdown list in real-time (case-insensitive substring match). If no match: show a "Create «{typed text}»" option at the bottom with a + icon. |
| **Selection** | Clicking an existing category or pressing Enter on it adds a pill below the input. Multiple selections allowed. |
| **Create new** | Clicking "Create «{text}»" calls `POST /api/categories`, returns the new category, adds it as a pill. |
| **Pill display** | Each selected category renders as a small pill with the category name and an × to remove. Pill color matches the category's `color` field (or a default gray). |
| **Keyboard nav** | Arrow keys navigate the dropdown, Enter selects, Escape closes, Backspace on empty input removes the last pill. |

**Color assignment for new categories:**

When a user creates a new category, auto-assign a color from a rotating palette of 12 distinguishable colors (avoiding colors already in use by existing categories). The user can change the color later via a color picker in the category management UI.

**B. Integration into Action Items Page**

- **Create modal:** Add the `<CategoryCombobox>` below the priority/effort selectors. Selected categories are submitted alongside the action item.
- **Kanban card:** Display category pills below the title, using the same compact pill style as the existing effort badges. Max 3 visible, "+N more" overflow.
- **Filter bar:** Add a new "Category" filter dropdown (multi-select checkboxes) alongside the existing priority, effort, and assignee filters. Filtering by category queries `action_item_categories` via the API.
- **Board grouping:** Add a new `viewMode` option: `'by-category'` alongside the existing `'grouped'` and `'flat'` modes. Groups items by their primary (first) category.

**C. Backward compatibility with `group_label`**

The `group_label` field remains on the `action_items` table for backward compatibility. The AI extraction pipeline continues to set it. The migration seeds the `categories` table from existing `group_label` values. Over time, the UI will prioritize `categories[]` over `group_label` for display, but both remain queryable.

### 2.6 AI Prompt Integration

Modify `ActionItemForPrompt` to include categories:

```typescript
export interface ActionItemForPrompt {
    // ... existing fields ...
    categories: string[];  // category names
}
```

In the prompt generation, add:

```typescript
if (item.categories.length > 0) {
    parts.push(`- **Categories:** ${item.categories.join(', ')}`);
}
```

This gives Claude topic context that's richer than the single `group_label`.

---

## Phase 3: Multi-Select Action Items → Unified Prompt

### 3.1 Goal

Allow users to select multiple action items on the Kanban board and generate a single, unified implementation prompt that Claude can use to work on all selected tasks in one session. This is critical for related tasks that share context (e.g., "Add auth middleware" + "Add login page" + "Add session management").

### 3.2 Data Model Changes

**New migration: `supabase/migrations/017_unified_prompts.sql`**

```sql
-- Store unified prompts separately from individual action item prompts
CREATE TABLE unified_prompts (
    id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    action_item_ids   UUID[] NOT NULL,             -- ordered array of selected item IDs
    prompt_text       TEXT NOT NULL,
    prompt_model      TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
    version           INTEGER DEFAULT 1,
    feedback          TEXT DEFAULT NULL,            -- 'useful' | 'not_useful'
    generated_at      TIMESTAMPTZ DEFAULT now(),
    created_by        TEXT DEFAULT 'manual'
);

CREATE INDEX idx_unified_prompts_items ON unified_prompts USING GIN (action_item_ids);
```

### 3.3 Backend: API Changes

**New API route: `apps/web/app/api/action-items/unified-prompt/route.ts`**

```
POST /api/action-items/unified-prompt
    Body: { action_item_ids: string[], force?: boolean }
    Returns: { id, prompt, model, version, action_items: [...summaries] }
```

**POST handler logic:**

1. Validate: `action_item_ids` is a non-empty array, max 10 items.
2. Fetch all action items by ID in a single query.
3. For each item with a `transcript_id`, batch-fetch the transcript context (meeting title, date, surrounding text).
4. Fetch related decisions across all referenced transcripts.
5. Build a **unified context document** that groups the items by relationship:
   - Same transcript → "These tasks came from the same meeting"
   - Same `group_label` or category → "These tasks belong to the same topic area"
   - Same assignee → "All assigned to {name}"
   - Include all `screenshot_alt` descriptions if present
6. Call Gemini with a modified system prompt (see below) that generates a **multi-task implementation plan**.
7. Store the result in `unified_prompts`.
8. Log to `activity_log` with `event_type: 'unified_prompt_generated'`.

**Modified Gemini system prompt for unified generation:**

```
You are generating a UNIFIED implementation prompt that covers multiple related tasks.
The developer will paste this into an AI IDE to work on all tasks in a single session.

Structure the output as:
1. **Session Objective** — One paragraph summarizing what this coding session will accomplish
2. **Task Breakdown** — Numbered list of each task with its priority and effort
3. **Shared Context** — Common codebase areas, patterns, and constraints relevant to ALL tasks
4. **Implementation Order** — Recommended sequence (consider dependencies between tasks)
5. **Per-Task Instructions** — For each task, 3-6 sentences of specific guidance
6. **Integration Points** — Where the tasks connect to each other (shared state, common API routes, etc.)
7. **Acceptance Criteria** — Combined checklist covering all tasks
8. **Testing Plan** — What to verify across the full set

Critical: Identify DEPENDENCIES between tasks and surface them explicitly.
If Task B depends on Task A, say so and explain the handoff point.
```

### 3.4 Frontend: UI/UX Plan

**A. Selection Mode on the Kanban Board**

Add a selection mechanism to `apps/web/app/action-items/page.tsx`:

**New state:**

```typescript
const [selectionMode, setSelectionMode] = useState(false);
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
```

**Entering selection mode:**

- Add a "Select" toggle button in the top action bar (next to the existing "Create" button). When active, it gets a highlighted state (`bg-violet-500/20 text-violet-400`).
- Alternative: long-press on a card enters selection mode automatically (mobile-friendly).

**Card selection behavior (when `selectionMode` is true):**

- Each Kanban card shows a checkbox in the top-left corner (replacing the priority dot temporarily).
- Clicking the card toggles its selection (doesn't expand it).
- Selected cards get a `ring-2 ring-violet-500 bg-violet-500/5` visual treatment.
- A floating counter pill appears at the bottom of the screen: "{N} selected".

**B. Floating Action Bar**

When `selectedIds.size > 0`, show a floating bar at the bottom of the viewport:

```
┌─────────────────────────────────────────────────────────────┐
│  ✓ 3 action items selected     [Generate Unified Prompt]  [Clear] │
└─────────────────────────────────────────────────────────────┘
```

Styling: `fixed bottom-4 left-1/2 -translate-x-1/2` with `glass-card` effect (frosted glass, matching existing design language). Max-width constrained, centered.

**C. Unified Prompt Modal**

Clicking "Generate Unified Prompt" opens a modal (similar to the existing `ActionPrompt` component but larger):

| Section | Content |
|---------|---------|
| **Header** | "Unified Prompt — {N} tasks" with model badge and version |
| **Task chips** | Row of pills showing selected task titles (truncated). Each chip is clickable to scroll to that task's section in the prompt. |
| **Prompt body** | Scrollable `<pre>` with the full generated prompt. Same styling as `ActionPrompt` but in a larger modal (80% viewport height). |
| **Actions** | "Copy to Clipboard" (primary), "Regenerate" (secondary), "Export as .md" (tertiary) |
| **Feedback** | Same useful/not_useful buttons as the single-item prompt |

**D. Prompt Viewer Component (`apps/web/components/unified-prompt-modal.tsx`)**

```typescript
interface UnifiedPromptModalProps {
    selectedItems: ActionItem[];
    onClose: () => void;
    onClearSelection: () => void;
}
```

The component manages its own loading/generating state, calls the unified prompt API, and displays the result. On successful generation, it also offers a "Copy & Clear Selection" button that copies the prompt and resets the selection state.

### 3.5 Selection Persistence

Selected items are stored in component state only (not persisted to the database or URL). If the user navigates away and comes back, the selection is cleared. This is intentional — unified prompts are ephemeral workflow tools, not persistent artifacts.

However, the generated unified prompts ARE persisted in the `unified_prompts` table, so users can retrieve past unified prompts via a "Recent Unified Prompts" section (future enhancement).

### 3.6 Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + A` | Select all visible items (when selection mode is active) |
| `Escape` | Exit selection mode, clear selection |
| `Ctrl/Cmd + Enter` | Generate unified prompt (when items are selected) |
| `Ctrl/Cmd + Shift + C` | Copy last generated unified prompt |

---

## Cross-Cutting Concerns

### Activity Logging

All new mutations log to `activity_log`:

| Event Type | Entity Type | Trigger |
|------------|-------------|---------|
| `screenshot_uploaded` | `action_item` | Screenshot attached |
| `screenshot_removed` | `action_item` | Screenshot deleted |
| `category_created` | `category` | New category created via combobox |
| `categories_updated` | `action_item` | Categories changed on an item |
| `unified_prompt_generated` | `unified_prompt` | Multi-select prompt generated |

### Type Safety

All new interfaces go in `packages/shared/src/types.ts` and are exported from `packages/shared/src/index.ts`. API routes import types from `@meet-pipeline/shared`.

### Migration Ordering

Migrations must be applied in sequence: `015` → `016` → `017`. Each is independent (no cross-dependencies between the three phases), but numbering ensures deterministic ordering.

### Testing Strategy

| Layer | Tool | Coverage |
|-------|------|----------|
| API routes | Manual testing via Supabase dashboard + `curl` | All CRUD operations |
| Type checking | `tsc --noEmit` across the monorepo | All new interfaces |
| UI components | Browser testing | Drag-drop, combobox interaction, selection mode |
| Integration | End-to-end: create item → attach screenshot → add categories → select multiple → generate unified prompt | Full workflow |

---

## Implementation Priority & Sequence

```
Week 1:  Phase 2 (Categories) — Foundation for better organization
         ↳ Migration, API, combobox component, board integration

Week 2:  Phase 3 (Unified Prompt) — Highest user value
         ↳ Selection mode, API, prompt generation, modal

Week 3:  Phase 1 (Screenshots) — Requires Supabase Storage setup
         ↳ Storage bucket, upload API, upload component, AI alt-text
```

Categories come first because they improve the data model that unified prompts will leverage. Unified prompts come second because they deliver the highest immediate developer productivity gain. Screenshots follow as a quality-of-life improvement that enriches prompt context.

---

*This plan is designed to be executed by Claude 4.6 Opus in Google Antigravity IDE with full codebase access. Each phase can be implemented independently, and each section contains enough specificity for the AI to begin work without additional context.*
