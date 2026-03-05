# Optimized Prompt — Action Items: 3-Column Assignee Layout

Use the following prompt in your IDE session. It is grounded in the exact current implementation of `action-items/page.tsx` (855 lines).

---

## Prompt

```
You are working on the MeetScript codebase — a Next.js 14 (App Router) + Supabase + TypeScript monorepo. The project uses Tailwind CSS for styling.

### Task

Redesign the Action Items board layout from its current **status-based columns** (Open / Done) to a **3-column assignee-based layout**. Generate an implementation plan first, then implement it.

### Current Implementation

**File:** `apps/web/app/action-items/page.tsx` (855 lines, single `'use client'` component)

**Current layout structure:**
- The board is organized by the `COLUMNS` constant (line 7–10), which defines two status-based sections: `open` and `done`.
- Each status section renders as a full-width block with a header bar, then a responsive grid of `ActionItemCard` components inside it.
- In "grouped" view mode, items within each status are sub-grouped by `group_label` (via the `groupedByColumn` useMemo on lines 95–124), with collapsible headers.
- In "flat" view mode, items render in a simple 3-column grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`).

**Key data facts:**
- `assigned_to` field values are normalized to exactly: `"Lutfiya Miller"`, `"Chris Müller"`, or `null`.
- Normalization happens at extraction time via `CANONICAL_NAMES` in `apps/web/app/api/action-items/extract/route.ts`.
- When a task is assigned to both people, the extraction creates **two separate `ActionItem` rows** — one per person. There is no "both" value; shared tasks simply appear in both people's lists.
- Items with `assigned_to = null` exist (unassigned items).
- The `ActionItem` interface is defined in `packages/shared/src/types.ts` (lines 93–112). Relevant fields: `id`, `title`, `assigned_to`, `status`, `priority`, `due_date`, `group_label`, `is_duplicate`.

**Existing sub-components (do not break):**
- `ActionItemCard` (line 577–832): Renders individual cards with expand/collapse, priority dots, Ask AI mini-chat, group label editor, status transitions (open↔done), dismiss. It receives props: `item`, `isOverdue`, `isExpanded`, `onToggleExpand`, `onStatusChange`, `onDismiss`, `onGroupLabelSave`.
- `FilterSelect` (line 834–854): Dropdown filter component.

**Existing features to preserve:**
- All filter controls (search, assignee, priority, source) in the glass-card filter bar (lines 280–350)
- Grouped / Flat view toggle
- Expand All / Collapse All for grouped view
- Smart Group button + Add Item button in header
- Create modal (lines 491–571)
- Overdue detection (`isOverdue` helper, line 245)
- Optimistic status updates, dismiss, group label save

### Required New Layout

Replace the current status-based sections with a **fixed 3-column layout**:

| Left Column | Center Column | Right Column |
|---|---|---|
| **Dr. Lutfiya Miller** | **Shared** | **Chris Müller** |
| Items where `assigned_to === 'Lutfiya Miller'` | Items that appear in BOTH Lutfiya's AND Chris's lists (i.e., same `title` + `source_text` exists for both assignees, OR items linked by `group_label` to the same extraction batch) | Items where `assigned_to === 'Chris Müller'` |

**Column definitions:**

```typescript
const ASSIGNEE_COLUMNS = [
    { key: 'lutfiya', label: 'Dr. Lutfiya Miller', assignee: 'Lutfiya Miller' },
    { key: 'shared',  label: 'Shared',             assignee: null },  // derived
    { key: 'chris',   label: 'Chris Müller',        assignee: 'Chris Müller' },
];
```

**Identifying "Shared" items:**
Since the extraction pipeline creates two separate rows when both people are assigned, detect shared items by matching pairs: two `ActionItem` rows with the same `title` (case-insensitive) AND the same `transcript_id`, where one is assigned to `'Lutfiya Miller'` and the other to `'Chris Müller'`. When a shared pair is detected:
- Show the item **once** in the center "Shared" column (pick either row; display both assignee badges).
- Do **not** also show it in the left or right individual columns.
- Both underlying rows should still be updated when status changes (mark both as done, etc.).

