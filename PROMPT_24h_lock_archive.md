# Implementation Prompt: 24-Hour TTL with Lock/Archive System

> **Target model:** Claude 4.6 Opus
> **Target IDE:** Google Project IDX (Antigravity)
> **Codebase:** meet-transcript-pipeline (MeetScript)

---

## System Context

You are implementing a 24-hour TTL (time-to-live) system with locking and auto-archival for the MeetScript application — a Next.js 14 monorepo that processes Google Meet transcripts and extracts action items and decisions.

**Architecture snapshot:**

- **Monorepo** managed by Turborepo at the repository root
- **Frontend:** `apps/web/` — Next.js 14 App Router, React 18, TypeScript, Tailwind CSS, Supabase client
- **Backend:** `apps/worker/` — Node.js + Express, Gmail listener, Gemini extraction, OpenAI embeddings
- **Shared:** `packages/shared/` — TypeScript types (`types.ts`), extraction logic, normalizeAssignee utility
- **Database:** Supabase (PostgreSQL + pgvector), migrations in `supabase/migrations/`
- **Auth:** Cookie-based auth with two admin users: **Lutfiya Miller** and **Chris Müller** (resolved via `normalizeAssignee()`)

**Existing tables relevant to this task:**

```sql
-- action_items (migration 002 + 003 + 005 + 006)
-- Columns: id TEXT PK, transcript_id TEXT FK, title TEXT, description TEXT,
--   assigned_to TEXT, status TEXT ('open'|'in_progress'|'done'|'dismissed'),
--   priority TEXT, effort TEXT, due_date DATE, source_text TEXT,
--   created_by TEXT ('ai'|'manual'), group_label TEXT,
--   is_duplicate BOOLEAN, duplicate_of TEXT FK,
--   created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ, completed_at TIMESTAMPTZ

-- decisions (migration 007 + 008)
-- Columns: id TEXT PK, transcript_id TEXT FK, decision_text TEXT,
--   context TEXT, topic TEXT, domain TEXT, confidence TEXT,
--   participants TEXT[], decided_at TIMESTAMPTZ, source_text TEXT,
--   embedding VECTOR(1536), superseded_by TEXT FK (self-ref),
--   status TEXT ('active'|'superseded'|'reversed'|'under_review'|'completed'),
--   created_by TEXT ('ai'|'manual'),
--   created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ

-- activity_log (migration 002)
-- Columns: id TEXT PK, event_type TEXT, entity_type TEXT,
--   entity_id TEXT, actor TEXT ('system'|'Lutfiya'|'Chris'),
--   summary TEXT, metadata JSONB, created_at TIMESTAMPTZ
```

**Existing API routes (all in `apps/web/app/api/`):**

| Route | File | Methods |
|---|---|---|
| `/api/action-items` | `action-items/route.ts` | GET (list with filters), POST (create) |
| `/api/action-items/[id]` | `action-items/[id]/route.ts` | GET, PATCH, DELETE (soft-delete → 'dismissed') |
| `/api/decisions` | `decisions/route.ts` | GET (list with filters), POST (create + embed) |
| `/api/decisions/[id]` | `decisions/[id]/route.ts` | GET, PATCH |

**Existing frontend pages:**

| Page | File |
|---|---|
| Action Items (Kanban) | `apps/web/app/action-items/page.tsx` |
| Decision Ledger | `apps/web/app/decisions/page.tsx` |
| Dashboard | `apps/web/app/page.tsx` |
| Sidebar (nav + counts) | `apps/web/components/sidebar.tsx` |

**Existing TypeScript types (in `packages/shared/src/types.ts`):**

```typescript
export type ActionItemStatus = 'open' | 'in_progress' | 'done' | 'dismissed';
export interface ActionItem {
  id: string; transcript_id: string | null; title: string;
  description: string | null; assigned_to: string | null;
  status: ActionItemStatus; priority: ActionItemPriority;
  effort: ActionItemEffort | null; due_date: string | null;
  source_text: string | null; created_by: ActionItemCreatedBy;
  created_at: string; updated_at: string; completed_at: string | null;
  group_label: string | null; is_duplicate: boolean; duplicate_of: string | null;
}

export type DecisionStatus = 'active' | 'superseded' | 'reversed' | 'under_review' | 'completed';
export interface Decision {
  id: string; transcript_id: string | null; topic: string | null;
  decision_text: string; context: string | null; domain: DecisionDomain;
  confidence: DecisionConfidence; participants: string[];
  decided_at: string; source_text: string | null;
  superseded_by: string | null; status: DecisionStatus;
  created_by: DecisionCreatedBy; created_at: string; updated_at: string;
  meeting_title?: string;
}
```

