# Prompt: Replace "Extract AI" Button with Extraction Status Indicator

> **Target model:** Claude 4.6 Opus — Google Antigravity IDE
> **App:** ScienceExperts.ai — Transcript Pipeline (Next.js 14 App Router + Supabase + OpenAI embeddings)

---

## Goal

In the Transcript Library table, **remove the "Extract AI" button** from every row and **replace it with a lightweight status indicator** showing whether AI action items have already been extracted for that transcript. The "Extract AI" button remains on the individual transcript detail page — this change only affects the library overview table.

**Why:** The Extract AI button in the table doesn't sync properly with extractions done from within the detail view, and clicking it risks creating duplicate action items. Users need at-a-glance visibility into which transcripts have been processed without opening each one.

---

## Current State of the Codebase

### Transcript Library Page (`apps/web/app/transcripts/page.tsx`)

This is the main page to modify. Here is the **complete current code**:

```typescript
'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import type { MeetingTranscript, ActionItem } from '@meet-pipeline/shared';
import { UploadModal } from '../../components/upload-modal';

type SortField = 'meeting_date' | 'meeting_title' | 'word_count';
type SortDirection = 'asc' | 'desc';
type ExtractionState = { status: 'idle' } | { status: 'extracting' } | { status: 'done'; count: number };

export default function TranscriptsPage() {
    const [transcripts, setTranscripts] = useState<MeetingTranscript[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [participantFilter, setParticipantFilter] = useState('');
    const [sortField, setSortField] = useState<SortField>('meeting_date');
    const [sortDir, setSortDir] = useState<SortDirection>('desc');
    const [extractionStates, setExtractionStates] = useState<Map<string, ExtractionState>>(new Map());
    const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    // ... refreshTranscripts, handleExtract, handleDelete, filtered, toggleSort, sortIndicator ...
    // ... JSX with table rows containing <ExtractButton /> and Delete button ...
}

function ExtractButton({ state, onExtract }: {
    state: ExtractionState;
    onExtract: () => void;
}) {
    // Returns "Extracting...", "N found", or "Extract AI" button
}
```

**What needs to be removed from this file:**
- `ActionItem` import (line 5 — only `MeetingTranscript` is needed)
- `ExtractionState` type (line 10)
- `extractionStates` state variable (line 22)
- `handleExtract` function (lines 38–52)
- `ExtractButton` sub-component (lines 270–298)
- `<ExtractButton>` usage in each table row
- The corresponding Actions column header text "Actions" should remain (it still has Delete)

### Transcripts API Route (`apps/web/app/api/transcripts/route.ts`)

Here is the **complete current code**:

```typescript
import { NextResponse } from 'next/server';
import { getServerSupabase } from '../../../lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const supabase = getServerSupabase();

        const { data, error } = await supabase
            .from('transcripts')
            .select('*')
            .order('meeting_date', { ascending: false })
            .limit(100);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const transcripts = (data ?? []).map((row) => ({
            transcript_id: row.id,
            meeting_title: row.meeting_title,
            meeting_date: row.meeting_date,
            participants: row.participants,
            raw_transcript: row.raw_transcript,
            source_email_id: row.source_email_id,
            extraction_method: row.extraction_method,
            word_count: row.word_count,
            processed_at: row.processed_at,
        }));

        return NextResponse.json(transcripts);
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
```

**What needs to change:** This route currently returns no information about action items. It needs a second parallel query to count AI-extracted action items per transcript.

### Shared Types (`packages/shared/src/types.ts`)

The `MeetingTranscript` interface currently has these fields:

```typescript
export interface MeetingTranscript {
    transcript_id: string;
    meeting_title: string;
    meeting_date: string;
    participants: string[];
    raw_transcript: string;
    source_email_id: string;
    extraction_method: ExtractionMethod;
    word_count: number;
    processed_at: string;
}
```

**What needs to change:** Add `ai_extracted_count?: number` to this interface.

### Action Items Table (Supabase `action_items`)

Relevant columns:
- `transcript_id TEXT` — links to the transcript (has an index: `idx_action_items_transcript`)
- `created_by TEXT` — `'ai'` for AI-extracted, `'manual'` for user-created

There is **no flag** on the `transcripts` table tracking whether extraction has been done. The only way to know is to query `action_items` filtered by `transcript_id` and `created_by = 'ai'`.

### Design System

- **Flat design** — solid backgrounds (`--color-card`), subtle borders (`--color-border`), minimal shadows.
- Brand accent: `#D94A4A` (coral/red).
- Existing badge classes: `badge-info` (blue), `badge-success` (emerald/green), `badge-warning` (amber).
- Emerald green is used for success states elsewhere in the app.
- Dark mode via `.dark` class on `<html>`.

---

## Implementation Plan — 3 Steps

### Step 1 — Add `ai_extracted_count` to the Shared Types

**File:** `packages/shared/src/types.ts`

Add one field to the `MeetingTranscript` interface, after `processed_at`:

```typescript
/** Number of AI-extracted action items for this transcript. */
ai_extracted_count?: number;
```

Make it optional (`?`) so it doesn't break existing consumers.

---

### Step 2 — Enhance the Transcripts API Route

**File:** `apps/web/app/api/transcripts/route.ts`

Modify the `GET` handler to:

1. **Run two queries in parallel** using `Promise.all`:
   - The existing transcripts query (unchanged).
   - A new query on `action_items` to fetch all rows where `created_by = 'ai'` and `transcript_id` is not null, selecting only the `transcript_id` column.

