# ScienceExperts.ai Transcript Pipeline — Dev Feature Suite

> **Context:** The database has been wiped clean. All bulk backfill scripts have been archived to `scripts/archive/`. Dev utility scripts are available: `npm run dev:reset`, `npm run dev:import -- --pick N`, `npm run dev:status`. Features should be implemented and tested incrementally using 1–3 transcripts at a time via `dev-import` or manual upload.

> **Implementation order matters.** Run these prompts in sequence — each builds on the previous.

---

## Prompt 1 of 9 — ScienceExperts.ai Reskin

> Run this first. It's a visual-only change that establishes the brand foundation for all subsequent features.

### Task

Reskin the MeetScript transcript-pipeline app to match the **ScienceExperts.ai** brand identity. The app must support **both light and dark mode** with a user-togglable theme switcher. Preserve all existing functionality — this is a visual/branding change only.

The ScienceExperts.ai design language is **flat, clean, and minimal** — no glassmorphism, no backdrop-blur, no gradient borders. Cards are solid-color with subtle borders and `shadow-sm`. The primary accent color is **red/coral (`#D94A4A`)**, not blue.

### Architecture Context

- **Framework:** Next.js 14 (App Router), React 18, TypeScript 5.5
- **Styling:** Tailwind CSS 3.4.13, class-based dark mode (`darkMode: 'class'`)
- **Monorepo:** Turbo — frontend lives in `apps/web/`
- **Auth/DB:** Supabase
- **No external UI library** — all components are custom Tailwind

### Key Files to Modify

| Purpose | Path |
|---------|------|
| Tailwind config | `apps/web/tailwind.config.js` |
| CSS variables + component classes | `apps/web/app/globals.css` |
| Root layout + theme script | `apps/web/app/layout.tsx` |
| Theme context & provider | `apps/web/lib/theme.tsx` |
| Sidebar (nav, branding, footer) | `apps/web/components/sidebar.tsx` |
| Theme toggle button | `apps/web/components/theme-toggle.tsx` |
| All page components | Dashboard, Calendar, Transcripts, Action Items, Ask AI, Logs |
| Upload modal | `apps/web/components/upload-modal.tsx` |

### ScienceExperts.ai Brand Identity

**Tagline:** "One World. Every Voice. Your Language."

**Logo:** `https://rgltabjdjrbmbjrjoqga.supabase.co/storage/v1/object/public/community-assets/community-logo-1772070053980.png`

#### Color System

**Primary Accent — Red/Coral:** `#D94A4A` (primary), `#C43E3E` (hover)

**Light Mode:**
```css
:root {
  --color-background: 248 249 250;    /* #f8f9fa */
  --color-foreground: 31 41 55;       /* #1f2937 */
  --color-secondary: 107 114 128;     /* #6b7280 */
  --color-muted: 243 244 246;         /* #f3f4f6 */
  --color-border: 229 231 235;        /* #e5e7eb */
  --color-card: 255 255 255;          /* #ffffff */
}
```

**Dark Mode:**
```css
.dark {
  --color-background: 10 10 10;       /* #0a0a0a */
  --color-foreground: 229 229 229;    /* #e5e5e5 */
  --color-secondary: 163 163 163;     /* #a3a3a3 */
  --color-muted: 23 23 23;            /* #171717 */
  --color-border: 38 38 38;           /* #262626 */
  --color-card: 31 41 55;             /* #1f2937 */
}
```

### What to Change

1. **`globals.css`** — Replace CSS variables + all component classes. Remove all glassmorphism (`backdrop-blur`, transparent backgrounds). `.glass-card` becomes flat: solid `rgb(var(--color-card))` background, `1px solid` border, `shadow-sm`. `.btn-primary` is coral pill: `#D94A4A`, `rounded-full`.

2. **`tailwind.config.js`** — Replace `brand` color ramp with coral/red scale (`brand-500: #D94A4A`). Keep Inter font. Add `surface` and `accent` color groups.

3. **`sidebar.tsx`** — Replace "MT" gradient badge with ScienceExperts logo. Change "MeetScript" → "ScienceExperts" / "Transcript Pipeline". Remove `backdrop-blur`. Footer: "ScienceExperts.ai — Powered by 3rd AI LLC". Nav pills: `rounded-full` with active = `bg-gray-100 dark:bg-neutral-800`.