---

## Feature Requirements

Implement a **24-hour TTL with lock/archive** system for both action items and decisions. The business rules are:

1. **24-hour visibility window:** When an action item or decision is created (either by AI extraction or manual entry), it appears in the normal active view for exactly 24 hours from `created_at`.

2. **Locking:** Either admin user (Lutfiya Miller or Chris Müller) can **lock** any action item or decision during that 24-hour window. Locking prevents the item from being auto-archived. A locked item remains in the active view indefinitely (until manually unlocked or its status otherwise changes). The lock records who locked it and when.

3. **Auto-archival:** After 24 hours, any action item or decision that is **not locked** is automatically moved to `archived` status. Archived items are removed from the default active views but remain fully accessible in a dedicated Archive section.

4. **Archive accessibility:** Both admin users can browse the archive. Archived items are read-only from the archive view (they can be restored/unlocked back to active if needed).

5. **Unlock:** A locked item can be unlocked by either admin. Unlocking restarts the 24-hour TTL from the moment of unlock (i.e., `updated_at` is refreshed, and if 24 hours pass without re-locking, it archives).

---

## Implementation Plan

Execute all steps below in order. After each step, verify the change compiles/passes lint.

### Step 1 — Database Migration (`supabase/migrations/010_lock_archive.sql`)

Create a new migration file `supabase/migrations/010_lock_archive.sql`:

```sql
-- 24-hour TTL with lock/archive support for action items and decisions

-- ── Action Items ────────────────────────────────────────
ALTER TABLE action_items
  ADD COLUMN is_locked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN locked_by TEXT,            -- 'Lutfiya Miller' | 'Chris Müller'
  ADD COLUMN locked_at TIMESTAMPTZ,
  ADD COLUMN archived_at TIMESTAMPTZ;   -- NULL = not archived

CREATE INDEX idx_action_items_locked ON action_items(is_locked) WHERE is_locked = true;
CREATE INDEX idx_action_items_archived ON action_items(archived_at) WHERE archived_at IS NOT NULL;

-- ── Decisions ───────────────────────────────────────────
ALTER TABLE decisions
  ADD COLUMN is_locked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN locked_by TEXT,
  ADD COLUMN locked_at TIMESTAMPTZ,
  ADD COLUMN archived_at TIMESTAMPTZ;

CREATE INDEX idx_decisions_locked ON decisions(is_locked) WHERE is_locked = true;
CREATE INDEX idx_decisions_archived ON decisions(archived_at) WHERE archived_at IS NOT NULL;

-- ── Auto-archive function ───────────────────────────────
-- Archives unlocked items older than 24 hours.
-- Called periodically via cron or API endpoint.
CREATE OR REPLACE FUNCTION archive_expired_items()
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  action_count INT;
  decision_count INT;
BEGIN
  -- Archive unlocked action items past 24h TTL
  -- TTL anchor: created_at for never-unlocked items, updated_at for previously unlocked items
  WITH archived AS (
    UPDATE action_items
    SET archived_at = now(),
        status = 'archived',
        updated_at = now()
    WHERE is_locked = false
      AND archived_at IS NULL
      AND status NOT IN ('dismissed')
      AND created_at < now() - interval '24 hours'
      AND (locked_at IS NULL OR updated_at < now() - interval '24 hours')
    RETURNING id
  )
  SELECT count(*) INTO action_count FROM archived;

  -- Archive unlocked decisions past 24h TTL
  WITH archived AS (
    UPDATE decisions
    SET archived_at = now(),
        status = 'archived',
        updated_at = now()
    WHERE is_locked = false
      AND archived_at IS NULL
      AND created_at < now() - interval '24 hours'
      AND (locked_at IS NULL OR updated_at < now() - interval '24 hours')
    RETURNING id
  )
  SELECT count(*) INTO decision_count FROM archived;

  RETURN json_build_object(
    'action_items_archived', action_count,
    'decisions_archived', decision_count,
    'run_at', now()
  );
END;
$$;
```

