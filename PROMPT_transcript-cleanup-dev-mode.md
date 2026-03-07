# Prompt: Transcript Pipeline — Clean Slate & Dev-Mode Testing Setup

> **Target model:** Claude 4.6 Opus
> **IDE:** Google Anti-Gravity
> **Workspace:** `meet-transcript-pipeline/` (Turborepo monorepo)

---

## System Context

You are working in a Turborepo monorepo called **MeetScript** — a Google Meet transcript pipeline that ingests meeting transcripts (from Gmail Pub/Sub and Loom imports), chunks and embeds them with OpenAI, stores them in Supabase (PostgreSQL + pgvector), and serves a Next.js RAG dashboard.

### Architecture at a Glance

```
apps/web/          → Next.js 14 dashboard (port 3000)
apps/worker/       → Express Pub/Sub receiver + 8-step pipeline (port 3001)
packages/shared/   → TypeScript types, Claude extraction helpers
scripts/           → Bulk backfill & import scripts
supabase/          → SQL migrations (001–007)
loom_transcripts_chris_lutfiya/  → 39 local Loom transcript .txt files + _manifest.json
```

### Database Tables (Supabase)

| Table | Purpose |
|---|---|
| `transcripts` | Core meeting records (id, title, date, raw text, source_email_id) |
| `transcript_chunks` | Vectorized chunks with pgvector embeddings (1536-dim) |
| `action_items` | AI-extracted action items (created_by: ai/human) |
| `decisions` | AI-extracted decisions |
| `processing_log` | Pipeline execution audit trail |
| `activity_log` | User/system event log |

### Bulk/Backfill Scripts to Address

| Script | Path | What It Does |
|---|---|---|
| `backfill.ts` | `scripts/backfill.ts` | Scans Gmail history for transcript emails, routes them through the full pipeline |
| `backfill-action-items.mjs` | `scripts/backfill-action-items.mjs` | Bulk-extracts action items from all unprocessed transcripts via Claude |
| `import-loom-transcripts.mjs` | `scripts/import-loom-transcripts.mjs` | Batch-imports all .txt files from `loom_transcripts_chris_lutfiya/` |
| `generate_manifest.mjs` | `scripts/generate_manifest.mjs` | Generates `_manifest.json` from local transcript files |

### Key API Routes (relevant to cleanup)

- `POST /api/import-loom` — Single Loom transcript import (supports `?dryRun=true`)
- `POST /api/action-items/extract` — Extract action items from one transcript
- `POST /api/action-items/extract-all` — Bulk extract from all unprocessed
- `POST /api/decisions/extract` — Extract decisions from one transcript
- `POST /api/decisions/extract-all` — Bulk extract from all unprocessed
- `GET /api/transcripts` — List all transcripts
- `POST /api/upload` — File upload pipeline

---

## Task

Transition this pipeline from a bulk-loaded production state to a **clean dev/testing environment**. This means:

### Phase 1 — Clear All Existing Data

1. **Write a `scripts/dev-reset.ts` script** that:
   - Truncates (or deletes all rows from) these tables **in dependency order**:
     1. `activity_log`
     2. `decisions`
     3. `action_items`
     4. `transcript_chunks`
     5. `processing_log`
     6. `transcripts`
   - Uses the Supabase service-role client (from existing `apps/worker/src/db/supabase.ts` pattern)
   - Prints row counts before and after deletion for each table
   - Requires a `--confirm` flag to actually execute (default is dry-run)
   - Logs a summary: `"Dev reset complete. Deleted X transcripts, Y chunks, Z action items, W decisions."`

2. **Do NOT delete** the local `.txt` files in `loom_transcripts_chris_lutfiya/` — those are source material we'll selectively re-import later.

### Phase 2 — Clean Up Bulk Retro Scripts

3. **Archive the bulk scripts** — move these into a new `scripts/archive/` directory:
   - `scripts/backfill.ts`
   - `scripts/backfill-action-items.mjs`
   - `scripts/import-loom-transcripts.mjs`

   Leave `scripts/generate_manifest.mjs` and `scripts/setup-oauth.mjs` in place (still useful).

4. **Update any references** to the moved scripts:
   - Check `package.json` scripts section at the monorepo root
   - Check `README.md` for command examples
   - Check inline comments or imports that reference these files
   - Update paths or add a note that they've been archived

### Phase 3 — Build a Dev-Friendly Single/Small-Batch Import Workflow

5. **Create `scripts/dev-import.ts`** — a lightweight CLI for importing 1–N transcripts for testing:

   ```
   Usage:
     npx tsx scripts/dev-import.ts <file1.txt> [file2.txt] [file3.txt]
     npx tsx scripts/dev-import.ts --pick 3          # randomly pick 3 from loom_transcripts_chris_lutfiya/
     npx tsx scripts/dev-import.ts --dry-run <file>   # preview without writing to DB
   ```

   Implementation details:
   - Reuse the existing Loom transcript header parser from `import-loom-transcripts.mjs`
   - Route each file through the **same pipeline** used by the web's `/api/import-loom` endpoint (dedup check → store transcript → chunk → embed → store chunks)
   - Process **sequentially** with a 2-second delay between files (to respect embedding rate limits)
   - After each import, **automatically trigger** action item and decision extraction for that transcript (matching current `auto-extract.ts` behavior)
   - Print per-file results: `✓ imported "Chris/Lutfiya 2025-12-16" (4373 words, 12 chunks, 3 action items, 1 decision)`
   - Support `--skip-extraction` flag to import without running Claude extraction (faster for pure pipeline testing)

6. **Create `scripts/dev-status.ts`** — a quick CLI to check current DB state:

   ```
   npx tsx scripts/dev-status.ts
   ```

   Output:
   ```
   === MeetScript Dev Status ===
   Transcripts:      3
   Chunks:          36
   Action Items:     8  (7 ai, 1 human)
   Decisions:        2
   Processing Log:   3  (3 success, 0 error)
   Last Import:      2025-12-16T20:09:18Z — "Chris/Lutfiya"
   ```

### Phase 4 — Wire Into package.json

7. **Add npm scripts** to the root `package.json`:

   ```json
   {
     "scripts": {
       "dev:reset": "tsx scripts/dev-reset.ts",
       "dev:import": "tsx scripts/dev-import.ts",
       "dev:status": "tsx scripts/dev-status.ts"
     }
   }
   ```

### Constraints & Guidelines

- **Preserve all existing pipeline logic.** Do not modify `apps/worker/src/pipeline.ts`, `apps/web/lib/upload-pipeline.ts`, or any API routes. The dev scripts should call into or reuse existing code paths.
- **Use existing patterns.** Follow the same Supabase client initialization, environment variable loading, and TypeScript conventions already in the codebase.
- **ES Module compatibility.** The monorepo uses `"type": "module"`. New `.ts` scripts should use `tsx` for execution. Match import style of existing scripts.
- **Error handling.** All new scripts should catch and display errors gracefully, not crash silently.
- **No production impact.** Nothing here should affect the real-time Gmail → Pub/Sub → Worker pipeline. The worker and web app should continue to function normally for any new incoming transcript emails.

### Execution Order

Run the phases in order. After each phase, verify:

1. After Phase 1: `dev-reset.ts` exists, runs in dry-run by default, clears all tables with `--confirm`
2. After Phase 2: Bulk scripts moved to `scripts/archive/`, references updated
3. After Phase 3: Can import a single transcript with `dev-import.ts`, see it in `dev-status.ts`
4. After Phase 4: `npm run dev:reset`, `npm run dev:import`, `npm run dev:status` all work
