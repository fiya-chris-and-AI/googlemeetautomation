# Prompt: Add an Inbox Sync Button to the Transcript Library

> **Target model:** Claude 4.6 Opus — Google Antigravity IDE
> **App:** ScienceExperts.ai — Transcript Pipeline (Next.js 14 App Router + Supabase + OpenAI embeddings)

---

## Goal

Add a **"Sync Inbox"** button to the Transcript Library page that, when clicked, scans the Gmail inbox for new Gemini Notes emails, processes any unprocessed transcripts, and updates the library — all without relying on the Cloud Run worker or Pub/Sub.

This gives the user an on-demand way to pull in new transcripts, complementing the existing Pub/Sub push automation.

---

## Architecture Decision

The existing worker (`apps/worker/`) runs on Cloud Run and receives Gmail Pub/Sub push notifications. It has its own Express server, Gmail OAuth client, and processing pipeline. **The web app cannot directly call the worker** — they are separate services.

**The approach:** Build a **new Next.js API route** (`/api/sync`) in the web app that performs a direct Gmail inbox scan using the same Google OAuth credentials. This route will:

1. Authenticate with Gmail using the same `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REFRESH_TOKEN` environment variables (these must be added to the web app's `.env` if not already present).
2. Search Gmail for recent Gemini Notes emails.
3. For each email not already in the database (dedup check via `source_email_id`), extract the transcript text, then feed it into the **existing** `processUpload()` pipeline from `apps/web/lib/upload-pipeline.ts`.
4. Return a summary of what was found and processed.

This reuses the web app's existing upload pipeline for chunking, embedding, and storage — no code duplication with the worker.

---

## Current State of the Codebase

### Transcript Library Page (`apps/web/app/transcripts/page.tsx`)

- Shows a table of all transcripts with search, participant filter, sort columns.
- Has an `UploadModal` button in the filter bar for manual file uploads.
- Has a `refreshTranscripts()` function that fetches `GET /api/transcripts` and updates state.
- Each row has "Extract AI" and "Delete" action buttons.

**Current filter bar layout:**
```tsx
<div className="flex gap-3 mb-6">
    <input placeholder="Search by keyword..." className="input-glow flex-1" />
    <input placeholder="Filter by participant..." className="input-glow w-64" />
    <UploadModal onSuccess={() => refreshTranscripts()} />
</div>
```

### Upload Pipeline (`apps/web/lib/upload-pipeline.ts`)

The `processUpload({ text, title, date, extractionMethod? })` function handles:
- Participant extraction, transcript ID generation
- Supabase INSERT into `transcripts` table
- Chunking (2000-char target, 400-char overlap, speaker-aware)
- Embedding generation (OpenAI `text-embedding-3-small`, batched, retry logic)
- Supabase INSERT into `transcript_chunks` table
- Logging to `processing_log` and `activity_log`
- Rollback on error

**This pipeline already accepts plain text and a date.** The sync route just needs to extract text from Gmail messages and pass it in.

### Worker Gmail Filters (`apps/worker/src/gmail/filters.ts`)

Transcript emails are identified by:
- **Sender:** `gemini-notes@google.com` (case-insensitive)
- **Subject patterns:** `/^Notes: /i`, `/^Notes from /i`, `/^Transcript for /i`, `/^Meeting transcript/i`

### Worker Extraction Logic (`apps/worker/src/pipeline.ts`)

The worker extracts transcript text via three methods (priority order):
1. **Attachment** — `.txt`, `.vtt`, `.sbv` files attached to the email
2. **Google Doc link** — extracts doc ID from email body HTML, fetches via Drive API
3. **Inline HTML** — parses the email body HTML directly (strips tags, preserves structure)

### Worker Normalization (`apps/worker/src/extraction/normalize.ts`)

- `extractMeetingTitle(subject)` — strips "Notes: ", "Notes from ", etc. prefixes
- `extractMeetingDate(internalDate)` — parses epoch ms from `message.internalDate`
- `extractParticipants(text)` — finds "Speaker: text" patterns

### Design System

- **Flat design** — solid backgrounds (`--color-card`), subtle borders (`--color-border`), minimal shadows.
- Brand accent: `#D94A4A` (coral/red) used in `.btn-primary`.
- Existing button styles: `.btn-primary` for primary actions, inline `className` for secondary buttons.
- Dark mode via `.dark` class on `<html>`.

### Environment Variables (Worker — `apps/worker/src/config.ts`)

```
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REFRESH_TOKEN
GMAIL_PUBSUB_TOPIC
GMAIL_USER_EMAIL=solutions@3rdaillc.com
```

### Dependencies Already Installed

**Web app (`apps/web/package.json`):**
- `react` 18.3, `next` 14.2, `tailwindcss` 3.4
- `date-fns` ^4.1.0
- `@supabase/supabase-js`, `openai`
- `pdf-parse` (if installed from previous prompt)

**Not yet in web app but needed:**
- `googleapis` — required for Gmail API access. Currently only in `apps/worker/package.json`.

---

## Implementation Plan — 5 Steps

### Step 1 — Install `googleapis` in the web app

```bash
cd apps/web
npm install googleapis
```

This is the official Google APIs Node.js client. It provides the Gmail and Drive API clients needed for inbox scanning. The worker already uses this package.

Also ensure these environment variables are available to the Next.js app (add to `.env` or `.env.local` at the monorepo root if not already present — they may already be there for the worker):

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REFRESH_TOKEN=...
```

These are **server-only** variables (no `NEXT_PUBLIC_` prefix) so they will only be accessible in API routes, not in client-side code.

---

### Step 2 — Create the Sync API Route

**New file:** `apps/web/app/api/sync/route.ts`

This route performs a full inbox scan when called. Here is what it must do:

```typescript
import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { processUpload, parseVtt, parseSbv } from '../../../lib/upload-pipeline';
import { getServerSupabase } from '../../../lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 120; // Allow up to 2 minutes for processing multiple emails

// ── Gmail Client ──

function getGmailClient() {
    const oauth2 = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    return google.gmail({ version: 'v1', auth: oauth2 });
}

function getDriveClient() {
    const oauth2 = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    return google.drive({ version: 'v3', auth: oauth2 });
}

// ── Filters (mirrors apps/worker/src/gmail/filters.ts) ──

const TRANSCRIPT_SUBJECT_PATTERNS = [
    /^Notes: /i,
    /^Notes from /i,
    /^Transcript for /i,
    /^Meeting transcript/i,
];

function isTranscriptEmail(from: string, subject: string): boolean {
    const senderMatch = from.toLowerCase().includes('gemini-notes@google.com');
    const subjectMatch = TRANSCRIPT_SUBJECT_PATTERNS.some((p) => p.test(subject));
    return senderMatch && subjectMatch;
}

// ── Title extraction (mirrors apps/worker/src/extraction/normalize.ts) ──

function extractMeetingTitle(subject: string): string {
    // Strip known prefixes
    const prefixes = [/^Notes:\s*/i, /^Notes from\s*/i, /^Transcript for\s*/i, /^Meeting transcript:\s*/i];
    let title = subject;
    for (const prefix of prefixes) {
        title = title.replace(prefix, '');
    }
    // Remove surrounding quotes
    title = title.replace(/^[""]|[""]$/g, '').trim();
    return title || subject;
}
```

**The `POST` handler must:**

1. **Search Gmail** for recent Gemini Notes emails using `gmail.users.messages.list()` with the query:
   ```
   from:gemini-notes@google.com newer_than:30d
   ```
   This returns message IDs for the last 30 days of Gemini Notes emails. Limit to 50 results max.

2. **For each message ID:**
   a. Check if `source_email_id` already exists in Supabase `transcripts` table (dedup).
   b. If already processed → skip.
   c. If new → fetch full message via `gmail.users.messages.get()`.
   d. Verify it passes `isTranscriptEmail()` filter.
   e. Extract transcript text using the same priority as the worker:
      - **Attachments** (`.txt`, `.vtt`, `.sbv`) → download and parse
      - **Google Doc link** → extract doc ID from HTML body, fetch via Drive API export
      - **Inline HTML** → strip tags, extract text (use a simple regex-based approach — no need for `cheerio` since the web app doesn't have it)
   f. Extract title from subject, date from `message.internalDate`.
   g. Call `processUpload({ text, title, date, extractionMethod })`.

3. **Return a JSON response** summarizing the results:
   ```typescript
   {
       found: number;       // total Gemini Notes emails found
       alreadyProcessed: number;  // skipped (dedup)
       newlyProcessed: number;    // successfully ingested
       errors: number;      // failed to process
       details: Array<{
           subject: string;
           status: 'skipped' | 'processed' | 'error';
           error?: string;
       }>;
   }
   ```

**Key implementation notes:**

- For **attachment downloads**, use `gmail.users.messages.attachments.get()` to fetch the attachment body, then decode from base64url to UTF-8. Use the existing `parseVtt()` and `parseSbv()` functions from `upload-pipeline.ts`.

- For **Google Doc extraction**, search the email body HTML for a Google Docs URL pattern (`/\/document\/d\/([a-zA-Z0-9_-]+)\//`), then call `drive.files.export({ fileId: docId, mimeType: 'text/plain' })`.

- For **inline HTML extraction**, since `cheerio` is not in the web app, write a simple `stripHtml(html: string): string` helper that:
  - Removes `<script>` and `<style>` blocks
  - Replaces `<br>` and `</p>` and `</div>` with newlines
  - Strips all remaining HTML tags
  - Collapses multiple blank lines
  - Trims result

- **Error handling**: If one email fails, catch the error, log it, and continue processing the rest. Do not let one failure abort the entire sync.

- **Set `extraction_method` values**: Use `'attachment'`, `'google_doc'`, or `'inline'` matching what the worker uses, so extraction methods are consistent across both sync pathways.

---

### Step 3 — Add a Gmail Helper Library (Optional Consolidation)

**File:** `apps/web/lib/gmail.ts`

To keep the sync route clean, extract the Gmail-specific logic into a helper module:

```typescript
// apps/web/lib/gmail.ts

// Exports:
// - getGmailClient()
// - getDriveClient()
// - isTranscriptEmail(from, subject)
// - extractMeetingTitle(subject)
// - searchTranscriptEmails(maxResults?: number, newerThanDays?: number)
// - fetchFullMessage(messageId: string)
// - downloadAttachment(messageId: string, attachmentId: string)
// - fetchGoogleDocText(docId: string)
// - stripHtml(html: string)
```

This is optional but recommended for code organization. If you prefer to keep everything in the route file for simplicity, that's fine — but the route will be ~200+ lines.

---

### Step 4 — Update the Transcript Library Page

**File:** `apps/web/app/transcripts/page.tsx`

Add a **Sync Inbox** button to the filter bar, next to the existing `UploadModal`:

1. **Add state variables:**
   ```typescript
   const [syncing, setSyncing] = useState(false);
   const [syncResult, setSyncResult] = useState<{
       found: number;
       alreadyProcessed: number;
       newlyProcessed: number;
       errors: number;
   } | null>(null);
   ```

2. **Add the sync handler:**
   ```typescript
   const handleSync = async () => {
       setSyncing(true);
       setSyncResult(null);
       try {
           const res = await fetch('/api/sync', { method: 'POST' });
           const data = await res.json();
           setSyncResult(data);
           // Refresh the transcript list to show newly ingested transcripts
           refreshTranscripts();
       } catch {
           setSyncResult(null);
       } finally {
           setSyncing(false);
       }
   };
   ```

3. **Add the button to the filter bar:**

   Place it between the participant filter input and the UploadModal:
   ```tsx
   <div className="flex gap-3 mb-6">
       <input placeholder="Search by keyword..." className="input-glow flex-1" />
       <input placeholder="Filter by participant..." className="input-glow w-64" />
       <button
           onClick={handleSync}
           disabled={syncing}
           className="px-4 py-2 text-sm font-medium rounded-lg transition-colors
                      bg-transparent border border-[rgb(var(--color-border))]
                      text-[rgb(var(--color-foreground))]
                      hover:bg-[rgb(var(--color-muted))]
                      disabled:opacity-50 disabled:cursor-not-allowed
                      whitespace-nowrap"
       >
           {syncing ? 'Syncing...' : '⟳ Sync Inbox'}
       </button>
       <UploadModal onSuccess={() => refreshTranscripts()} />
   </div>
   ```

   The button uses a **secondary/outlined style** (border, no fill) to visually differentiate it from the primary Upload button. When syncing, it shows "Syncing…" and is disabled.

4. **Add a sync result banner:**

   Below the filter bar, show a temporary result summary when a sync completes:
   ```tsx
   {syncResult && (
       <div className="mb-4 px-4 py-3 rounded-lg border border-[rgb(var(--color-border))]
                       bg-[rgb(var(--color-card))] text-sm text-[rgb(var(--color-foreground))]
                       flex items-center justify-between">
           <span>
               Sync complete — found {syncResult.found} emails,
               {syncResult.newlyProcessed > 0
                   ? ` ingested ${syncResult.newlyProcessed} new transcript${syncResult.newlyProcessed !== 1 ? 's' : ''}`
                   : ' no new transcripts'}
               {syncResult.errors > 0 && `, ${syncResult.errors} error${syncResult.errors !== 1 ? 's' : ''}`}
           </span>
           <button
               onClick={() => setSyncResult(null)}
               className="text-[rgb(var(--color-muted-foreground))] hover:text-[rgb(var(--color-foreground))] ml-4"
           >
               ✕
           </button>
       </div>
   )}
   ```

   This banner is dismissible (click the ✕) and auto-clears when the next sync starts.

---

### Step 5 — Testing Checklist

After implementation, verify:

- [ ] **Sync finds existing emails:** Click "Sync Inbox" → the route searches Gmail and finds Gemini Notes emails from the last 30 days.
- [ ] **Dedup works:** If all found emails are already in the database, the result shows `newlyProcessed: 0` and `alreadyProcessed: N`.
- [ ] **New emails are processed:** Send a test email from `gemini-notes@google.com` (or have a real one waiting) → click Sync → the transcript appears in the library.
- [ ] **Attachment extraction works:** An email with a `.vtt` or `.txt` attachment is correctly parsed and ingested.
- [ ] **Google Doc extraction works:** An email containing a Google Docs link has its transcript fetched via Drive API.
- [ ] **Inline extraction works:** An email with the transcript directly in the body HTML is correctly extracted.
- [ ] **Title extraction:** The meeting title is correctly extracted from the email subject (e.g., "Notes: Sprint Planning" → "Sprint Planning").
- [ ] **Date extraction:** The meeting date is correctly parsed from `message.internalDate`.
- [ ] **Error resilience:** If one email fails to process, the rest still succeed. The error count is reported in the result.
- [ ] **Button state:** The button shows "Syncing…" while working and re-enables when done.
- [ ] **Result banner:** Shows correct counts after sync, is dismissible.
- [ ] **Transcript list refreshes:** After sync completes, new transcripts appear in the table without a page reload.
- [ ] **Existing upload still works:** The UploadModal for `.txt`/`.vtt`/`.sbv`/`.pdf` still functions correctly.
- [ ] **Dark mode:** The sync button and result banner look correct in both light and dark themes.
- [ ] **Environment variables:** The route correctly reads `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REFRESH_TOKEN` from the server environment.

---

## What NOT to Do

- **Do NOT call the Cloud Run worker from the web app.** The worker is a separate service reached via Pub/Sub push. The sync route operates independently using the same Gmail credentials.
- **Do NOT install `cheerio` in the web app** just for HTML stripping. Write a simple regex-based `stripHtml()` helper. It doesn't need to handle every edge case — Gemini Notes emails have simple HTML structure.
- **Do NOT duplicate the chunking/embedding/storage logic.** Use the existing `processUpload()` function from `apps/web/lib/upload-pipeline.ts`. It already handles everything after text extraction.
- **Do NOT scan more than 30 days of emails.** Older transcripts can be uploaded manually via the Upload button. The sync is meant for catching recent emails that Pub/Sub may have missed.
- **Do NOT add glassmorphism, backdrop-blur, or gradient backgrounds.** The design system is flat with solid `rgb(var(--color-card))` backgrounds and `1px solid rgb(var(--color-border))` borders.
- **Do NOT modify the worker service (`apps/worker/`).** This feature is entirely within the web app.
- **Do NOT expose Google credentials to the client.** The env vars have no `NEXT_PUBLIC_` prefix and are only accessed in the server-side API route.
- **Do NOT process emails synchronously one at a time if there are many.** Use `Promise.allSettled()` for parallel processing of up to 5 emails at a time to speed up bulk syncs, while respecting API rate limits.
- **Do NOT remove or change the Pub/Sub automation.** The sync button is a complement to it, not a replacement.

---

## File Summary

| File | Action |
|------|--------|
| `apps/web/app/api/sync/route.ts` | **New** — Gmail inbox scan + process pipeline |
| `apps/web/lib/gmail.ts` | **New (optional)** — Gmail helper functions |
| `apps/web/app/transcripts/page.tsx` | **Modify** — Add Sync Inbox button + result banner |
| `apps/web/package.json` | **Modify** — Add `googleapis` dependency |
| `.env` / `.env.local` | **Verify** — Ensure Google OAuth vars are available to web app |

