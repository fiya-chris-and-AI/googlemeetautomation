# Optimized Prompt — Two-Column Assignee Layout with Shared Indicators

Use the following prompt in your IDE session. It reflects the **current** state of the codebase (including the effort estimation, duplicate filtering, and all recent changes).

---

## Prompt

```
You are working on the MeetScript codebase — a Next.js 14 (App Router) + Supabase + TypeScript monorepo using Tailwind CSS.

### Task

Redesign the Action Items board from its current **single-stream, status-grouped layout** into a **two-column assignee layout** with shared-item indicators. Generate an implementation plan first, then implement it.

### Current Layout (What To Change)

**File:** `apps/web/app/action-items/page.tsx` (~860 lines, single `'use client'` component)

Right now the board renders as vertical status sections. The `COLUMNS` constant (line 7–10) defines two status bands — "Open" and "Done" — and each renders as a full-width block. Within each status block, items are sub-grouped by `group_label` (e.g., "Admin Dashboard", "Admin Tasks", "AI Research") with collapsible headers. The layout flows top-to-bottom in a single column, so ALL items for ALL assignees appear interleaved in the same stream.

The key rendering loop is at lines 428–563:
```
COLUMNS.map(status) →
    status header (glass-card) →
        groups.map(group_label) →
            collapsible header →
                grid of ActionItemCards
```

### Desired Layout (Two Columns + Shared Indicators)

Replace the single-stream layout with **two side-by-side assignee columns**:

```
┌─────────────────────────────┬─────────────────────────────┐
│     Dr. Lutfiya Miller      │        Chris Müller         │
│         (left column)       │       (right column)        │
├─────────────────────────────┼─────────────────────────────┤
│ ● Open                      │ ● Open                      │
│   ▸ Admin Tasks         (2) │   ▸ Admin Dashboard     (1) │
│     [Cancel AppSumo...]  🤝 │     [Add admin image...] 🤝 │
│     [Review contract...]    │     [Fix login bug...]      │
│   ▸ AI Research         (1) │   ▸ Product             (3) │
│     [Create prototype...]   │     [Ship v2 API...]        │
│                             │     [Update docs...]        │
│ ● Done                      │ ● Done                      │
│   ▸ Onboarding          (1) │   ▸ DevOps              (2) │
│     [Set up Slack...]       │     [Configure CI...]       │
└─────────────────────────────┴─────────────────────────────┘
```

**Column assignment rules:**
- Left column: Items where `assigned_to === 'Lutfiya Miller'`
- Right column: Items where `assigned_to === 'Chris Müller'`
- Items where `assigned_to === null` (unassigned): Show in BOTH columns with a subtle "Unassigned" badge, or show in a small section below the two columns.

**Within each column**, preserve the existing hierarchy:
1. Status sections (Open, then Done) — keep using the `COLUMNS` constant
2. Group label sub-sections (collapsible) — keep using the `groupedByColumn` pattern
3. Individual `ActionItemCard` components

The key difference: instead of one stream of all items, each column independently filters and groups only the items for that assignee.

### Shared Item Indicators

Since the extraction pipeline creates **two separate `ActionItem` rows** when a task is assigned to both people (one row for Lutfiya, one for Chris), shared tasks already exist as pairs in the database. Detect and indicate these:

**Detection logic** (new `useMemo`):
```typescript
// A "shared item" is a pair of ActionItems with:
//   - Same title (case-insensitive trim)
//   - Same transcript_id (both extracted from the same meeting)
//   - One assigned to 'Lutfiya Miller', the other to 'Chris Müller'

const sharedItemIds = useMemo(() => {
    const shared = new Set<string>();
    const lutfiyaItems = items.filter(i => i.assigned_to === 'Lutfiya Miller');
    const chrisItems = items.filter(i => i.assigned_to === 'Chris Müller');

    for (const li of lutfiyaItems) {
        const match = chrisItems.find(ci =>
            ci.title.trim().toLowerCase() === li.title.trim().toLowerCase() &&
            ci.transcript_id === li.transcript_id
        );
        if (match) {
            shared.add(li.id);
            shared.add(match.id);
        }
    }
    return shared;
}, [items]);
```

**Visual indicator on shared items:**
- Add a small "🤝 Shared" badge on the `ActionItemCard` when `sharedItemIds.has(item.id)`.
- Style: `text-[10px] font-medium text-violet-400` with a subtle `bg-violet-500/10 px-1.5 py-0.5 rounded-full` — consistent with the existing badge patterns for "AI", "Duplicate", and effort labels.
- The item still appears in BOTH columns (Lutfiya's copy in the left, Chris's copy in the right), but the badge makes it visually clear that this is a joint task.

**Do NOT remove shared items from either column** — they should appear in both. The badge is purely informational.

### Column Headers

Each column gets a sticky header with:
- Assignee name (e.g., "Dr. Lutfiya Miller", "Chris Müller")
- Total item count for that column
- A subtle colored accent: violet for Lutfiya (`border-violet-500`), blue for Chris (`border-blue-500`)

Example:
```jsx
<div className="glass-card p-4 mb-4 border-l-4 border-violet-500 flex items-center justify-between sticky top-0 z-10">
    <h2 className="text-lg font-semibold text-theme-text-primary">Dr. Lutfiya Miller</h2>
    <span className="text-sm text-theme-text-tertiary font-medium">{lutfiyaCount}</span>