2. **Build a count map** from the action items result: loop through the rows and count occurrences of each `transcript_id` → `Map<string, number>`.

3. **Merge the count** into each transcript object: add `ai_extracted_count: countMap.get(row.id) ?? 0`.

Here is the target structure for the route:

```typescript
import { NextResponse } from 'next/server';
import { getServerSupabase } from '../../../lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const supabase = getServerSupabase();

        const [transcriptRes, actionItemRes] = await Promise.all([
            supabase
                .from('transcripts')
                .select('*')
                .order('meeting_date', { ascending: false })
                .limit(100),
            supabase
                .from('action_items')
                .select('transcript_id')
                .eq('created_by', 'ai')
                .not('transcript_id', 'is', null),
        ]);

        if (transcriptRes.error) {
            return NextResponse.json({ error: transcriptRes.error.message }, { status: 500 });
        }

        // Build lookup: transcript_id → AI-extracted item count
        const countMap = new Map<string, number>();
        if (!actionItemRes.error && Array.isArray(actionItemRes.data)) {
            for (const row of actionItemRes.data) {
                const tid = row.transcript_id as string;
                countMap.set(tid, (countMap.get(tid) ?? 0) + 1);
            }
        }

        const transcripts = (transcriptRes.data ?? []).map((row) => ({
            transcript_id: row.id,
            meeting_title: row.meeting_title,
            meeting_date: row.meeting_date,
            participants: row.participants,
            raw_transcript: row.raw_transcript,
            source_email_id: row.source_email_id,
            extraction_method: row.extraction_method,
            word_count: row.word_count,
            processed_at: row.processed_at,
            ai_extracted_count: countMap.get(row.id) ?? 0,
        }));

        return NextResponse.json(transcripts);
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
```

---

### Step 3 — Refactor the Transcript Library Page

**File:** `apps/web/app/transcripts/page.tsx`

#### Remove all extraction-related code:

1. Remove `ActionItem` from the import on line 5 (keep only `MeetingTranscript`).
2. Delete the `ExtractionState` type.
3. Delete the `extractionStates` state variable.
4. Delete the entire `handleExtract` async function.
5. Delete the entire `ExtractButton` sub-component at the bottom of the file.
6. Remove the `<ExtractButton>` usage from each table row's Actions cell.

#### Add extraction status indicator:

1. **Add a new column header** called "AI Items" between the "Method" column and the "Actions" column:
   ```tsx
   <th className="text-right px-6 py-3 text-xs font-semibold text-theme-text-tertiary uppercase tracking-wider">
       AI Items
   </th>
   ```

2. **Add a corresponding table cell** in each row (also between Method and Actions):
   ```tsx
   <td className="px-6 py-4 text-right">
       <ExtractionStatusBadge count={t.ai_extracted_count} />
   </td>
   ```

3. **Create a new `ExtractionStatusBadge` sub-component** at the bottom of the file (replacing `ExtractButton`):
   ```tsx
   function ExtractionStatusBadge({ count }: { count?: number }) {
       if (count && count > 0) {
           return (
               <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                   ✓ {count} item{count !== 1 ? 's' : ''}
               </span>
           );
       }

       return (
           <span className="text-[10px] text-theme-text-muted">
               —
           </span>
       );
   }
   ```

4. **Update `colSpan`** on the loading and empty-state `<td>` elements from `6` to `7` (since there's now one more column).

5. **The Actions column** now only contains the Delete button. Keep the Delete button exactly as-is — no changes to its behavior or styling.

---

## Testing Checklist

- [ ] The "Extract AI" buttons are gone from the Transcript Library table.
- [ ] A new "AI Items" column shows a green badge like "✓ 5 items" for transcripts that have AI-extracted action items.
- [ ] Transcripts with no extracted items show a muted "—" dash.
- [ ] The count is accurate — matches the actual number of AI-created action items in the `action_items` table for each transcript.
- [ ] Clicking through to an individual transcript → the "Extract with AI" button still works there (no changes to `apps/web/app/transcripts/[id]/page.tsx`).
- [ ] After extracting from the detail page, navigating back to the library shows the updated count.
- [ ] The Delete button still works correctly with its two-click confirmation.
- [ ] Both light and dark themes render the badge correctly.
- [ ] No TypeScript errors — the `ai_extracted_count` field is optional and handled gracefully.

---

## What NOT to Do

- **Do NOT modify the transcript detail page** (`apps/web/app/transcripts/[id]/page.tsx`). The Extract AI button stays there.
- **Do NOT modify the extraction API route** (`/api/action-items/extract`). It works as-is.
- **Do NOT add a database migration or new column to the `transcripts` table.** We derive the count from `action_items` at query time.
- **Do NOT add glassmorphism, backdrop-blur, or gradient backgrounds.** The design system is flat.
- **Do NOT change the Delete button styling or behavior.** Keep it exactly as-is.

---

## File Summary

| File | Action |
|------|--------|
| `packages/shared/src/types.ts` | Add `ai_extracted_count?: number` to `MeetingTranscript` |
| `apps/web/app/api/transcripts/route.ts` | Add parallel query for AI item counts, merge into response |
| `apps/web/app/transcripts/page.tsx` | Remove Extract AI button/state, add AI Items column with status badge |

**No new files. No new dependencies. No database changes.**