### Step 2 — Update Shared Types (`packages/shared/src/types.ts`)

Add `'archived'` to both status union types and add the lock/archive fields to both interfaces:

```typescript
// Update ActionItemStatus:
export type ActionItemStatus = 'open' | 'in_progress' | 'done' | 'dismissed' | 'archived';

// Add to ActionItem interface:
export interface ActionItem {
  // ... all existing fields unchanged ...
  is_locked: boolean;
  locked_by: string | null;
  locked_at: string | null;
  archived_at: string | null;
}

// Update DecisionStatus:
export type DecisionStatus = 'active' | 'superseded' | 'reversed' | 'under_review' | 'completed' | 'archived';

// Add to Decision interface:
export interface Decision {
  // ... all existing fields unchanged ...
  is_locked: boolean;
  locked_by: string | null;
  locked_at: string | null;
  archived_at: string | null;
}
```

### Step 3 — Lock/Unlock API Endpoints

**Create `apps/web/app/api/action-items/[id]/lock/route.ts`:**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '../../../../../lib/supabase';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/action-items/:id/lock — Lock an action item.
 * Body: { actor: 'Lutfiya Miller' | 'Chris Müller' }
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const { actor } = await req.json();

  if (!actor || !['Lutfiya Miller', 'Chris Müller'].includes(actor)) {
    return NextResponse.json({ error: 'Valid actor required' }, { status: 400 });
  }

  const supabase = getServerSupabase();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('action_items')
    .update({ is_locked: true, locked_by: actor, locked_at: now, updated_at: now })
    .eq('id', id)
    .is('archived_at', null)          // Cannot lock already-archived items from here
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Item not found or already archived' }, { status: 404 });
  }

  await supabase.from('activity_log').insert({
    event_type: 'action_item_locked',
    entity_type: 'action_item',
    entity_id: id,
    actor,
    summary: `Action item locked: ${data.title}`,
    metadata: { locked_by: actor },
  });

  return NextResponse.json(data);
}

/**
 * DELETE /api/action-items/:id/lock — Unlock an action item.
 * Body: { actor: 'Lutfiya Miller' | 'Chris Müller' }
 * Unlocking resets the 24h TTL by updating updated_at.
 */
export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const { actor } = await req.json();

  if (!actor || !['Lutfiya Miller', 'Chris Müller'].includes(actor)) {
    return NextResponse.json({ error: 'Valid actor required' }, { status: 400 });
  }

  const supabase = getServerSupabase();
  const now = new Date().toISOString();

  // Unlock and reset TTL anchor (updated_at = now)
  const { data, error } = await supabase
    .from('action_items')
    .update({ is_locked: false, locked_by: null, locked_at: null, updated_at: now })
    .eq('id', id)
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }

  await supabase.from('activity_log').insert({
    event_type: 'action_item_unlocked',
    entity_type: 'action_item',
    entity_id: id,
    actor,
    summary: `Action item unlocked (24h TTL restarted): ${data.title}`,
    metadata: { unlocked_by: actor },
  });

  return NextResponse.json(data);
}
```

**Create identical `apps/web/app/api/decisions/[id]/lock/route.ts`** — same pattern, replace `action_items` → `decisions`, `data.title` → `data.decision_text.slice(0, 80)`, entity_type → `'decision'`, event_type prefix → `'decision_locked'`/`'decision_unlocked'`.

### Step 4 — Archive API Endpoint

**Create `apps/web/app/api/archive/route.ts`:**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '../../../lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * GET /api/archive — List archived action items and decisions.
 * Query params:
 *   type    — 'action_items' | 'decisions' | 'all' (default: 'all')
 *   limit   — max rows per type (default: 100)
 *   search  — text search
 */
export async function GET(req: NextRequest) {
  const supabase = getServerSupabase();
  const { searchParams } = req.nextUrl;
  const type = searchParams.get('type') ?? 'all';
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '100', 10) || 100, 500);
  const search = searchParams.get('search');

  const result: { action_items: any[]; decisions: any[] } = { action_items: [], decisions: [] };

  if (type === 'all' || type === 'action_items') {
    let q = supabase
      .from('action_items')
      .select('*')
      .not('archived_at', 'is', null)
      .order('archived_at', { ascending: false })
      .limit(limit);
    if (search) q = q.ilike('title', `%${search}%`);
    const { data } = await q;
    result.action_items = data ?? [];
  }

  if (type === 'all' || type === 'decisions') {
    let q = supabase
      .from('decisions')
      .select('*, transcripts(meeting_title)')
      .not('archived_at', 'is', null)
      .order('archived_at', { ascending: false })
      .limit(limit);
    if (search) q = q.or(`decision_text.ilike.%${search}%,topic.ilike.%${search}%`);
    const { data } = await q;
    result.decisions = (data ?? []).map((d: any) => ({
      ...d,
      meeting_title: d.transcripts?.meeting_title ?? null,
      transcripts: undefined,
    }));
  }

  return NextResponse.json(result);
}

/**
 * POST /api/archive/run — Trigger the archive_expired_items() function.
 * Called by cron job or manually. Returns count of archived items.
 */
export async function POST() {
  const supabase = getServerSupabase();
  const { data, error } = await supabase.rpc('archive_expired_items');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Log the archival run
  await supabase.from('activity_log').insert({
    event_type: 'auto_archive_run',
    entity_type: 'system',
    entity_id: null,
    actor: 'system',
    summary: `Auto-archive: ${data.action_items_archived} action items, ${data.decisions_archived} decisions archived`,
    metadata: data,
  });

  return NextResponse.json(data);
}
```