</div>
```

### Layout Specifications

1. **Two-column grid**: `grid grid-cols-1 md:grid-cols-2 gap-6` for the main board area. Each column is an independent vertical stack.

2. **Within each column**, keep the existing rendering pattern:
   - Status section header (Open / Done) with the amber/green dot
   - In "grouped" mode: collapsible `group_label` sub-sections — but render cards in a **single-column stack** (not a 3-column grid), since each assignee column is already narrow. Replace `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` with `grid-cols-1` inside each group.
   - In "flat" mode: simple vertical card list.

3. **Responsive behavior**: On mobile (`< md`), stack columns vertically — Lutfiya on top, Chris below.

4. **Unassigned items**: Items with `assigned_to === null` should appear in a small "Unassigned" section spanning both columns below the main grid, styled as a full-width row with muted colors.

### Data Flow Changes

The `groupedByColumn` useMemo (lines 108–137) currently groups by status → group_label. It needs to be restructured to group by **assignee → status → group_label**:

```typescript
// New shape: Record<assignee, Record<status, { label, items }[]>>
const groupedByAssignee = useMemo(() => {
    const assignees = ['Lutfiya Miller', 'Chris Müller'] as const;
    const result: Record<string, Record<ActionItemStatus, { label: string | null; items: ActionItem[] }[]>> = {};

    for (const assignee of assignees) {
        const assigneeItems = filtered.filter(i => i.assigned_to === assignee);
        result[assignee] = { open: [], in_progress: [], done: [], dismissed: [] };

        for (const col of COLUMNS) {
            const colItems = assigneeItems.filter(i => i.status === col.key);
            // ... same group_label bucketing logic as current lines 117–131
            result[assignee][col.key] = groups;
        }
    }
    return result;
}, [filtered]);
```

### What To Preserve (Do Not Break)

All of the following features must continue working exactly as they do today:

- **Filter bar** (lines 289–421): Search, assignee filter, priority filter, effort filter, source filter, duplicate toggle, grouped/flat toggle, expand/collapse all. The assignee filter should still work — when "Lutfiya Miller" is selected, the Chris column should appear empty (not hidden).
- **ActionItemCard** sub-component (line 577+): Completely untouched. It already displays priority dots, effort badges, duplicate indicators, Ask AI mini-chat, group label editor, status transitions. Just pass it the same props.
- **DuplicateOfLabel** sub-component (line 856+): Untouched.
- **FilterSelect** sub-component (line 844+): Untouched.
- **Create modal** (lines 566–573): Untouched.
- **Header buttons**: Estimate Effort, Smart Group, Add Item — all untouched.
- **Handlers**: `fetchItems`, `updateStatus`, `dismissItem`, `handleCreate`, `handleSmartGroup`, `handleEstimateEffort`, `handleGroupLabelSave` — all untouched.

### Constraints

- **Only modify `apps/web/app/action-items/page.tsx`** — this is purely a frontend layout refactor. No API changes, no database changes, no new files.
- **Do not break any sub-components.** Only the parent layout JSX (lines 424–563) and the `groupedByColumn` useMemo (lines 108–137) need to change.
- Preserve all existing Tailwind class conventions: `glass-card`, `btn-primary`, `input-glow`, `badge-info`, `text-theme-text-primary`, `bg-theme-overlay`, etc.
- Pass `sharedItemIds` (or a boolean `isShared`) as a new prop to `ActionItemCard` — add it to the card's props interface. This is the only change to the sub-component.
- The `COLUMNS` constant (lines 7–10) should remain as-is; it's used within each assignee column.

### Implementation Plan Format

Structure your plan as:
1. **New data structures**: `sharedItemIds` detection, `groupedByAssignee` memo
2. **Layout JSX replacement**: What lines to replace, the new two-column grid structure
3. **Column rendering**: How each assignee column renders its status→group→cards hierarchy
4. **Shared item indicator**: Prop addition to `ActionItemCard`, badge rendering
5. **Unassigned items section**: Where and how to render items with `assigned_to === null`
6. **Responsive & edge cases**: Mobile stacking, empty columns, filter interactions
```

---

## Why This Prompt Is Optimized

| Technique | How It's Applied |
|---|---|
| **ASCII layout diagram** | Shows the exact visual structure (two columns, status sections within each, group sub-sections) — eliminates ambiguity about what "two columns" means |
| **Two columns, not three** | The user's screenshot and description clearly shows they want Lutfiya on the left and Chris on the right, with shared items indicated by badges *within* both columns — not a separate third "shared" column |
| **Shared detection algorithm provided** | Gives the exact `useMemo` implementation for matching pairs by title + transcript_id, and specifies that shared items appear in BOTH columns with a badge (not moved to a separate location) |
| **Current rendering loop quoted** | Describes the exact loop structure (COLUMNS → status header → groups → cards) at lines 428–563, so the model knows precisely what to replace |
| **Preserves-list is exhaustive** | Lists every handler, sub-component, filter, and UI element that must NOT change — prevents accidental regressions |
| **Inner-column grid change specified** | Explicitly notes that card grids inside groups should change from `lg:grid-cols-3` to `grid-cols-1` since each column is now narrower |
| **Sticky column headers** | Provides the exact JSX for assignee headers with the color scheme (violet for Lutfiya, blue for Chris) matching the project's theme |
| **Scoped to one file, one section** | Lines 108–137 (data) and 424–563 (JSX) are the only things that change — everything else is preserved |