**Unassigned items** (`assigned_to === null`): Display in a small "Unassigned" section below the 3-column grid, or as a subtle row spanning all three columns.

### Layout Specifications

1. **3-column grid**: Use `grid grid-cols-1 md:grid-cols-3 gap-6` for the main board area. Each column should be a vertical card stack.

2. **Column headers**: Each column gets a header styled like the current status section headers (glass-card with colored dot). Use distinct colors:
   - Lutfiya: `bg-violet-500` dot
   - Shared: `bg-amber-500` dot
   - Chris: `bg-blue-500` dot

3. **Within each column**, items should still support the existing view modes:
   - **Grouped**: Sub-group by `group_label` with collapsible headers (reuse the current group rendering logic from lines 392–483, but render items in a single-column stack instead of a 3-col grid).
   - **Flat**: Simple vertical card stack.

4. **Status indicators on cards**: Since we're no longer splitting by status, add a visible status badge to each `ActionItemCard` — a small colored chip:
   - Open: amber dot/badge
   - Done: green dot/badge with a subtle line-through on the title text
   - Keep the existing status transition buttons (Done / Reopen) on each card.

5. **Status filter**: Add a new filter to the filter bar for status (`All`, `Open`, `Done`) so users can show/hide completed items. Default to showing `Open` items only.

6. **Column counts**: Show item count in each column header (e.g., "Dr. Lutfiya Miller · 8").

7. **Responsive behavior**: On mobile (`< md`), stack columns vertically with Lutfiya on top, Shared in the middle, Chris at the bottom.

### Constraints

- **Only modify `apps/web/app/action-items/page.tsx`** — no API changes, no database changes, no new files. This is purely a frontend layout refactor.
- **Do not break `ActionItemCard` or `FilterSelect`** sub-components. They should remain unchanged; only the parent layout logic changes.
- Preserve all existing Tailwind class conventions: `glass-card`, `btn-primary`, `input-glow`, `badge-info`, `text-theme-text-primary`, `bg-theme-overlay`, etc.
- Keep the `assigneeFilter` dropdown functional — when a specific assignee is selected, the other two columns should still appear but be empty (preserving the spatial layout).
- The `useMemo` for `groupedByColumn` (lines 95–124) will need to be rewritten to group by assignee column instead of status column. The `COLUMNS` constant (lines 7–10) should be replaced or supplemented with `ASSIGNEE_COLUMNS`.

### Implementation Plan Format

Structure your plan as:
1. **Data layer changes**: New `useMemo` hooks for shared-item detection and per-column grouping
2. **Layout changes**: What JSX to replace and with what
3. **State changes**: Any new state variables needed (e.g., status filter)
4. **Card changes**: What to add to `ActionItemCard` for status visibility
5. **Edge cases**: Unassigned items, items with no match for "shared" detection, filter interactions
```

---

## Why This Prompt Is Optimized

| Technique | How It's Applied |
|---|---|
| **Line-number references** | Points to exact lines (7–10, 95–124, 280–350, 491–571, 577–832) so the model knows precisely what to modify vs. preserve |
| **Canonical field values stated** | Spells out `'Lutfiya Miller'`, `'Chris Müller'`, and `null` — the exact strings in the database — eliminating ambiguity |
| **"Shared" detection algorithm specified** | Defines the matching logic (same title + transcript_id, different assignees) instead of leaving it vague |
| **Preserves what works** | Explicitly lists features to keep (filters, grouped view, Ask AI, modals) so the model doesn't accidentally remove them |
| **Tailwind class vocabulary provided** | Names the project's custom classes (`glass-card`, `btn-primary`, `badge-info`) so generated code stays consistent |
| **Scoped to one file** | States clearly: only `page.tsx` changes, no API/DB work. Prevents scope creep. |
| **Responsive spec included** | Defines mobile behavior (`< md` breakpoint) to avoid the model guessing |
| **Plan format requested** | Asks for a structured plan with specific sections, matching the user's request for an implementation plan |
| **Edge cases called out** | Unassigned items, filter interactions, and status badge additions are specified upfront |
