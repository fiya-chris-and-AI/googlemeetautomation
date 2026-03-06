# Implementation Prompt: Auto-Extract with Real-Time Status Indicators

> **Target model:** Claude 4.6 Opus in Google Antigravity IDE
> **Repository:** ScienceExperts.ai Transcript Pipeline (Next.js 14 + Supabase + Claude API)
> **Date generated:** 2026-03-06
> **Updated:** 2026-03-06 — Added real-time pipeline status indicators (Change 5)

---

## Objective

Two goals:

**Goal 1 — Auto-extraction:** Modify the transcript processing pipeline so that **decisions** and **action items** are automatically extracted whenever a transcript is uploaded or summarized — eliminating the need for users to manually click "Extract Decisions" or "Extract All" buttons.

**Goal 2 — Real-time status indicators:** Replace the current fake cycling progress bar in the upload modal with a **real-time, server-driven pipeline status** that shows the user exactly where processing stands. The pipeline runs sequentially, and the UI should reflect each stage as it happens:

```
Uploading file…  →  Extracting action items…  →  Extracting decisions…  →  Complete ✓
```

The user should see each stage transition in real-time, know which step is active, which are done, and which are pending — especially since extraction can take 30+ seconds per step.

---

## Current Architecture (READ THIS FIRST)

### Tech Stack
- **Framework:** Next.js 14.2 (App Router) with TypeScript
- **Database:** Supabase (PostgreSQL + pgvector)
- **AI:** Claude Sonnet 4 via Anthropic REST API, OpenAI `text-embedding-3-small` for embeddings
- **Monorepo:** Turbo workspaces — `apps/web` (frontend + API), `packages/shared` (extraction logic)

### Current Upload Flow (`apps/web/app/api/upload/route.ts`)
```
User uploads transcript (file or paste)
    → Parse format (VTT/SBV/PDF/TXT)
    → Extract title, date, participants
    → processUpload() — insert into `transcripts` table, chunk text, generate embeddings
    → autoExtractActionItems(transcript_id).catch(() => {})  // fire-and-forget
    → Return { transcript, detectedDate }
```

**Key observation:** Action items ARE auto-extracted on upload via `autoExtractActionItems()` in `apps/web/lib/auto-extract.ts`. But **decisions are NOT** — they require a manual POST to `/api/decisions/extract` triggered by the "Extract Decisions" button.

### Current Summarize Flow (`apps/web/app/api/transcripts/[id]/summarize/route.ts`)
```
GET /api/transcripts/[id]/summarize
    → Fetch transcript from DB
    → Truncate if >12k chars (first 8k + last 2k)
    → Send to Claude with summary system prompt
    → Return { summary } (markdown)
```

**Key observation:** The summarize endpoint does NOT trigger any extraction. It generates a markdown summary that includes "Decisions Made" and "Action Items Identified" sections in the summary text — but these are just display text, not structured data inserted into the `decisions` or `action_items` tables.

### Extraction Logic (Shared Package)

**Action Items** — `packages/shared/src/extract-action-items.ts`:
- `extractActionItemsFromTranscript(transcript, anthropicKey)` → calls Claude Sonnet 4, returns `RawExtractedItem[]`
- `buildInsertionRows(extracted, transcriptId)` → normalizes assignees (splits joint assignments), builds DB rows
- Fields: title, description, assigned_to, status, priority, due_date, source_text, group_label, effort
- Assignee normalization via `normalizeAssignee()` in `packages/shared/src/normalize-assignee.ts`

**Decisions** — `packages/shared/src/extract-decisions.ts`:
- `extractDecisionsFromTranscript(transcript, anthropicKey)` → calls Claude Sonnet 4, returns `RawExtractedDecision[]`
- `buildDecisionInsertionRows(extracted, transcript)` → validates domain/confidence, builds DB rows
- Fields: decision_text, context, domain, confidence, participants, decided_at, source_text, status
- **Decisions also require embeddings** — the single-extract route (`apps/web/app/api/decisions/extract/route.ts`) generates them via OpenAI before insertion

**Auto-Extract (Action Items Only)** — `apps/web/lib/auto-extract.ts`:
- `autoExtractActionItems(transcriptId)` — fire-and-forget wrapper
- Fetches transcript, calls extraction, builds rows, inserts, logs to activity_log
- Catches all errors internally — never throws, never blocks upload