4. **`layout.tsx`** — Title: "ScienceExperts.ai — Transcript Pipeline". Keep FOUC prevention script.

5. **`theme-toggle.tsx`** — localStorage key → `'scienceexperts-theme'`. Keep Sun/Moon toggle.

6. **All pages** — Remove `backdrop-blur-xl`, semi-transparent backgrounds. Replace "MeetScript" text. Stat card accent bars → solid `#D94A4A`. Grep for hardcoded hex values (`#338bff`, `#0a0f1e`, etc.) and replace.

7. **`upload-modal.tsx`** — Flat modal styling. Upload button uses `.btn-primary`.

### Critical Design Principles

1. **FLAT, NOT GLASSY** — No `backdrop-blur`, no semi-transparent backgrounds, no gradient borders.
2. **MINIMAL SHADOWS** — `shadow-sm` for cards (light mode only), near-zero in dark mode.
3. **RED/CORAL IS THE ACCENT** — `#D94A4A` for CTAs, progress bars, active highlights.
4. **PILL-SHAPED INTERACTIONS** — Nav tabs, CTAs, category filters use `rounded-full`.
5. **NEUTRAL STRUCTURE** — Gray/neutral for structural UI. Color reserved for accents.

### Testing

After implementation, start the dev server and verify visually in both light and dark mode. The DB is empty — that's fine. Verify: logo renders, brand name reads "ScienceExperts" everywhere, no glassmorphism remains, buttons are coral pills, both themes have proper contrast.

### Do NOT

- Change any business logic, API routes, database queries, or TypeScript types
- Add new npm dependencies
- Restructure the file/folder layout

---

## Prompt 2 of 9 — Transcript File Upload Feature

> Run after Prompt 1. This gives you the primary mechanism for getting test data into the clean environment.

### Task

Add a transcript file upload feature so users can manually upload `.txt`, `.vtt`, or `.sbv` transcript files and have them fully ingested — chunked, embedded, and searchable via RAG.

### Architecture Context

Turborepo monorepo. `apps/web` = Next.js 14 dashboard. `apps/worker` = Express worker (separate service, NOT callable from web). `packages/shared` = shared TypeScript types. Supabase (PostgreSQL + pgvector).

**Key constraint:** Upload processing must run server-side within `apps/web` Next.js API routes, NOT by calling the worker.

### Existing Code to Reuse

The worker has all the processing building blocks. Copy their logic into the web app:

- **Parsers** (`apps/worker/src/extraction/parsers.ts`): `parseVtt()`, `parseSbv()`
- **Normalization** (`apps/worker/src/extraction/normalize.ts`): `extractMeetingTitle()`, `extractParticipants()`, `generateTranscriptId()`, `normalizeTranscript()`
- **Chunker** (`apps/worker/src/chunking/chunker.ts`): `chunkTranscript()` — ~2000 char chunks, ~400 char overlap
- **Embedder** (`apps/worker/src/embedding/embedder.ts`): `generateEmbeddings()` — OpenAI `text-embedding-3-small`, batched, retry

### What to Build

**Step 1:** Add `'upload'` to `ExtractionMethod` union in `packages/shared/src/types.ts`.

**Step 2:** Create `apps/web/lib/upload-pipeline.ts` — server-side upload processing module that: accepts text + title + optional date, extracts participants, generates transcript ID (`YYYY-MM-DD_slug`), creates synthetic `source_email_id` (`upload_<timestamp>_<random>`), builds `MeetingTranscript` with `extraction_method: 'upload'`, inserts into Supabase, chunks text, generates embeddings (OpenAI, batch 20, exponential backoff), inserts chunks, logs to `processing_log`. Uses `getServerSupabase()` from `apps/web/lib/supabase.ts`.

**Step 3:** Create `POST /api/upload` route (`apps/web/app/api/upload/route.ts`) — accepts `multipart/form-data` with `file` (required), `title` (optional), `date` (optional). Validates extension (.txt/.vtt/.sbv), size (<10MB), non-empty. Parses by extension. Returns created transcript.

