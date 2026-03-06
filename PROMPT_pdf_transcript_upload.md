# Prompt: Add PDF Transcript Upload with Automatic Date Detection

> **Target model:** Claude 4.6 Opus — Google Antigravity IDE
> **App:** ScienceExperts.ai — Transcript Pipeline (Next.js 14 App Router + Supabase + OpenAI embeddings)

---

## Goal

Extend the existing transcript upload feature to accept **PDF files**. When a PDF is uploaded, the system must:

1. Extract all text from the PDF.
2. Attempt to **automatically detect the meeting date** from the extracted text (common patterns: headers, timestamps, "Date: …", "Meeting — March 4, 2025", etc.).
3. If a date is detected, **pre-fill** the date picker in the upload modal and mark it as auto-detected so the user can confirm or override.
4. If no date is found, fall back to the user-supplied date (or today's date), same as existing behavior.
5. Feed the extracted text into the **existing** chunking → embedding → storage pipeline (`processUpload()`).

---

## Current State of the Codebase

### Upload Modal (`apps/web/components/upload-modal.tsx`)

- Accepts `.txt`, `.vtt`, `.sbv` via drag-and-drop or file picker.
- User provides an optional **title** (defaults from filename) and **date** (defaults to today).
- Sends `POST /api/upload` with `FormData` containing `file`, `title`, and `date`.
- Shows 4-stage progress: Uploading → Parsing → Generating embeddings → Storing.
- Two component variants: `UploadModal` (page-level) and `SidebarUploadButton` (sidebar compact button).
- The accepted extensions are validated client-side in the `<input accept="…">` attribute and in the validation logic.

### Upload API Route (`apps/web/app/api/upload/route.ts`)

```typescript
// Current structure:
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get('file') as File;
  const titleOverride = formData.get('title') as string | null;
  const dateOverride = formData.get('date') as string | null;

  // Validation
  const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
  const ALLOWED = ['.txt', '.vtt', '.sbv'];
  // ... extension check, size check ...

  // Parse based on extension
  const raw = await file.text();
  let parsed: string;
  if (ext === '.vtt') parsed = parseVtt(raw);
  else if (ext === '.sbv') parsed = parseSbv(raw);
  else parsed = raw;

  // Process through pipeline
  const result = await processUpload({ text: parsed, title, date });
  return NextResponse.json(result);
}
```

### Upload Pipeline (`apps/web/lib/upload-pipeline.ts`)

The `processUpload()` function accepts `{ text, title, date? }` and handles:
- Participant extraction from speaker turns
- Transcript ID generation (`YYYY-MM-DD_slug`)
- Supabase INSERT into `transcripts` table
- Chunking (2000-char target, 400-char overlap, speaker-aware)
- Embedding generation (OpenAI `text-embedding-3-small`, batched 20 at a time, exponential backoff retry)
- Supabase INSERT into `transcript_chunks` table
- Logging to `processing_log` and `activity_log`
- Rollback on error (delete transcript + chunks)

**The pipeline itself does not need modification** — it already accepts plain text. Only the **parsing layer** (API route) needs to handle PDF → text extraction.

### Database Schema

The `transcripts` table has an `extraction_method` column (`TEXT`). Current values include `'attachment'`, `'google_doc'`, `'inline'`, `'upload'`. We will add `'pdf_upload'` as a new value for PDF uploads.

### Design System (`apps/web/app/globals.css`)

- **Flat design** — solid backgrounds, subtle borders, minimal shadows (NOT glassmorphism).
- CSS variables: `--color-background`, `--color-foreground`, `--color-card`, `--color-border`, `--color-muted`, etc.
- Brand accent: `#D94A4A` (coral/red) used in `.btn-primary` and `.stat-card::before`.
- Pill-shaped navigation and rounded-full buttons.
- Dark mode via `.dark` class on `<html>`.

### Dependencies Already Installed

- `react` 18.3, `next` 14.2, `tailwindcss` 3.4
- `date-fns` ^4.1.0 (for all date math and formatting)
- `@supabase/supabase-js`, `openai`, `@anthropic-ai/sdk`

---

## Implementation Plan — 4 Steps

### Step 1 — Install `pdf-parse` for server-side PDF text extraction

```bash
cd apps/web
npm install pdf-parse
```

`pdf-parse` is a lightweight, zero-dependency Node.js library that extracts text from PDF buffers. It works in Next.js API routes (server-side only). No other PDF library is needed.

> **Note:** `pdf-parse` does not need a type declaration — its types are included. If TypeScript warns, add `@types/pdf-parse` as a devDependency.

---

### Step 2 — Update the Upload API Route

**File:** `apps/web/app/api/upload/route.ts`

Extend the route to handle `.pdf` files:

1. **Add `.pdf` to `ALLOWED` extensions:**
   ```typescript
   const ALLOWED = ['.txt', '.vtt', '.sbv', '.pdf'];
   ```

2. **Add a PDF parsing branch** that:
   - Reads the file as an `ArrayBuffer` (not `.text()`).
   - Passes the `Buffer` to `pdf-parse`.
   - Returns the extracted text string.

3. **Add a date-detection helper** function called `detectMeetingDate(text: string): Date | null` that scans the **first ~2000 characters** of the extracted text for common date patterns:

   **Patterns to detect (in priority order):**
   - `Date: March 4, 2025` or `Date: 2025-03-04` or `Date: 03/04/2025`
   - `Meeting Date: …` (same date formats)
   - `Meeting — March 4, 2025` or `Meeting - March 4, 2025`
   - ISO 8601: `2025-03-04` standalone on a line
   - US format: `MM/DD/YYYY` or `M/D/YYYY`
   - Long form: `March 4, 2025` or `4 March 2025` or `Mar 4, 2025`
   - Timestamps with dates: `2025-03-04T10:30:00`

   **Use `date-fns/parse` and `date-fns/isValid`** to validate any candidate date string. Return the **first valid date** found, or `null` if none detected.

   **Important:** Only scan the first ~2000 characters (typically the header/title area of a transcript). Do not scan the entire document — meeting dates appear at the top.

4. **For PDF uploads:**
   - If the user did NOT supply a date override AND `detectMeetingDate()` returns a date → use the detected date.
   - If the user DID supply a date override → always use the user's date (it takes precedence).
   - Pass `extraction_method: 'pdf_upload'` to `processUpload()`.

5. **Return the detected date in the response** so the client can display it:
   ```typescript
   return NextResponse.json({
     ...result,
     detectedDate: detectedDate?.toISOString() ?? null,
   });
   ```

**Here is the current full content of the route file** (`apps/web/app/api/upload/route.ts`):

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { processUpload, parseVtt, parseSbv } from '../../../lib/upload-pipeline';

export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        const titleOverride = formData.get('title') as string | null;
        const dateOverride = formData.get('date') as string | null;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        const name = file.name.toLowerCase();
        const ext = name.substring(name.lastIndexOf('.'));
        const ALLOWED = ['.txt', '.vtt', '.sbv'];

        if (!ALLOWED.includes(ext)) {
            return NextResponse.json(
                { error: `Unsupported file type: ${ext}. Allowed: ${ALLOWED.join(', ')}` },
                { status: 400 }
            );
        }

        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json(
                { error: `File too large. Max size: ${MAX_FILE_SIZE / 1024 / 1024}MB` },
                { status: 400 }
            );
        }

        const raw = await file.text();
        let parsed: string;

        if (ext === '.vtt') {
            parsed = parseVtt(raw);
        } else if (ext === '.sbv') {
            parsed = parseSbv(raw);
        } else {
            parsed = raw;
        }

        if (!parsed.trim()) {
            return NextResponse.json(
                { error: 'File appears to be empty or could not be parsed' },
                { status: 400 }
            );
        }

        const title = titleOverride?.trim() || file.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ');
        const date = dateOverride ? new Date(dateOverride) : new Date();

        const result = await processUpload({ text: parsed, title, date });

        return NextResponse.json(result, { status: 201 });
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Upload failed';
        console.error('[upload] Error:', msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
```

**What to change:**
- Add `import pdf from 'pdf-parse';` at the top.
- Add `import { parse as dateParse, isValid } from 'date-fns';` at the top.
- Add `.pdf` to the `ALLOWED` array.
- Add the `detectMeetingDate()` helper function before the `POST` handler.
- In the parsing switch, add a `.pdf` branch: read file as `ArrayBuffer` → `Buffer.from(arrayBuffer)` → `pdf(buffer)` → use `result.text`.
- After parsing, if `ext === '.pdf'` and no `dateOverride`, call `detectMeetingDate(parsed)` and use the result.
- Set `extraction_method` to `'pdf_upload'` for PDF files (pass this through to `processUpload`).
- Return `detectedDate` in the JSON response.

**Note on `processUpload`:** The function currently sets `extraction_method: 'upload'` internally. To support `'pdf_upload'`, add an optional `extractionMethod?: string` parameter to `processUpload()` in `apps/web/lib/upload-pipeline.ts`. If provided, use it; otherwise default to `'upload'`. This is a one-line change in the pipeline.

---

### Step 3 — Update the Upload Modal to Accept PDFs and Show Detected Dates

**File:** `apps/web/components/upload-modal.tsx`

Changes:

1. **Update accepted file types:**
   - Change the `<input accept="…">` attribute to include `.pdf`.
   - Update the file extension validation logic to include `.pdf`.
   - Update the helper text that tells users which formats are accepted: add "PDF" to the list.

2. **Add a "date detected" indicator:**
   After a successful upload, if the API response includes a non-null `detectedDate`, show a small info badge near the date field:

   ```tsx
   {detectedDate && (
     <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 mt-1">
       <span>✓</span>
       <span>Date auto-detected from PDF</span>
     </div>
   )}
   ```

3. **Optional enhancement — pre-detection flow:**
   For a better UX, consider a **two-phase upload for PDFs**:
   - Phase 1: Upload the PDF, extract text + detect date on the server, return the detected date and a preview snippet.
   - Phase 2: Show the user the detected date (pre-filled) and let them confirm or change it before final processing.

   However, this is optional. The simpler approach (detect date server-side during processing, show confirmation after) is perfectly acceptable for v1. You may implement the two-phase approach later if desired.

4. **Update the progress stages for PDF:**
   Add a stage between "Uploading file…" and "Parsing transcript…" for PDFs:
   - "Uploading file…"
   - "Extracting text from PDF…" ← new stage, only shown for .pdf
   - "Parsing transcript…"
   - "Generating embeddings…"
   - "Storing in database…"

5. **Update the drag-and-drop zone text:**
   Currently says something like "Drop .txt, .vtt, or .sbv files here". Update to: "Drop .txt, .vtt, .sbv, or .pdf files here".

---

### Step 4 — Testing Checklist

After implementation, verify:

- [ ] **PDF upload works end-to-end**: Upload a PDF transcript → text extracted → chunked → embedded → stored in Supabase.
- [ ] **Date detection works**: Upload a PDF with "Date: March 4, 2025" in the first page → the `meeting_date` in the database matches.
- [ ] **Date detection fallback**: Upload a PDF with no recognizable date → system uses today's date (or user-supplied date).
- [ ] **User date override**: Select a manual date in the date picker, then upload a PDF with a different date in the text → the user's manual date should be used, not the detected one.
- [ ] **Existing formats still work**: Upload a `.txt`, `.vtt`, `.sbv` file → same behavior as before, no regressions.
- [ ] **Large PDFs**: Upload a 5+ page PDF transcript → all text extracted, chunked, and embedded correctly.
- [ ] **Empty/image-only PDFs**: Upload a PDF with no extractable text (e.g., a scanned image) → returns a clear error message: "Could not extract text from this PDF. It may be an image-based scan."
- [ ] **`extraction_method` is `'pdf_upload'`**: Check the `transcripts` table → the row for a PDF upload shows `extraction_method = 'pdf_upload'`.
- [ ] **Activity log**: Check `activity_log` → entry with `event_type: 'transcript_uploaded'` and metadata includes PDF-specific info.
- [ ] **Sidebar upload button**: The `SidebarUploadButton` variant also accepts PDFs.
- [ ] **Dark mode**: The date-detected badge looks correct in both light and dark themes.

---

## What NOT to Do

- **Do NOT modify `processUpload()` beyond adding the optional `extractionMethod` parameter.** The pipeline already handles `{ text, title, date }` — PDF parsing is done before calling it.
- **Do NOT use `pdf-lib` or `pdfjs-dist` for text extraction.** `pdf-parse` is simpler and purpose-built for this. `pdf-lib` is for PDF creation/editing. `pdfjs-dist` is a full browser renderer and is overkill for server-side text extraction.
- **Do NOT scan the entire PDF text for dates.** Only scan the first ~2000 characters. Meeting dates appear in headers, not deep in the transcript body.
- **Do NOT remove or change the existing `.txt`, `.vtt`, `.sbv` handling.** PDF support is additive.
- **Do NOT add glassmorphism, backdrop-blur, or gradient backgrounds.** The design system is flat: solid `rgb(var(--color-card))` backgrounds, `1px solid rgb(var(--color-border))` borders, minimal shadows.
- **Do NOT use `moment.js` or `dayjs` for date parsing.** Use `date-fns` — it's already installed.
- **Do NOT attempt OCR.** `pdf-parse` extracts embedded text only. If the PDF is a scanned image with no text layer, return an error. OCR can be added later if needed.
- **Do NOT change the branding.** The app is "ScienceExperts.ai — Transcript Pipeline" with the coral/red `#D94A4A` accent. Keep it consistent.

---

## File Summary

| File | Action |
|------|--------|
| `apps/web/app/api/upload/route.ts` | Extend with PDF parsing + date detection |
| `apps/web/lib/upload-pipeline.ts` | Add optional `extractionMethod` param to `processUpload()` |
| `apps/web/components/upload-modal.tsx` | Accept `.pdf`, show detected-date badge, update help text |
| `package.json` (apps/web) | Add `pdf-parse` dependency |

**No new files are needed.** All changes extend existing files.