### Database Schema (relevant tables)

**`action_items`** — has columns: id, transcript_id, title, description, assigned_to, status, priority, due_date, source_text, created_by, group_label, effort, is_duplicate, duplicate_of, created_at, updated_at, completed_at

**`decisions`** — has columns: id, transcript_id, decision_text, context, domain, confidence, participants, decided_at, source_text, **embedding** (vector(1536)), superseded_by, status, created_by, created_at, updated_at

**`activity_log`** — event auditing: event_type, entity_type, entity_id, actor, summary, metadata (jsonb)

### Key Differences Between Action Item and Decision Extraction

| Aspect | Action Items | Decisions |
|--------|-------------|-----------|
| Auto-extract on upload | YES (fire-and-forget) | NO (manual button only) |
| Embeddings required | NO | YES (vector(1536) via OpenAI) |
| Assignee normalization | YES (split joint assignments) | NO (uses participant array from transcript) |
| Deduplication | has `is_duplicate` / `duplicate_of` fields | has `superseded_by` field |
| Activity log event | `action_item_created` | `decision_extracted` |

---

## Required Changes

### Change 1: Create `autoExtractDecisions()` — mirror of `autoExtractActionItems()`

Create a new file `apps/web/lib/auto-extract-decisions.ts` that follows the exact same fire-and-forget pattern as `apps/web/lib/auto-extract.ts`, but for decisions:

```
autoExtractDecisions(transcriptId: string): Promise<void>
```

Implementation requirements:
1. **Import** `extractDecisionsFromTranscript` and `buildDecisionInsertionRows` from `@meet-pipeline/shared`
2. **Fetch transcript** with fields: `id, meeting_title, meeting_date, raw_transcript, participants`
3. **Call Claude** via `extractDecisionsFromTranscript()`
4. **Generate embeddings** for each `decision_text` using OpenAI `text-embedding-3-small` — this is CRITICAL because the `decisions` table has an `embedding` vector column and the `match_decisions()` RPC function uses it for semantic search. Reference the embedding generation pattern in `apps/web/app/api/decisions/extract/route.ts` lines 71-79.
5. **Attach embeddings** to each row before insertion
6. **Insert** into `decisions` table
7. **Log** each decision to `activity_log` with event_type `decision_extracted`
8. **If no decisions found**, log a `decision_extraction_attempted` event (matching the existing decisions extract-all route pattern) so batch extraction doesn't retry
9. **Catch all errors** — never throw, never block the caller
10. **Add a guard** to skip if `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` is not set

### Change 2: Update upload route to also auto-extract decisions

In `apps/web/app/api/upload/route.ts`, add a fire-and-forget call to `autoExtractDecisions()` alongside the existing `autoExtractActionItems()` call. This happens in two places (pasted-text path at ~line 64, and file-upload path at ~line 153):

```typescript
// Fire-and-forget: auto-extract action items AND decisions in the background
autoExtractActionItems(transcript.transcript_id).catch(() => {});
autoExtractDecisions(transcript.transcript_id).catch(() => {});
```

Both calls should be independent fire-and-forget — they should NOT be awaited or chained.

### Change 3: Update summarize route to trigger extraction if not already done

In `apps/web/app/api/transcripts/[id]/summarize/route.ts`, after generating the summary, check whether decisions and action items have already been extracted for this transcript. If not, trigger extraction:

1. **Check for existing extractions** — query `decisions` and `action_items` tables for rows with this `transcript_id`
2. **Also check** `activity_log` for `bulk_extraction_attempted` events with this transcript_id in metadata (this indicates extraction was attempted but found 0 items — don't re-extract)
3. **If no decisions exist AND no prior attempt logged** → fire-and-forget `autoExtractDecisions(transcriptId)`
4. **If no action items exist AND no prior attempt logged** → fire-and-forget `autoExtractActionItems(transcriptId)`
5. These calls must NOT delay the summary response — the summary should return immediately

### Change 4: (Optional but recommended) Remove or repurpose the "Extract Decisions" button

Since decisions will now auto-extract, the "Extract Decisions" button on the transcript detail page becomes redundant. Options:
- **Remove it** entirely from the UI
- **OR** repurpose it as a "Re-extract Decisions" button that clears existing AI-extracted decisions for that transcript and re-runs extraction (useful if the extraction prompt is updated)
- The "Extract All" bulk button on the decisions page could remain as a backfill tool for transcripts uploaded before this change

### Change 5: Real-Time Pipeline Status Indicators

The current upload modal (`apps/web/components/upload-modal.tsx`) has a **fake progress indicator** that cycles through hardcoded strings every 2 seconds:

```typescript
// CURRENT (fake — not reflecting actual backend state)
const PROGRESS_STAGES_FILE = [
    'Uploading file...',
    'Extracting text from PDF...',
    'Parsing transcript...',
    'Generating embeddings...',
    'Storing in database...',
];
// Cycles every 2 seconds regardless of actual progress
useEffect(() => {
    if (!uploading) return;
    const interval = setInterval(() => {
        setProgressIndex((prev) => (prev + 1) % progressStages.length);
    }, 2000);
    return () => clearInterval(interval);
}, [uploading, progressStages.length]);
```

This must be replaced with a **real-time, server-driven status system** that reflects actual pipeline progress, including the new extraction stages. The overall approach: convert the upload API from a single request-response to a **streaming response (Server-Sent Events)** that pushes status updates as each pipeline stage completes.

#### 5A. Convert Upload API to SSE Streaming

**File:** `apps/web/app/api/upload/route.ts`

The upload route currently does everything synchronously and returns a single JSON response. It must be converted to stream status events back to the client as each stage of the pipeline completes. The extraction steps (action items and decisions) must run **sequentially** (not fire-and-forget) so the UI can track each one.

**New pipeline stages (in order):**

For file uploads:
1. `uploading` — "Uploading file…"
2. `parsing` — "Extracting text from PDF…" (or "Parsing transcript…" for non-PDF)
3. `processing` — "Processing transcript & generating embeddings…"
4. `extracting_actions` — "Extracting action items…"
5. `extracting_decisions` — "Extracting decisions…"
6. `complete` — "Complete ✓" (with counts: "Found 4 action items, 3 decisions")

For pasted text:
1. `processing` — "Processing transcript & generating embeddings…"
2. `extracting_actions` — "Extracting action items…"
3. `extracting_decisions` — "Extracting decisions…"
4. `complete` — "Complete ✓"

**SSE event format:**

```typescript
// Each event is a JSON object sent as an SSE data line
interface PipelineEvent {
    stage: 'uploading' | 'parsing' | 'processing' | 'extracting_actions' | 'extracting_decisions' | 'complete' | 'error';
    message: string;           // Human-readable status text
    transcript_id?: string;    // Set once transcript is created (after 'processing')
    counts?: {                 // Set on 'complete'
        action_items: number;
        decisions: number;
    };
    error?: string;            // Set on 'error'
}
```

**Implementation approach:**

```typescript
// In apps/web/app/api/upload/route.ts
export async function POST(request: NextRequest) {
    // ... validation and parsing (same as current) ...

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        async start(controller) {
            const send = (event: PipelineEvent) => {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
            };

            try {
                // Stage 1: Parsing
                send({ stage: 'parsing', message: isPdf ? 'Extracting text from PDF…' : 'Parsing transcript…' });
                // ... parse file ...

                // Stage 2: Processing (upload pipeline)
                send({ stage: 'processing', message: 'Processing transcript & generating embeddings…' });
                const transcript = await processUpload({ text: parsedText, title, date, extractionMethod });

                // Stage 3: Action items (sequential, NOT fire-and-forget)
                send({ stage: 'extracting_actions', message: 'Extracting action items…' });
                let actionItemCount = 0;
                try {
                    actionItemCount = await extractAndCountActionItems(transcript.transcript_id);
                } catch { /* log but continue */ }

                // Stage 4: Decisions (sequential, NOT fire-and-forget)
                send({ stage: 'extracting_decisions', message: 'Extracting decisions…' });
                let decisionCount = 0;
                try {
                    decisionCount = await extractAndCountDecisions(transcript.transcript_id);
                } catch { /* log but continue */ }

                // Stage 5: Complete
                send({
                    stage: 'complete',
                    message: `Complete — ${actionItemCount} action items, ${decisionCount} decisions`,
                    transcript_id: transcript.transcript_id,
                    counts: { action_items: actionItemCount, decisions: decisionCount },
                });
            } catch (err) {
                send({ stage: 'error', message: 'Processing failed', error: String(err) });
            } finally {
                controller.close();
            }
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    });
}
```

**Important:** The extraction functions (`autoExtractActionItems` and `autoExtractDecisions`) are currently fire-and-forget and return `void`. You need to create **new wrapper functions** (or modify the existing ones) that return the count of items extracted. For example:

```typescript
// New: returns the count of items extracted (0 if none found)
async function extractAndCountActionItems(transcriptId: string): Promise<number> {
    // Same logic as autoExtractActionItems but returns inserted count instead of void
}

async function extractAndCountDecisions(transcriptId: string): Promise<number> {
    // Same logic as autoExtractDecisions (without the 30s delay!) but returns inserted count
}
```

**Critical: Remove the 30-second initial delay** from the decision extraction path when called from the streaming upload route. The delay in `autoExtractDecisions()` (line 37-39 of `apps/web/lib/auto-extract-decisions.ts`) exists to stagger concurrent Claude calls, but in the sequential streaming pipeline, action items finish before decisions start, so no staggering is needed.

#### 5B. Update Upload Modal to Consume SSE Stream

**File:** `apps/web/components/upload-modal.tsx`

Replace the fake cycling progress with an SSE-consuming progress tracker. Both `UploadModal` and `UploadModalPortal` components need this change (they share the same pattern — consider extracting a shared hook).

**New state model:**

```typescript
type PipelineStage = 'uploading' | 'parsing' | 'processing' | 'extracting_actions' | 'extracting_decisions' | 'complete' | 'error';

interface PipelineStatus {
    stage: PipelineStage;
    message: string;
    counts?: { action_items: number; decisions: number };
}

// Replace these:
// const [uploading, setUploading] = useState(false);
// const [progressIndex, setProgressIndex] = useState(0);

// With:
const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus | null>(null);
const uploading = pipelineStatus !== null && pipelineStatus.stage !== 'complete' && pipelineStatus.stage !== 'error';
```

**New handleSubmit using EventSource pattern:**

```typescript
const handleSubmit = async () => {
    if (!canSubmit) return;
    setPipelineStatus({ stage: 'uploading', message: 'Uploading file…' });
    setResult(null);

    try {
        // Build request body (same as current)
        let body: BodyInit;
        let headers: HeadersInit = {};
        if (mode === 'paste') {
            headers = { 'Content-Type': 'application/json' };
            body = JSON.stringify({ text: pastedText, title: title.trim() || undefined, date: date ? new Date(date).toISOString() : undefined });
        } else {
            const formData = new FormData();
            formData.append('file', file!);
            if (title.trim()) formData.append('title', title.trim());
            if (date) formData.append('date', new Date(date).toISOString());
            body = formData;
        }

        const res = await fetch('/api/upload', { method: 'POST', headers, body });

        if (!res.ok || !res.body) {
            // Fallback: non-streaming error response
            const data = await res.json();
            setPipelineStatus({ stage: 'error', message: data.error || 'Upload failed' });
            setResult({ type: 'error', message: data.error || 'Upload failed' });
            return;
        }

        // Read SSE stream
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let lastTranscriptId: string | undefined;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? ''; // Keep incomplete line in buffer

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                const event: PipelineEvent = JSON.parse(line.slice(6));

                setPipelineStatus({ stage: event.stage, message: event.message, counts: event.counts });

                if (event.transcript_id) lastTranscriptId = event.transcript_id;

                if (event.stage === 'complete') {
                    setResult({
                        type: 'success',
                        transcript: { transcript_id: lastTranscriptId } as MeetingTranscript,
                        detectedDate: null,
                    });
                    onSuccess?.({ transcript_id: lastTranscriptId } as MeetingTranscript);
                }
                if (event.stage === 'error') {
                    setResult({ type: 'error', message: event.error || 'Processing failed' });
                }
            }
        }
    } catch {
        setPipelineStatus({ stage: 'error', message: 'Network error — please try again' });
        setResult({ type: 'error', message: 'Network error — please try again' });
    }
};
```

**Note:** The `onSuccess` callback currently receives a full `MeetingTranscript` object. You may need to include the full transcript data in the `complete` SSE event, OR have the frontend fetch the transcript details after receiving the transcript_id. The simpler approach is to include enough data in the SSE event for the callback to work (at minimum `transcript_id` and `meeting_title`).

#### 5C. New Progress UI Component

Replace the current single-line spinner with a **multi-step progress tracker** showing all pipeline stages. Each stage has three visual states: pending (gray), active (spinning + brand color), and done (green checkmark).

**Design spec:**

```
┌─────────────────────────────────────────────────┐
│  ✓  Uploading file                              │  ← done (green check)
│  ✓  Parsing transcript                          │  ← done (green check)
│  ◎  Extracting action items…                    │  ← active (spinning, brand color)
│  ○  Extracting decisions                        │  ← pending (gray, dimmed)
│  ○  Complete                                    │  ← pending (gray, dimmed)
└─────────────────────────────────────────────────┘
```

**Implementation:**

```tsx
const PIPELINE_STAGES_FILE: { key: PipelineStage; label: string }[] = [
    { key: 'uploading', label: 'Uploading file' },
    { key: 'parsing', label: 'Parsing transcript' },
    { key: 'processing', label: 'Processing & generating embeddings' },
    { key: 'extracting_actions', label: 'Extracting action items' },
    { key: 'extracting_decisions', label: 'Extracting decisions' },
    { key: 'complete', label: 'Complete' },
];

const PIPELINE_STAGES_PASTE: { key: PipelineStage; label: string }[] = [
    { key: 'processing', label: 'Processing & generating embeddings' },
    { key: 'extracting_actions', label: 'Extracting action items' },
    { key: 'extracting_decisions', label: 'Extracting decisions' },
    { key: 'complete', label: 'Complete' },
];

function PipelineProgress({ status, stages }: { status: PipelineStatus; stages: typeof PIPELINE_STAGES_FILE }) {
    const currentIndex = stages.findIndex(s => s.key === status.stage);

    return (
        <div className="mb-4 p-4 rounded-xl bg-brand-500/5 border border-brand-500/10 space-y-2">
            {stages.map((stage, i) => {
                const isDone = i < currentIndex || status.stage === 'complete';
                const isActive = i === currentIndex && status.stage !== 'complete' && status.stage !== 'error';
                const isPending = i > currentIndex;

                return (
                    <div key={stage.key} className={`flex items-center gap-2.5 ${isPending ? 'opacity-40' : ''}`}>
                        {isDone ? (
                            <span className="w-4 h-4 flex items-center justify-center text-emerald-400 text-xs">✓</span>
                        ) : isActive ? (
                            <div className="w-4 h-4 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <span className="w-4 h-4 flex items-center justify-center text-theme-text-muted text-xs">○</span>
                        )}
                        <span className={`text-sm ${
                            isDone ? 'text-emerald-400' :
                            isActive ? 'text-brand-400 font-medium' :
                            'text-theme-text-muted'
                        }`}>
                            {isActive ? status.message : stage.label}
                            {isDone && stage.key === 'extracting_actions' && status.counts
                                ? ` — ${status.counts.action_items} found` : ''}
                            {isDone && stage.key === 'extracting_decisions' && status.counts
                                ? ` — ${status.counts.decisions} found` : ''}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}
```

**Replace the existing progress indicator** (the `{uploading && (...)}` block at ~line 402 and ~line 756) with:

```tsx
{pipelineStatus && pipelineStatus.stage !== 'complete' && pipelineStatus.stage !== 'error' && (
    <PipelineProgress
        status={pipelineStatus}
        stages={mode === 'paste' ? PIPELINE_STAGES_PASTE : PIPELINE_STAGES_FILE}
    />
)}
```

#### 5D. Update the Success State to Show Extraction Counts

When the pipeline completes, the success banner should show how many items were extracted:

```tsx
{result?.type === 'success' && (
    <div className="mb-4 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
        <p className="text-sm font-medium text-emerald-400 mb-1">Upload successful!</p>
        <p className="text-sm text-theme-text-secondary">
            &ldquo;{result.transcript.meeting_title}&rdquo; has been processed and is now searchable.
        </p>
        {pipelineStatus?.counts && (
            <div className="flex gap-3 mt-2">
                <span className="text-xs text-emerald-600 dark:text-emerald-400">
                    ✓ {pipelineStatus.counts.action_items} action item{pipelineStatus.counts.action_items !== 1 ? 's' : ''}
                </span>
                <span className="text-xs text-emerald-600 dark:text-emerald-400">
                    ✓ {pipelineStatus.counts.decisions} decision{pipelineStatus.counts.decisions !== 1 ? 's' : ''}
                </span>
            </div>
        )}
        <a href={`/transcripts/${result.transcript.transcript_id}`}
           className="inline-block mt-2 text-sm text-brand-400 hover:text-brand-300 transition-colors font-medium">
            View transcript →
        </a>
    </div>
)}
```

#### 5E. Important: Both Modal Variants Must Be Updated

The upload modal code exists in TWO components that share nearly identical logic:

1. **`UploadModal`** (lines 95-445) — the main header button variant
2. **`UploadModalPortal`** (lines 486-797) — the sidebar button variant

Both need the same SSE streaming, status state, and progress UI changes. **Strongly recommended:** Extract the shared upload logic (state, handleSubmit, progress rendering) into a custom hook like `useUploadPipeline()` to avoid duplicating the SSE logic.

```typescript
// Example shared hook
function useUploadPipeline(onSuccess?: (t: MeetingTranscript) => void) {
    const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus | null>(null);
    const [result, setResult] = useState<UploadResult | null>(null);

    const uploading = pipelineStatus !== null &&
        pipelineStatus.stage !== 'complete' &&
        pipelineStatus.stage !== 'error';

    const handleSubmit = async (mode: InputMode, file: File | null, pastedText: string, title: string, date: string) => {
        // ... all the SSE streaming logic from 5B ...
    };

    const reset = () => { setPipelineStatus(null); setResult(null); };

    return { pipelineStatus, result, uploading, handleSubmit, reset };
}
```

---

## Files to Modify

| File | Change |
|------|--------|
| `apps/web/lib/auto-extract-decisions.ts` | **ALREADY CREATED** — `autoExtractDecisions()` function (verified) |
| `apps/web/app/api/upload/route.ts` | **ALREADY UPDATED** with `autoExtractDecisions()` call. NOW: Convert to SSE streaming with sequential pipeline stages |
| `apps/web/app/api/transcripts/[id]/summarize/route.ts` | **ALREADY UPDATED** with conditional extraction trigger |
| `apps/web/components/upload-modal.tsx` | Replace fake progress cycling with SSE-consuming multi-step progress tracker. Update BOTH `UploadModal` and `UploadModalPortal` (or extract shared hook) |
| (Optional) Frontend component with "Extract Decisions" button | Remove or repurpose |

---

## Important Constraints

1. **Upload route is now a streaming response.** The upload endpoint returns an SSE stream, NOT a single JSON response. The frontend must consume the stream. The extraction stages run **sequentially** within the stream handler so the UI can track each one.
2. **Never block the summary response.** The summarize endpoint should return the markdown summary immediately. Any triggered extraction runs asynchronously (fire-and-forget) — unlike the upload route which now runs them sequentially within the stream.
3. **Idempotency.** If decisions or action items already exist for a transcript, do NOT re-extract or create duplicates. Always check first.
4. **Embedding generation is required for decisions.** Unlike action items, every decision needs an OpenAI embedding before insertion. The extraction function MUST include this step. Without it, the `match_decisions()` semantic search RPC will not find these decisions.
5. **Sequential extraction in upload, concurrent in summarize.** The upload route runs action items → decisions sequentially (for status reporting). The summarize route fires both concurrently (fire-and-forget) since it has no status UI.
6. **Error isolation.** A failure in decision extraction must NEVER affect action item extraction, and vice versa. In the streaming upload route, if action item extraction fails, catch the error, report it in the stream, and continue to decision extraction. If decision extraction fails, still send a `complete` event with the action items count.
7. **Activity logging.** All extractions must log to `activity_log` for auditability. Use `auto: true` in the metadata to distinguish from manual extractions.
8. **Model consistency.** Use `claude-sonnet-4-20250514` for extraction (same as existing code). Do NOT use a different model.
9. **Remove the 30-second delay from decision extraction when called from the streaming upload route.** The delay in `autoExtractDecisions()` exists to stagger concurrent Claude calls, but in the sequential streaming pipeline, action items finish before decisions start, so no staggering is needed. Either pass `initialDelayMs=0` or create a separate non-delayed extraction function for the streaming path.
10. **Both modal variants must be updated.** There are two nearly identical upload modal implementations: `UploadModal` and `UploadModalPortal`. Both need the streaming progress UI. Extract a shared hook to avoid code duplication.

---

## Testing Checklist

### Auto-Extraction Tests
- [ ] Upload a new transcript → decisions appear on `/decisions` page after pipeline completes
- [ ] Upload a new transcript → action items appear on `/action-items` page after pipeline completes
- [ ] Upload a transcript with no discernible decisions → `activity_log` shows a `decision_extraction_attempted` entry, and no phantom decisions are created
- [ ] Open an OLD transcript (uploaded before this change) and trigger summarize → if no decisions/action items exist, they get extracted automatically
- [ ] Open a transcript that ALREADY has decisions/action items → summarize does NOT re-extract (no duplicates)
- [ ] Open a transcript where extraction was previously attempted but found 0 items → summarize does NOT re-attempt
- [ ] Upload fails gracefully if Claude API is down → transcript still saves, extraction stages show as failed but upload succeeds
- [ ] Upload fails gracefully if OpenAI API is down → action items still extract, decisions fail gracefully
- [ ] Check `activity_log` entries for all auto-extracted items have `metadata.auto: true`
- [ ] Decisions inserted via auto-extract have valid `embedding` vectors (not null)
- [ ] The "Extract All" bulk button on the decisions page still works for backfilling old transcripts
- [ ] No duplicate decisions or action items are created when a transcript is summarized multiple times

### Status Indicator Tests (Change 5)
- [ ] Upload a PDF → UI shows stages in order: "Uploading file" → "Extracting text from PDF" → "Processing & generating embeddings" → "Extracting action items" → "Extracting decisions" → "Complete"
- [ ] Upload a .txt file → UI shows stages without the PDF extraction step
- [ ] Paste text → UI shows stages starting from "Processing & generating embeddings"
- [ ] Each stage shows a spinning indicator when active, a green checkmark when done, and a gray circle when pending
- [ ] The "Complete" stage shows extraction counts (e.g., "4 action items, 3 decisions")
- [ ] The success banner after completion shows the extraction counts
- [ ] If action item extraction fails, the pipeline continues to decision extraction (error isolation)
- [ ] If decision extraction fails, the pipeline still shows "Complete" with the action items count
- [ ] The upload modal cannot be closed while the pipeline is running
- [ ] BOTH the main UploadModal and the SidebarUploadButton/UploadModalPortal show the same progress UI
- [ ] For a transcript with 0 action items and 0 decisions, the complete stage shows "0 action items, 0 decisions" (not an error)
- [ ] Network disconnection during streaming shows a clear error state

---

## Reference: Existing `autoExtractActionItems()` Pattern

This is the exact pattern to follow for the new `autoExtractDecisions()` function. It lives in `apps/web/lib/auto-extract.ts`:

```typescript
export async function autoExtractActionItems(transcriptId: string): Promise<void> {
    const tag = '[auto-extract]';
    try {
        const anthropicKey = process.env.ANTHROPIC_API_KEY;
        if (!anthropicKey) {
            console.warn(`${tag} ANTHROPIC_API_KEY not set — skipping extraction`);
            return;
        }
        const supabase = getServerSupabase();

        // 1. Fetch the transcript
        const { data: transcript, error: txErr } = await supabase
            .from('transcripts')
            .select('id, meeting_title, raw_transcript, participants')
            .eq('id', transcriptId)
            .single();

        if (txErr || !transcript) {
            console.error(`${tag} Transcript not found: ${transcriptId}`);
            return;
        }

        // 2. Call Claude
        const extracted = await extractActionItemsFromTranscript(
            transcript as TranscriptForExtraction,
            anthropicKey,
        );

        if (extracted.length === 0) {
            // Log so extract-all doesn't retry this transcript later
            await supabase.from('activity_log').insert({
                event_type: 'bulk_extraction_attempted',
                entity_type: 'transcript',
                entity_id: transcriptId,
                actor: 'system',
                summary: `Auto-extraction found 0 items in: ${transcript.meeting_title}`,
                metadata: { transcript_id: transcriptId, items_found: 0, result: 'empty', auto: true },
            });
            return;
        }

        // 3. Build rows and insert
        const rows = buildInsertionRows(extracted, transcriptId);
        const { data: inserted, error: insertErr } = await supabase
            .from('action_items')
            .insert(rows)
            .select();

        if (insertErr) {
            console.error(`${tag} Insert failed for ${transcriptId}:`, insertErr.message);
            return;
        }

        // 4. Log each creation to activity_log
        const activityRows = (inserted ?? []).map((item) => ({
            event_type: 'action_item_created',
            entity_type: 'action_item',
            entity_id: item.id,
            actor: 'system',
            summary: `AI auto-extracted action item: ${item.title}`,
            metadata: {
                transcript_id: transcriptId,
                priority: item.priority,
                assigned_to: item.assigned_to,
                auto: true,
            },
        }));
        if (activityRows.length > 0) {
            await supabase.from('activity_log').insert(activityRows);
        }
    } catch (err) {
        console.error(`${tag} Failed for ${transcriptId}:`, err);
    }
}
```

### The decision version must additionally:
- Select `meeting_date` from the transcript (needed for `buildDecisionInsertionRows`)
- Generate embeddings via `new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })` using `text-embedding-3-small`
- Attach each embedding to the corresponding row before insertion
- Use event_type `decision_extracted` and entity_type `decision` in activity logs
- Use a distinct log tag like `[auto-extract-decisions]` for console output

---

## Reference: Decision Embedding Generation Pattern

From `apps/web/app/api/decisions/extract/route.ts` lines 71-79:

```typescript
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const texts = rows.map(r => r.decision_text as string);
const embeddingRes = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: texts,
});
for (let i = 0; i < rows.length; i++) {
    rows[i].embedding = embeddingRes.data[i].embedding;
}
```

---

## Reference: Summarize Route Conditional Extraction Logic

Add this AFTER the summary is generated but BEFORE the response is returned in `apps/web/app/api/transcripts/[id]/summarize/route.ts`:

```typescript
// Fire-and-forget: auto-extract if not already done
try {
    const { count: decisionCount } = await supabase
        .from('decisions')
        .select('id', { count: 'exact', head: true })
        .eq('transcript_id', id);

    const { count: actionItemCount } = await supabase
        .from('action_items')
        .select('id', { count: 'exact', head: true })
        .eq('transcript_id', id);

    // Check if extraction was previously attempted (found 0 items)
    const { count: attemptCount } = await supabase
        .from('activity_log')
        .select('id', { count: 'exact', head: true })
        .eq('event_type', 'bulk_extraction_attempted')
        .eq('entity_id', id);

    if ((decisionCount ?? 0) === 0 && (attemptCount ?? 0) === 0) {
        autoExtractDecisions(id).catch(() => {});
    }
    if ((actionItemCount ?? 0) === 0 && (attemptCount ?? 0) === 0) {
        autoExtractActionItems(id).catch(() => {});
    }
} catch {
    // Never let extraction checks delay the summary response
}
```

**Important note on event types:** The existing codebase uses DIFFERENT event types for "extraction attempted" logs:
- Action items bulk extraction uses: `bulk_extraction_attempted`
- Decisions bulk extraction uses: `decision_extraction_attempted`

The `autoExtractDecisions()` function should use `decision_extraction_attempted` (matching the existing decisions extract-all route pattern). The conditional check in the summarize route must query for BOTH event types:

```typescript
// Check if decision extraction was previously attempted
const { count: decisionAttemptCount } = await supabase
    .from('activity_log')
    .select('id', { count: 'exact', head: true })
    .eq('event_type', 'decision_extraction_attempted')
    .eq('entity_id', id);

// Check if action item extraction was previously attempted
const { count: actionAttemptCount } = await supabase
    .from('activity_log')
    .select('id', { count: 'exact', head: true })
    .eq('event_type', 'bulk_extraction_attempted')
    .eq('entity_id', id);

if ((decisionCount ?? 0) === 0 && (decisionAttemptCount ?? 0) === 0) {
    autoExtractDecisions(id).catch(() => {});
}
if ((actionItemCount ?? 0) === 0 && (actionAttemptCount ?? 0) === 0) {
    autoExtractActionItems(id).catch(() => {});
}
```