**Step 4:** Create `apps/web/components/upload-modal.tsx` — modal with drag-and-drop zone, title input (pre-filled from filename), date picker (defaults to today), "Upload & Process" button. Uses flat ScienceExperts.ai design (solid card, `btn-primary` for CTA, `input-glow` for fields). Shows progress stages. On success: green message + link to `/transcripts/{id}`.

**Step 5:** Add "Upload Transcript" button to Dashboard (`apps/web/app/page.tsx`) and Transcripts page (`apps/web/app/transcripts/page.tsx`). After successful upload, refresh transcript list.

**Step 6:** Add upload button to sidebar.

### Dev Testing Workflow

After implementing, test with a single transcript file from `loom_transcripts_chris_lutfiya/`:
1. Upload one `.txt` file → verify it appears in transcript list
2. Navigate to transcript detail page → verify content renders
3. Use Ask AI → search for content from the uploaded transcript
4. Run `npm run dev:status` to confirm 1 transcript, N chunks in DB

### Do NOT

- Modify the worker service
- Add npm dependencies beyond what's already installed
- Create database migrations (existing schema handles uploads)
- Break existing Gmail pipeline functionality

---

## Prompt 3 of 9 — PDF Transcript Upload with Date Detection

> Run after Prompt 2. Extends the upload feature to handle PDFs.

### Task

Extend the upload feature to accept **PDF files**. When a PDF is uploaded: extract text, attempt to auto-detect the meeting date from extracted text, pre-fill the date picker, and process through the existing pipeline.

### What to Build

**Step 1:** Install `pdf-parse` in `apps/web/`: `cd apps/web && npm install pdf-parse`

**Step 2:** Update `apps/web/app/api/upload/route.ts`:
- Add `.pdf` to `ALLOWED` extensions
- Add PDF parsing branch: read as `ArrayBuffer` → `Buffer.from()` → `pdf(buffer)` → `result.text`
- Add `detectMeetingDate(text: string): Date | null` helper that scans first ~2000 chars for date patterns (in priority order): `Date: March 4, 2025`, ISO 8601, US format MM/DD/YYYY, long form. Use `date-fns/parse` and `date-fns/isValid`.
- For PDF uploads, set `extraction_method: 'pdf_upload'`
- Return `detectedDate` in response

**Step 3:** Update `apps/web/lib/upload-pipeline.ts` — add optional `extractionMethod?: string` parameter to `processUpload()`.

**Step 4:** Update `apps/web/components/upload-modal.tsx`:
- Accept `.pdf` in file input
- Show "✓ Date auto-detected from PDF" badge when applicable
- Add "Extracting text from PDF…" progress stage for PDFs
- Update drag zone text to include PDF

### Dev Testing

Upload a PDF transcript. Verify text extraction, date detection, chunking, and embedding all work. Upload an empty/image-only PDF — verify clear error. Existing .txt/.vtt/.sbv uploads should be unaffected.

### Do NOT

- Use `pdf-lib` or `pdfjs-dist` (overkill for text extraction)
- Scan the entire PDF for dates (only first ~2000 chars)
- Use `moment.js` or `dayjs` (use `date-fns`)
- Attempt OCR

---

## Prompt 4 of 9 — Inbox Sync Button

> Run after Prompt 3. Gives an alternative way to pull transcripts from Gmail.

### Task

Add a **"Sync Inbox"** button to the Transcript Library page that scans Gmail for new Gemini Notes emails, processes any unprocessed transcripts, and updates the library — without relying on the Cloud Run worker or Pub/Sub.

### Architecture Decision

Build a new Next.js API route (`/api/sync`) that performs a direct Gmail inbox scan using the same OAuth credentials. Reuses the existing `processUpload()` pipeline for chunking, embedding, storage.

### What to Build