**Create `apps/web/app/api/archive/restore/route.ts`:**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '../../../../lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * POST /api/archive/restore — Restore an archived item.
 * Body: { entity_type: 'action_item' | 'decision', id: string, actor: string }
 */
export async function POST(req: NextRequest) {
  const { entity_type, id, actor } = await req.json();
  const supabase = getServerSupabase();
  const now = new Date().toISOString();

  const table = entity_type === 'action_item' ? 'action_items' : 'decisions';
  const restoreStatus = entity_type === 'action_item' ? 'open' : 'active';

  const { data, error } = await supabase
    .from(table)
    .update({
      archived_at: null,
      status: restoreStatus,
      is_locked: true,           // Auto-lock on restore so it doesn't immediately re-archive
      locked_by: actor,
      locked_at: now,
      updated_at: now,
    })
    .eq('id', id)
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }

  await supabase.from('activity_log').insert({
    event_type: `${entity_type}_restored`,
    entity_type,
    entity_id: id,
    actor,
    summary: `Restored from archive and locked: ${(data as any).title ?? (data as any).decision_text?.slice(0, 80)}`,
    metadata: { restored_by: actor },
  });

  return NextResponse.json(data);
}
```

### Step 5 — Update Existing API Routes to Exclude Archived Items

**In `apps/web/app/api/action-items/route.ts` GET handler:**
After the existing filter chain and before `const { data, error } = await query;`, add:

```typescript
// Exclude archived items from default listing (unless explicitly requested)
const includeArchived = searchParams.get('include_archived') === 'true';
if (!includeArchived) {
  query = query.is('archived_at', null);
}
```

**In `apps/web/app/api/decisions/route.ts` GET handler:**
Same pattern — add after the existing filter chain:

```typescript
const includeArchived = searchParams.get('include_archived') === 'true';
if (!includeArchived) {
  query = query.is('archived_at', null);
}
```

### Step 6 — Update Existing PATCH Routes to Handle Lock Fields

**In `apps/web/app/api/action-items/[id]/route.ts` PATCH handler:**
Add to the `update` payload builder block:

```typescript
if (body.is_locked !== undefined) {
  update.is_locked = body.is_locked;
  if (body.is_locked) {
    update.locked_by = body.locked_by ?? 'Lutfiya Miller';
    update.locked_at = new Date().toISOString();
  } else {
    update.locked_by = null;
    update.locked_at = null;
  }
}
```

**In `apps/web/app/api/decisions/[id]/route.ts` PATCH handler:**
Same addition.

### Step 7 — Cron / Scheduled Archival

**Create `apps/web/app/api/cron/archive/route.ts`:**

```typescript
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/archive — Vercel Cron or external cron hits this endpoint.
 * Triggers the archive_expired_items() RPC.
 * Protect with a CRON_SECRET env var.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Delegate to the archive run endpoint
  const res = await fetch(new URL('/api/archive', req.url).toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  const data = await res.json();
  return NextResponse.json(data);
}
```

If deploying on Vercel, add to `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/archive", "schedule": "0 * * * *" }
  ]
}
```

For non-Vercel deployments, configure an external cron (e.g., cron-job.org, Supabase pg_cron, or a node-cron job in the worker) to call `POST /api/archive/run` every hour.

### Step 8 — Frontend: Lock Button Component

**Create `apps/web/components/lock-button.tsx`:**

```tsx
'use client';

import { useState } from 'react';

interface LockButtonProps {
  entityType: 'action_item' | 'decision';
  entityId: string;
  isLocked: boolean;
  lockedBy: string | null;
  currentUser: string;          // 'Lutfiya Miller' | 'Chris Müller'
  onLockChange: (locked: boolean) => void;
}

export function LockButton({ entityType, entityId, isLocked, lockedBy, currentUser, onLockChange }: LockButtonProps) {
  const [loading, setLoading] = useState(false);
  const apiBase = entityType === 'action_item' ? 'action-items' : 'decisions';

  const toggle = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/${apiBase}/${entityId}/lock`, {
        method: isLocked ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: currentUser }),
      });
      if (res.ok) onLockChange(!isLocked);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={loading}
      title={isLocked ? `Locked by ${lockedBy} — click to unlock` : 'Lock to prevent auto-archive'}
      className={`
        inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-lg
        border transition-all duration-200
        ${isLocked
          ? 'border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
          : 'border-theme-border text-theme-text-muted hover:text-amber-400 hover:border-amber-500/30'
        }
        ${loading ? 'opacity-50 cursor-wait' : ''}
      `}
    >
      <span className="text-sm">{isLocked ? '🔒' : '🔓'}</span>
      {isLocked ? 'Locked' : 'Lock'}
    </button>
  );
}
```

### Step 9 — Frontend: TTL Countdown Badge

**Create `apps/web/components/ttl-badge.tsx`:**

```tsx
'use client';

import { useState, useEffect } from 'react';

interface TTLBadgeProps {
  createdAt: string;
  isLocked: boolean;
}

export function TTLBadge({ createdAt, isLocked }: TTLBadgeProps) {
  const [remaining, setRemaining] = useState('');

  useEffect(() => {
    if (isLocked) { setRemaining(''); return; }

    const tick = () => {
      const deadline = new Date(createdAt).getTime() + 24 * 60 * 60 * 1000;
      const diff = deadline - Date.now();
      if (diff <= 0) { setRemaining('Archiving…'); return; }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      setRemaining(`${h}h ${m}m`);
    };

    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [createdAt, isLocked]);

  if (isLocked) return <span className="text-[10px] text-amber-400">🔒 Locked</span>;
  if (!remaining) return null;

  const isUrgent = remaining === 'Archiving…' ||
    (parseInt(remaining) <= 2 && remaining.includes('h'));

  return (
    <span className={`text-[10px] font-mono ${isUrgent ? 'text-rose-400' : 'text-theme-text-tertiary'}`}>
      ⏱ {remaining}
    </span>
  );
}
```

### Step 10 — Frontend: Archive Page

**Create `apps/web/app/archive/page.tsx`:**

Build a full page at `/archive` that:

1. Fetches `GET /api/archive` on mount
2. Has a tab switcher: "All" | "Action Items" | "Decisions"
3. Has a search bar filtering by title/decision_text
4. Displays items in a list/card layout similar to existing pages, but with reduced opacity (e.g., `opacity-70`) and a "Restore" button on each item
5. The "Restore" button calls `POST /api/archive/restore` with `{ entity_type, id, actor: currentUser }`
6. Shows `archived_at` date and original `created_at` date for each item
7. Follows the existing glass-card styling pattern used in `action-items/page.tsx` and `decisions/page.tsx`
8. Uses the same `useTranslation` hook pattern for decision text translation

### Step 11 — Update Sidebar Navigation

**In `apps/web/components/sidebar.tsx`:**

Add an "Archive" link below the existing "Decisions" link. Use a 📦 icon. Optionally show a count badge with the total number of archived items (fetched from a lightweight count endpoint or included in the existing dashboard stats).

### Step 12 — Integrate Lock + TTL into Action Items Page

**In `apps/web/app/action-items/page.tsx`:**

For each action item card in the Kanban board:

1. Import and render `<LockButton>` and `<TTLBadge>` components
2. Place `<TTLBadge createdAt={item.created_at} isLocked={item.is_locked} />` in the card's metadata row (near priority dot / effort icon)
3. Place `<LockButton entityType="action_item" entityId={item.id} isLocked={item.is_locked} lockedBy={item.locked_by} currentUser={currentUser} onLockChange={...} />` in the card's action button area
4. When `onLockChange` fires, update local state optimistically: `setItems(prev => prev.map(i => i.id === id ? { ...i, is_locked: newVal, locked_by: newVal ? currentUser : null } : i))`
5. Determine `currentUser` from the auth cookie/session (already available via the existing auth system — check `req.cookies.get('auth_user')` pattern or pass it from a layout-level auth context)

### Step 13 — Integrate Lock + TTL into Decisions Page

**In `apps/web/app/decisions/page.tsx`:**

Same pattern as Step 12, applied to each `<DecisionCard>`:

1. Add `<TTLBadge>` next to the decided_at date display
2. Add `<LockButton>` in the expanded detail action buttons row (alongside "Mark Completed", "Mark Superseded", etc.)
3. Optimistic state update on lock/unlock

### Step 14 — Update Dashboard Stats

**In `apps/web/app/page.tsx`** (dashboard):

Add a stat card showing:
- "Expiring Soon" count — items where `is_locked = false AND archived_at IS NULL AND created_at > now() - 22h` (within last 2 hours of TTL)
- "Locked" count — items where `is_locked = true`
- "Archived Today" count — items where `archived_at` is today

### Step 15 — Activity Log Integration

All lock, unlock, archive, and restore events are already logged via the `activity_log` inserts in Steps 3-4. Verify these events appear correctly in the existing `/logs` page (which reads from `activity_log`).

---

## Constraints and Conventions

- **Follow existing patterns exactly:** Use `getServerSupabase()` for DB access, `NextResponse.json()` for responses, `export const dynamic = 'force-dynamic'` on all API routes.
- **Activity logging:** Every mutation must insert into `activity_log` with appropriate `event_type`, `entity_type`, `entity_id`, `actor`, and `summary`.
- **Assignee normalization:** Always use the canonical names `'Lutfiya Miller'` and `'Chris Müller'` (via `normalizeAssignee()` if accepting user input).
- **Tailwind styling:** Use the existing design system classes: `glass-card`, `btn-primary`, `input-glow`, `badge-*`, `text-theme-text-*`, `bg-theme-*`. Do not introduce new CSS files.
- **TypeScript strict mode:** All code must be fully typed. No `any` unless matching an existing pattern (e.g., Supabase row flattening).
- **No breaking changes:** All existing functionality (filtering, sorting, creating, editing, dismissing, deduplication, Ask AI, translation) must continue to work identically. Archived items are simply excluded from default queries.
- **Soft operations only:** Never hard-delete. Archival is a status change, not a deletion.

---

## Verification Checklist

After implementation, verify:

- [ ] Migration applies cleanly (`supabase db push` or `supabase migration up`)
- [ ] `GET /api/action-items` excludes archived items by default
- [ ] `GET /api/action-items?include_archived=true` includes them
- [ ] `POST /api/action-items/:id/lock` with valid actor locks the item
- [ ] `DELETE /api/action-items/:id/lock` unlocks and resets TTL
- [ ] `POST /api/archive/run` archives items older than 24h that aren't locked
- [ ] `GET /api/archive` returns archived items grouped by type
- [ ] `POST /api/archive/restore` restores an item and auto-locks it
- [ ] Same endpoints work for decisions
- [ ] Lock button renders on action item cards and decision cards
- [ ] TTL countdown badge shows remaining time
- [ ] Archive page is accessible at `/archive` and shows both types
- [ ] Sidebar shows Archive link
- [ ] Activity log captures lock/unlock/archive/restore events
- [ ] Existing features (Kanban, filters, Ask AI, translation) are unaffected
- [ ] TypeScript compiles with no errors
- [ ] All existing API query params still work