**Step 1:** Install `googleapis` in web app: `cd apps/web && npm install googleapis`
Ensure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` are in `.env`.

**Step 2:** Create `apps/web/app/api/sync/route.ts` (and optionally `apps/web/lib/gmail.ts` for helpers):
- Gmail client using OAuth2 + refresh token
- Search query: `from:gemini-notes@google.com newer_than:30d` (limit 50)
- For each message: dedup check → fetch full message → verify `isTranscriptEmail()` → extract text (attachment > Google Doc > inline HTML) → call `processUpload()`
- Return summary: `{ found, alreadyProcessed, newlyProcessed, errors, details[] }`

**Step 3:** Update `apps/web/app/transcripts/page.tsx`:
- Add "⟳ Sync Inbox" button (secondary/outlined style) next to Upload button
- Add sync result banner below filter bar (dismissible, shows counts)
- Refresh transcript list after sync

### Dev Testing

Click "Sync Inbox" with an empty DB. If Gmail has Gemini Notes emails from the past 30 days, they should be pulled in. Run `npm run dev:status` to verify. If no emails exist, result should show `found: 0`. Test that the Upload button still works alongside Sync.

### Do NOT

- Call the Cloud Run worker from the web app
- Install `cheerio` — write a simple `stripHtml()` regex helper
- Duplicate chunking/embedding logic (use `processUpload()`)
- Scan more than 30 days of emails
- Modify the worker service
- Expose Google credentials to the client

---

## Prompt 5 of 9 — Extraction Status Indicator

> Run after Prompt 4. Small improvement to the transcript library.

### Task

In the Transcript Library table, **remove the "Extract AI" button** from every row and **replace it with a lightweight status indicator** showing whether AI action items have been extracted. The "Extract AI" button stays on the individual transcript detail page.

### What to Build

**Step 1:** Add `ai_extracted_count?: number` to `MeetingTranscript` in `packages/shared/src/types.ts`.

**Step 2:** Update `GET /api/transcripts` (`apps/web/app/api/transcripts/route.ts`):
- Run two queries in parallel: existing transcripts query + count of AI-extracted action items per transcript
- Build a count map from action_items where `created_by = 'ai'`
- Merge `ai_extracted_count` into each transcript

**Step 3:** Refactor `apps/web/app/transcripts/page.tsx`:
- **Remove:** `ExtractionState` type, `extractionStates` state, `handleExtract` function, `ExtractButton` component
- **Add:** "AI Items" column with `ExtractionStatusBadge` — green badge "✓ N items" if extracted, muted "—" if not

### Dev Testing

Import one transcript via `dev-import`. Go to transcript detail page and extract action items. Return to library — the "AI Items" column should show the count. Import a second transcript without extracting — it should show "—".

### Do NOT

- Modify the transcript detail page
- Add a database column — derive count from `action_items` at query time
- Change the Delete button

---

## Prompt 6 of 9 — Smart Grouping for Action Items

> Run after Prompt 5. Requires having some action items in the DB from extraction.

### Task

Add AI-powered smart grouping to the Action Items page. Related action items are visually grouped in collapsible sections within each Kanban column.

### What to Build

**Step 1:** Create migration `supabase/migrations/003_action_item_groups.sql` — add `group_label TEXT` column + index to `action_items`.

**Step 2:** Add `group_label: string | null` to `ActionItem` interface in `packages/shared/src/types.ts`.

**Step 3:** Create `POST /api/action-items/group` (`apps/web/app/api/action-items/group/route.ts`):
- Fetches non-dismissed action items
- Sends titles + descriptions to Claude with grouping prompt (short 1-3 word labels, title-cased, minimum 2 items per group)
- Batch-updates `group_label` in database
- Accepts `{ force: boolean }` — `force: true` re-groups all items, `force: false` only groups ungrouped items
- Model: `claude-sonnet-4-20250514`, max_tokens: 4096 (sufficient for small test sets)

**Step 4:** Update `POST /api/action-items/extract` to include `group_label` in the Claude extraction prompt, so new items arrive pre-grouped.

**Step 5:** Update Action Items page (`apps/web/app/action-items/page.tsx`):
- Add grouping state + `useMemo` for organizing items by `group_label` per column
- Collapsible group headers with chevron, label, item count
- Left border accent (`border-l-2 border-brand-500/30`) on group containers
- "✦ Smart Group" button (violet gradient) — calls the grouping API with `force: true`, then refreshes
- Grouped/Flat view toggle
- Manual group label editing in expanded card detail

**Step 6:** Update `PATCH /api/action-items/[id]` and `POST /api/action-items` to handle `group_label`.

### Dev Testing

1. Import 2-3 transcripts via `dev-import`
2. Extract action items from each (via transcript detail page)
3. Go to Action Items page → click "✦ Smart Group"
4. Verify items are grouped into collapsible sections
5. Toggle Grouped/Flat view
6. Edit a group label manually on an expanded card

### Do NOT

- Add npm dependencies
- Change Kanban column structure (Open / In Progress / Done)
- Create a separate "groups" database table
- Add drag-and-drop between groups

---

## Prompt 7 of 9 — Vertical Kanban Layout

> Run after Prompt 6. Changes the action items layout to stack vertically.

### Task

Change the Action Items Kanban board from a **3-column horizontal layout** to a **vertical stacked layout** (Open on top → In Progress → Done). Cards within each section tile in a responsive multi-column grid.

### File to Modify

**`apps/web/app/action-items/page.tsx`** — this is the ONLY file that needs changes.

### Exact Changes

1. **Replace outer grid:** `grid grid-cols-1 md:grid-cols-3 gap-6` → `space-y-6`

2. **Cards grid within each section:** `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3` — cards tile responsively across full width.

3. **Grouped view:** Named groups retain collapsible headers. Inside each group, cards also use the responsive grid.

4. **Empty sections:** "No items" placeholder is full-width, minimal height.

### Dev Testing

With your test action items in the DB, verify: sections stack vertically, cards tile in 2-3 columns depending on screen width, grouped/flat toggle works, collapse/expand groups work, resize browser → cards reflow.

### Do NOT

- Modify any state variables, hooks, or filter logic
- Change the `ActionItemCard` component
- Change API calls or business logic
- Touch any other files

---

## Prompt 8 of 9 — Meeting Calendar + Scoreboard

> Run after Prompt 7. Adds a new page. Works best with 2+ transcripts to demonstrate calendar features.

### Task

Build a **Calendar** page and **Scoreboard** for co-founder coordination between Lutfiya and Chris (3rd AI LLC / scienceexperts.ai). Purpose-built for two co-founders in different countries who interact purely virtually.

### Prerequisites

Install `date-fns` (v4.x): `cd apps/web && npm install date-fns`

Use `date-fns` for ALL date operations — `addMonths`, `startOfWeek`, `eachDayOfInterval`, `format`, `isToday`, `isWeekend`, etc. Do NOT use raw `Date` constructor math.

### What to Build

**Step 1:** Add `DayMeetingSummary` and `ScoreboardMetrics` interfaces to `packages/shared/src/types.ts`.

**Step 2:** Create `GET /api/calendar` (`apps/web/app/api/calendar/route.ts`) — accepts `?month=M&year=Y`, queries transcripts + action items for that month, returns `{ days: DayMeetingSummary[], scoreboard: ScoreboardMetrics }`. Calculates: total meetings, estimated hours (words / 150 / 60), topics discussed, meetings by participant, busiest day, avg meetings/week, action item completion rate, streak days, co-founder pair analysis (together / solo / external guests).

**Step 3:** Create `/calendar` page (`apps/web/app/calendar/page.tsx`) with:
- **Scoreboard Header** — 6 stat cards (Meetings, Est. Hours, Topics, Action Items, Completion %, Streak)
- **Month Navigation** — Prev/Next with month label (via `format(date, 'MMMM yyyy')`)
- **Calendar Grid** — 7-column (Mon-Sun), each cell a mini card. Days with meetings show colored dots + count. Click → expand day detail panel.
- **Day Detail Panel** — meeting cards with title (linked to `/transcripts/{id}`), participants, word count
- **Collaboration Insights** — participant bar chart (pure CSS), busiest day badge, topic tag cloud, timezone indicator
- **Activity Heatmap** — GitHub-style density grid

**Step 4:** Add Calendar to sidebar as second nav item (after Dashboard).

**Step 5:** Add "This Month at a Glance" compact widget to Dashboard.

**Step 6:** Co-founder features: meeting cadence label, action item velocity bar, no-meeting days counter, participant pair analysis.

### Dev Testing

Import 2-3 transcripts (preferably with different dates) via `dev-import`. Navigate to `/calendar` — verify the calendar grid shows meeting dots on the correct dates. Click a day → detail panel expands. Scoreboard shows stats. Navigate months. Even with only 2-3 transcripts, all features should render gracefully (zeros, empty states).

### Do NOT

- Install any packages besides `date-fns`
- Integrate with Google Calendar API — all data comes from `transcripts` table
- Modify existing API routes or pages (except Dashboard for the widget)
- Modify the database schema

---

## Prompt 9 of 9 — Cumulative All-Time Statistics

> Run after Prompt 8. Extends the Calendar page with all-time totals.

### Task

Add **cumulative all-time statistics** to the Calendar page so Lutfiya and Chris can see their total track record alongside the monthly view. Also update the dashboard widget.

### What to Build

**Step 1:** Add `CumulativeStats` interface to `packages/shared/src/types.ts` — totalMeetings, totalHours, totalWords, totalActionItems, completedActionItems, actionItemCompletionRate, topicsDiscussed, uniqueParticipants, meetingsByParticipant, busiestDay, firstMeetingDate, lastMeetingDate, totalMonthsActive, co-founder pair counts, averageMeetingsPerMonth.

**Step 2:** Update `GET /api/calendar` — run 4 queries in a single `Promise.all` (monthly transcripts, monthly action items, ALL transcripts, ALL action items). Compute `CumulativeStats` from the all-time data. Return `{ days, scoreboard, cumulative }`.

**Step 3:** Update Calendar page — add "All-Time Totals" section (compact `glass-card`, text-driven, visually distinct from monthly stat cards). Shows: total meetings, hours, action items, completion rate, topics, participants, busiest day, co-founder stats, avg meetings/month, months active, "Since {first meeting date}".

**Step 4:** Update Dashboard `CalendarWidget` — add second line with all-time totals below monthly stats.

### Dev Testing

With your test transcripts, verify: cumulative numbers >= monthly numbers, "Since" date matches earliest transcript, navigating months changes monthly stats but cumulative stays constant. If DB has 0 transcripts, handle gracefully (no NaN, no crashes). Only one API call to `/api/calendar` per navigation.

### Do NOT

- Modify `ScoreboardMetrics` interface — add a separate `CumulativeStats`
- Change how monthly scoreboard is calculated or displayed
- Remove or reorder existing calendar page sections
- Install new packages

---

## Implementation Order Summary

| # | Prompt | Type | Dependencies |
|---|--------|------|-------------|
| 1 | ScienceExperts Reskin | Visual | None — do first |
| 2 | Transcript Upload | Core feature | Reskin (for design consistency) |
| 3 | PDF Upload | Feature extension | Upload feature |
| 4 | Inbox Sync | Feature | Upload pipeline |
| 5 | Extraction Status | UI improvement | Transcripts + action items exist |
| 6 | Smart Grouping | AI feature | Action items extracted |
| 7 | Vertical Kanban | Layout | Smart grouping in place |
| 8 | Calendar + Scoreboard | New page | Transcripts exist |
| 9 | Cumulative Stats | Extension | Calendar page exists |

### Dev Testing Workflow Between Prompts

After each prompt is implemented:

```bash
# Check current state
npm run dev:status

# If you need test data
npm run dev:import -- --pick 2

# If you need to start fresh
npm run dev:reset -- --confirm
npm run dev:status  # verify empty
```

After Prompt 2 (Upload), you can also add transcripts via the UI upload button instead of `dev-import`.

### What Was Removed (vs. Original Prompts)

- **No backfill scripts or bulk processing.** The original smart grouping prompt discussed processing "94 items" and increasing Claude's `max_tokens` to 8192 — that's unnecessary with 5-10 test items.
- **No retro-extraction.** The `backfill-action-items.mjs` and `/api/action-items/extract-all` bulk endpoints are not referenced. Extract per-transcript from the detail page.
- **`PROMPT_fix_smart_grouping.md` was merged into Prompt 6.** Since we're starting clean, the bug fixes (migration not applied, timing bug in `handleSmartGroup`, token limits for 94 items) are incorporated into the correct implementation from the start — no need for a separate fix prompt.
- **Inbox Sync is limited in scope.** The `newer_than:30d` limit and 50-result cap are preserved, but the prompt frames this as a lightweight dev tool rather than a mass ingestion mechanism.
