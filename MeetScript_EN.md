# MeetScript.md — Meeting Intelligence Pipeline

> **Last Updated:** March 2026
> **Repository:** `meet-transcript-pipeline` (Turborepo monorepo)
> **Built by:** [3rd AI LLC](https://3rdai.co) · `solutions@3rdaillc.com`
> **Founders:** Dr. Lutfiya Miller (US) & Chris Müller (Europe)

---

## 1. What is MeetScript?

MeetScript is a **full-stack meeting intelligence pipeline** that transforms Google Meet transcripts into a searchable, queryable, actionable knowledge base. It automatically ingests transcripts from Gmail, extracts text from multiple formats, generates vector embeddings, and provides a RAG-powered conversational AI that can answer questions across the entire meeting history.

### Core Mission

Built originally for the co-founders of ScienceExperts.ai to make their cross-Atlantic collaboration effortless, MeetScript is being commercialized as a **meeting intelligence platform** for teams and companies. The core thesis: meetings produce decisions, context, tasks, and strategic direction — MeetScript captures all of it automatically and makes it searchable, traceable, and actionable.

### What Makes It Different

- **Automatic ingestion** — transcripts flow in from Gmail via Pub/Sub with zero manual steps
- **Three extraction formats** — inline HTML, Google Docs links, and file attachments (.txt/.vtt/.sbv), plus manual uploads, PDF uploads, paste, and Loom imports
- **Decision Ledger** — decisions are first-class entities, distinct from action items, with their own embeddings, domain classification, confidence scoring, supersession chains, and decision-aware RAG
- **AI action item extraction** — Claude reads each transcript and extracts tasks with assignee detection, priority inference, effort estimation, and smart topic grouping
- **RAG-powered "Ask AI"** — conversational search across all meeting history using Claude Sonnet 4 + cosine similarity retrieval, with inline citations and decision context

---

## 2. Technology Stack

| Category | Technology | Version / Details |
|:---|:---|:---|
| **Monorepo** | Turborepo | 2.3.x |
| **Frontend** | Next.js (App Router) | 14.2.x |
| **UI Library** | React | 18.3.x |
| **Language** | TypeScript | 5.5.x |
| **Styling** | Tailwind CSS | 3.4.x |
| **Database** | PostgreSQL (via Supabase) | with pgvector extension |
| **Vector Search** | pgvector | 1536-dim, IVFFlat indexes |
| **Worker Service** | Node.js / Express | on Cloud Run |
| **Embeddings** | OpenAI `text-embedding-3-small` | 1536 dimensions |
| **AI / RAG** | Anthropic Claude Sonnet 4 | `claude-sonnet-4-20250514` |
| **Gmail Integration** | Google APIs (Gmail, Docs, Drive) | via OAuth2 + Cloud Pub/Sub |
| **Authentication** | Custom JWT (JOSE library) | HTTP-only cookies |
| **Password Hashing** | bcryptjs | 3.0.x |
| **PDF Parsing** | pdf-parse | 1.1.x |
| **HTML Parsing** | Cheerio | 1.0.x |
| **Markdown Rendering** | react-markdown | 10.1.x |
| **Date Utils** | date-fns | 4.1.x |
| **Testing** | Vitest | 2.1.x (worker tests) |
| **Package Manager** | npm | 10.2.0 |
| **Fonts** | Inter (sans) + JetBrains Mono (mono) | via Google Fonts |
| **Deployment** | Cloud Run (worker) + Vercel (frontend) | — |

---

## 3. Architecture Overview

### 3.1 System Architecture

```
Google Cloud                    Worker (Cloud Run)               Supabase (PostgreSQL + pgvector)
┌─────────────────┐            ┌────────────────────────────┐    ┌─────────────────────────────┐
│ Gmail API       │───push──→  │ Pub/Sub Handler            │    │ transcripts                 │
│ Cloud Pub/Sub   │            │   ↓                        │    │ transcript_chunks (vectors)  │
│ Google Docs API │            │ Transcript Extraction       │──→ │ action_items                │
│ Google Drive API│            │   (inline/doc/attachment)   │    │ decisions (vectors)          │
└─────────────────┘            │   ↓                        │    │ activity_log                │
                               │ Text Chunking (~500 tokens) │    │ processing_log              │
                               │   ↓                        │    │ app_users                   │
                               │ OpenAI Embeddings (1536-dim)│    └─────────────────────────────┘
                               └────────────────────────────┘              ↑
                                                                           │
                               ┌────────────────────────────┐              │
                               │ Next.js Dashboard          │──REST API────┘
                               │   Dashboard Home           │
                               │   Transcript Library        │    ┌─────────────────────────────┐
                               │   Action Items (Kanban)     │    │ Anthropic Claude Sonnet 4   │
                               │   Decision Ledger           │──→ │   RAG answers               │
                               │   Ask AI (RAG Chat)         │    │   Action item extraction     │
                               │   Calendar + Scoreboard     │    │   Decision extraction        │
                               │   Activity Feed             │    │   Smart grouping             │
                               │   Processing Logs           │    │   Effort estimation          │
                               └────────────────────────────┘    └─────────────────────────────┘
```

### 3.2 Directory Structure

```
meet-transcript-pipeline/
├── apps/
│   ├── web/                           # Next.js 14 Dashboard (App Router)
│   │   ├── app/
│   │   │   ├── page.tsx               # Dashboard Home
│   │   │   ├── layout.tsx             # Root Layout (sidebar + theme)
│   │   │   ├── globals.css            # Design system (CSS variables + Tailwind components)
│   │   │   ├── login/                 # Login page
│   │   │   ├── transcripts/           # Transcript Library
│   │   │   ├── action-items/          # Action Items Kanban Board
│   │   │   ├── decisions/             # Decision Ledger
│   │   │   ├── ask/                   # Ask AI (RAG Chat)
│   │   │   ├── calendar/              # Calendar Heatmap + Scoreboard
│   │   │   ├── logs/                  # Processing Log Viewer
│   │   │   ├── admin/                 # Admin pages (login, user management)
│   │   │   └── api/                   # API Routes
│   │   │       ├── auth/              # Login, Logout, Token management
│   │   │       ├── transcripts/       # CRUD + summarize
│   │   │       ├── action-items/      # CRUD + extract + group + estimate
│   │   │       ├── decisions/         # CRUD + extract
│   │   │       ├── query/             # RAG search endpoint
│   │   │       ├── calendar/          # Analytics + scoreboard
│   │   │       ├── activity/          # Activity log feed
│   │   │       ├── upload/            # Manual upload (file + paste)
│   │   │       ├── sync/              # Gmail inbox sync trigger
│   │   │       ├── logs/              # Processing log viewer
│   │   │       └── admin/             # Admin setup
│   │   ├── components/
│   │   │   ├── sidebar.tsx            # Navigation sidebar
│   │   │   ├── upload-modal.tsx       # Upload modal (file + paste)
│   │   │   ├── auth-layout.tsx        # Auth-gated layout wrapper
│   │   │   ├── theme-toggle.tsx       # Dark/light mode toggle
│   │   │   └── timezone-clock.tsx     # Timezone display
│   │   ├── lib/
│   │   │   ├── auth.ts               # JWT session management (JOSE)
│   │   │   ├── db.ts                 # User authentication logic
│   │   │   ├── supabase.ts           # Supabase client (server + browser)
│   │   │   ├── api.ts                # Frontend API client (all endpoints)
│   │   │   ├── upload-pipeline.ts    # Upload processing pipeline
│   │   │   ├── auto-extract.ts       # Background action item extraction
│   │   │   ├── gmail.ts              # Gmail client for sync
│   │   │   ├── pdf-extract.ts        # PDF text extraction
│   │   │   ├── detect-meeting-date.ts # Date detection from text/filenames
│   │   │   └── theme.tsx             # Theme provider
│   │   ├── middleware.ts              # Auth middleware (cookie + token bypass)
│   │   ├── next.config.js             # Transpile shared package, PDF support
│   │   ├── tailwind.config.js         # Brand palette, semantic tokens, animations
│   │   └── postcss.config.js
│   │
│   └── worker/                        # Express Worker Service (Cloud Run)
│       ├── src/
│       │   ├── index.ts               # Express server (health + Pub/Sub endpoint)
│       │   ├── config.ts              # Environment configuration loader
│       │   ├── pipeline.ts            # Main processing pipeline (9 steps)
│       │   ├── gmail/
│       │   │   ├── client.ts          # OAuth2 Gmail/Docs/Drive clients
│       │   │   ├── filters.ts         # Transcript email detection rules
│       │   │   ├── handler.ts         # Pub/Sub message handler
│       │   │   └── watcher.ts         # Gmail watch registration + renewal
│       │   ├── extraction/
│       │   │   ├── normalize.ts       # Title, participants, date, ID extraction
│       │   │   ├── inline.ts          # HTML transcript extraction (Cheerio)
│       │   │   ├── google-doc.ts      # Google Doc export (Drive API)
│       │   │   ├── attachment.ts      # Attachment download (Gmail API)
│       │   │   └── parsers.ts         # VTT + SBV parsers
│       │   ├── chunking/
│       │   │   └── chunker.ts         # Speaker-turn-aware text chunking
│       │   ├── embedding/
│       │   │   └── embedder.ts        # OpenAI embedding generation (batched)
│       │   ├── db/
│       │   │   ├── supabase.ts        # Supabase client (service-role)
│       │   │   └── queries.ts         # Database read/write operations
│       │   └── __tests__/             # Vitest test suites
│       │       ├── extraction.test.ts
│       │       ├── chunker.test.ts
│       │       ├── filters.test.ts
│       │       └── normalize.test.ts
│       └── Dockerfile                 # Multi-stage Docker build (node:20-alpine)
│
├── packages/
│   └── shared/                        # Shared TypeScript Types + Utilities
│       └── src/
│           ├── types.ts               # All interfaces + type unions
│           ├── extract-action-items.ts # Claude action item extraction
│           ├── extract-decisions.ts    # Claude decision extraction
│           ├── normalize-assignee.ts   # Canonical name normalization
│           └── index.ts               # Re-exports
│
├── scripts/
│   ├── dev-reset.ts                   # Truncate all data tables (dev/testing reset)
│   ├── dev-import.ts                  # Import 1–N Loom transcripts for testing
│   ├── dev-status.ts                  # Quick DB state checker
│   ├── setup-oauth.mjs               # Google OAuth setup helper
│   ├── generate_manifest.mjs          # Loom transcript manifest generator
│   ├── loom_receiver.mjs             # Loom webhook receiver
│   ├── normalize-tags.ts             # Tag normalization utility
│   └── archive/                      # Archived bulk scripts (no longer used)
│       ├── backfill.ts
│       ├── backfill-action-items.mjs
│       └── import-loom-transcripts.mjs
│
├── supabase/
│   └── migrations/
│       ├── 001_create_tables.sql      # transcripts, transcript_chunks, processing_log, match_chunks()
│       ├── 002_action_items.sql       # action_items, activity_log
│       ├── 003_action_item_groups.sql # group_label column
│       ├── 005_action_items_dedup.sql # is_duplicate, duplicate_of columns
│       ├── 006_action_items_effort.sql # effort column
│       └── 007_decisions.sql          # decisions table, match_decisions()
│
├── loom_transcripts_chris_lutfiya/    # Imported Loom transcripts (40+ files)
│
├── turbo.json                         # Turborepo task config
├── package.json                       # Workspace root (npm workspaces)
├── tsconfig.base.json                 # Shared TypeScript config
├── .env.example                       # Environment variable template
└── .env                               # Environment variables (not committed)
```

---

## 4. Data Model (Database Schema)

The complete schema comprises **7 tables** and **2 PostgreSQL RPC functions** across 6 migration files.

### 4.1 `transcripts` — Full Meeting Records

```
transcripts
├── id (TEXT, PK)                 — Format: YYYY-MM-DD_meeting-title-slug
├── meeting_title (TEXT, NOT NULL) — Extracted from email subject
├── meeting_date (TIMESTAMPTZ, NOT NULL) — When the meeting occurred
├── participants (TEXT[])          — Speaker names parsed from transcript
├── raw_transcript (TEXT, NOT NULL) — Full cleaned transcript text
├── source_email_id (TEXT, UNIQUE NOT NULL) — Gmail message ID (dedup key)
├── extraction_method (TEXT)       — 'inline' | 'google_doc' | 'attachment' |
│                                    'upload' | 'pdf_upload' | 'paste' | 'loom_import'
├── word_count (INTEGER)           — Number of words in transcript
└── processed_at (TIMESTAMPTZ)     — Timestamp of processing
```

### 4.2 `transcript_chunks` — Embedded Chunks for RAG

```
transcript_chunks
├── id (TEXT, PK)                  — Format: {transcript_id}_chunk_{index}
├── transcript_id (TEXT, FK → transcripts, CASCADE)
├── meeting_title (TEXT)           — Denormalized from transcript
├── meeting_date (TIMESTAMPTZ)     — Denormalized from transcript
├── participants (TEXT[])          — Denormalized from transcript
├── chunk_index (INTEGER)          — Position in sequence
├── total_chunks (INTEGER)         — Total chunks for this transcript
├── text (TEXT, NOT NULL)          — Chunk content (~2000 chars / ~500 tokens)
├── embedding (VECTOR(1536))       — OpenAI text-embedding-3-small vector
├── token_estimate (INTEGER)       — Estimated tokens (length / 4)
└── created_at (TIMESTAMPTZ)
```

**Index:** IVFFlat on `embedding` (vector_cosine_ops, lists=100) for fast similarity search.

### 4.3 `action_items` — Tasks Extracted from Meetings

```
action_items
├── id (TEXT, PK, DEFAULT gen_random_uuid())
├── transcript_id (TEXT, FK → transcripts, SET NULL)
├── title (TEXT, NOT NULL)         — Action item title (< 100 chars)
├── description (TEXT)             — Fuller context
├── assigned_to (TEXT)             — 'Lutfiya Miller' | 'Chris Müller' | NULL
├── status (TEXT, DEFAULT 'open')  — 'open' | 'in_progress' | 'done' | 'dismissed'
├── priority (TEXT, DEFAULT 'medium') — 'low' | 'medium' | 'high' | 'urgent'
├── effort (TEXT)                  — 'quick_fix' | 'moderate' | 'significant' | NULL
├── due_date (DATE)                — Optional deadline
├── source_text (TEXT)             — Transcript excerpt that generated this item
├── created_by (TEXT, DEFAULT 'ai') — 'ai' (auto-extracted) | 'manual'
├── group_label (TEXT)             — AI-assigned project/topic grouping (1-3 words)
├── is_duplicate (BOOLEAN, DEFAULT FALSE) — Deduplication flag
├── duplicate_of (TEXT, FK → action_items) — ID of original if duplicate
├── created_at (TIMESTAMPTZ)
├── updated_at (TIMESTAMPTZ)
└── completed_at (TIMESTAMPTZ)     — When marked done
```

**Indexes:** On `status`, `assigned_to`, `transcript_id`, `group_label`, `is_duplicate` (partial), `effort` (partial).

### 4.4 `decisions` — Decision Ledger

```
decisions
├── id (TEXT, PK, DEFAULT gen_random_uuid())
├── transcript_id (TEXT, FK → transcripts, SET NULL)
├── decision_text (TEXT, NOT NULL)  — The decision itself (concise, 2 sentences max)
├── context (TEXT)                  — Surrounding discussion context + alternatives
├── domain (TEXT, DEFAULT 'general') — 'architecture' | 'product' | 'business' |
│                                      'design' | 'infrastructure' | 'operations' | 'general'
├── confidence (TEXT, DEFAULT 'high') — 'high' | 'medium' | 'low'
├── participants (TEXT[])           — Who was present when decided
├── decided_at (TIMESTAMPTZ)        — Meeting date when decided
├── source_text (TEXT)              — Exact transcript excerpt
├── embedding (VECTOR(1536))        — For semantic similarity search
├── superseded_by (TEXT, FK → decisions, self-referencing) — Decision chain
├── status (TEXT, DEFAULT 'active') — 'active' | 'superseded' | 'reversed' |
│                                      'under_review' | 'completed'
├── created_by (TEXT, DEFAULT 'ai') — 'ai' | 'manual'
├── created_at (TIMESTAMPTZ)
└── updated_at (TIMESTAMPTZ)
```

**Indexes:** On `transcript_id`, `domain`, `status`, `decided_at DESC`. IVFFlat on `embedding` (vector_cosine_ops, lists=50).

### 4.5 `activity_log` — Unified Event Stream

```
activity_log
├── id (TEXT, PK, DEFAULT gen_random_uuid())
├── event_type (TEXT, NOT NULL)     — 'action_item_created' | 'action_item_updated' |
│                                      'transcript_processed' | 'query_asked' |
│                                      'manual_note' | 'decision_created' |
│                                      'bulk_extraction_attempted'
├── entity_type (TEXT)              — 'action_item' | 'transcript' | 'query' | 'decision'
├── entity_id (TEXT)                — ID of related record
├── actor (TEXT)                    — 'system' | 'Lutfiya' | 'Chris'
├── summary (TEXT, NOT NULL)        — Human-readable event description
├── metadata (JSONB, DEFAULT '{}') — Flexible extra data
└── created_at (TIMESTAMPTZ)
```

**Indexes:** On `event_type`, `created_at DESC`.

### 4.6 `processing_log` — Ingestion Audit Trail

```
processing_log
├── id (TEXT, PK, DEFAULT gen_random_uuid())
├── source_email_id (TEXT, NOT NULL) — Gmail message ID
├── email_subject (TEXT, NOT NULL)   — Email subject line
├── status (TEXT, NOT NULL)          — 'success' | 'skipped' | 'error'
├── extraction_method (TEXT)         — Method used
├── error_message (TEXT)             — Error details if failed
├── source_sender (TEXT)             — Email sender address
└── processed_at (TIMESTAMPTZ)
```

### 4.7 `app_users` — Application Users (Optional)

```
app_users
├── id (INTEGER, PK)
├── username (TEXT)
├── password (TEXT)                  — bcrypt hash
├── role (TEXT)                      — 'admin' | 'member'
└── created_at (TIMESTAMPTZ)
```

### 4.8 PostgreSQL RPC Functions

**`match_chunks(query_embedding, match_count, match_threshold, filter_transcript_id)`**
- Semantic similarity search for transcript chunks
- Returns: id, transcript_id, meeting_title, meeting_date, text, similarity
- Algorithm: Cosine distance via `<=>` operator, filtered by threshold
- Default: 10 matches, 0.7 threshold (overridden to 0.3 in practice for broader recall)

**`match_decisions(query_embedding, match_count, match_threshold, filter_status)`**
- Semantic similarity search for decisions
- Returns: id, transcript_id, decision_text, context, domain, confidence, decided_at, source_text, status, similarity
- Default: 5 matches, 0.75 threshold (used at 0.78 in practice for precision)

---

## 5. Worker Service — Email Processing Pipeline

### 5.1 Express Server

The worker runs as a standalone Express server deployed on Google Cloud Run, listening for Pub/Sub push notifications from Gmail.

**Endpoints:**
- `GET /health` — Health check (returns `{status: 'ok', timestamp}`)
- `POST /pubsub` — Receives Pub/Sub push notifications

**Gmail Watch:**
- Registered on startup via `setupWatch()`
- Renewed every 6 days (expires after 7)
- Watches INBOX label only
- Returns 200 always to prevent Pub/Sub retries

### 5.2 Processing Pipeline (9 Steps)

```
1. Dedup Check        → Query `transcripts` by source_email_id
2. Extraction          → 3-method cascade: attachment → Google Doc → inline HTML
3. Normalization       → Title, date, participants, word count, slug ID
4. Transcript Storage  → Insert into `transcripts` table
5. Text Chunking       → Speaker-turn-aware splitting (~500 tokens per chunk)
6. Embedding Generation → OpenAI text-embedding-3-small (batch size 20, exponential backoff)
7. Chunk Storage       → Insert into `transcript_chunks` with embeddings
8. Activity Logging    → Insert into `processing_log` (success/error)
9. Action Item Extraction → Claude extracts tasks (fire-and-forget, non-blocking)
```

### 5.3 Transcript Extraction Formats

| Format | Detection | Processing |
|:---|:---|:---|
| **Attachment** | `.txt`, `.vtt`, `.sbv` with AttachmentId | Download via Gmail API, parse format |
| **Google Doc** | Link to `/document/d/ID/` in email body | Export as text/plain via Drive API |
| **Inline HTML** | HTML content in email body | Strip tags with Cheerio, preserve speakers |

**Priority order:** Attachment → Google Doc → Inline HTML (first successful extraction wins).

**Supported transcript senders:**
- `gemini-notes@google.com`
- `meetings-noreply@google.com`

**Subject patterns:** "Notes from", "Transcript for", "Meeting notes:", "Post-call notes:", etc.

### 5.4 Text Chunking Algorithm

4-step priority splitting:
1. **Speaker turns** — Split on `^SpeakerName: text` pattern
2. **Paragraphs** — Split speaker turns > 2000 chars by `\n\n`
3. **Sentences** — Split paragraphs > 2000 chars at sentence boundaries
4. **Merge** — Combine small segments into ~2000 char chunks with 400-char overlap for semantic continuity

Returns: `TextChunk[]` with `text`, `index`, `totalChunks`, `tokenEstimate`.

### 5.5 Embedding Generation

- Model: OpenAI `text-embedding-3-small` (1536 dimensions)
- Batch size: 20 texts per API call
- Retry: Exponential backoff (1s, 2s, 4s, 8s, 16s) on 429 or 5xx errors
- Max attempts: 5 per batch

### 5.6 VTT/SBV Parsers

**VTT Parser:**
- Strips WEBVTT header, blank lines, NOTE blocks
- Skips timecode lines (`HH:MM:SS.mmm --> HH:MM:SS.mmm`)
- Extracts speaker from `<v SpeakerName>Text</v>` tags
- Returns formatted `Speaker: text` lines

**SBV Parser:**
- Strips timecode lines (`H:MM:SS.mmm,H:MM:SS.mmm` format)
- Keeps remaining text lines

---

## 6. Shared Package (`packages/shared`)

### 6.1 Type Definitions

**Core Types:**
- `MeetingTranscript` — Full normalized transcript record
- `TranscriptChunk` — Embedded chunk with metadata
- `ProcessingLogEntry` — Processing log record
- `ExtractionMethod` — `'inline' | 'google_doc' | 'attachment' | 'upload' | 'pdf_upload' | 'paste' | 'loom_import'`
- `LogStatus` — `'success' | 'skipped' | 'error'`

**Action Item Types:**
- `ActionItem` — Complete record with all fields
- `ActionItemStatus` — `'open' | 'in_progress' | 'done' | 'dismissed'`
- `ActionItemPriority` — `'low' | 'medium' | 'high' | 'urgent'`
- `ActionItemEffort` — `'quick_fix' | 'moderate' | 'significant'`
- `ActionItemCreatedBy` — `'ai' | 'manual'`

**Decision Types:**
- `Decision` — Complete record with all fields
- `RawExtractedDecision` — Pre-normalized decision from Claude
- `DecisionDomain` — `'architecture' | 'product' | 'business' | 'design' | 'infrastructure' | 'operations' | 'general'`
- `DecisionConfidence` — `'high' | 'medium' | 'low'`
- `DecisionStatus` — `'active' | 'superseded' | 'reversed' | 'under_review' | 'completed'`

**Analytics Types:**
- `DayMeetingSummary` — Daily aggregated stats (meetings, word_count, participants)
- `ScoreboardMetrics` — Monthly metrics (total meetings, hours, action items, completion rate, cadence, co-founder breakdown, action item velocity)
- `CumulativeStats` — All-time statistics (total meetings, hours, monthly averages, co-founder breakdown)

**Query Types:**
- `QueryRequest` — `{question: string, transcript_id?: string}`
- `QueryResponse` — `{answer: string, sources: SourceChunk[]}`
- `SourceChunk` — Source citation with similarity score

### 6.2 Shared Functions

**`normalizeAssignee(raw: string | null): string[]`**
- Converts raw assignment text to canonical names
- Handles "both" → `['Lutfiya Miller', 'Chris Müller']`
- Handles all name variants (Chris-Steven Müller, Chris Muller, Chris Mueller) → `'Chris Müller'`
- Unknown names passed through unchanged

**Canonical Names:**
```typescript
CANONICAL_NAMES = {
  LUTFIYA: 'Lutfiya Miller',
  CHRIS: 'Chris Müller'
}
```

**`extractActionItemsFromTranscript(transcript, anthropicKey): RawExtractedItem[]`**
- Calls Claude Sonnet 4 with structured extraction prompt
- Returns JSON array of extracted action items
- Prompt specifies: title, description, assigned_to, priority, due_date, source_text, group_label, effort

**`buildInsertionRows(extracted, transcriptId, overrides?): Record<string, unknown>[]`**
- Normalizes assignees and splits joint assignments into separate rows
- Prepares rows for database insertion
- Applies optional overrides (is_duplicate, duplicate_of)

**`extractDecisionsFromTranscript(transcript, anthropicKey): RawExtractedDecision[]`**
- Calls Claude to extract decisions (not tasks or opinions)
- Looks for explicit agreement language ("decided", "agreed", "confirmed")
- Returns JSON with decision_text, context, domain, confidence, source_text

**`buildDecisionInsertionRows(extracted, transcript, overrides?): Record<string, unknown>[]`**
- Normalizes extracted decisions for database insertion
- Validates domain and confidence enums
- Attaches transcript metadata (date, participants)

---

## 7. Authentication & Authorization

### 7.1 Auth System

- **Method:** Custom JWT implementation using the JOSE library
- **Session Storage:** HTTP-only secure cookies
- **Session Expiry:** 7 days
- **Access Token Expiry:** 365 days (for community sharing/bypass)
- **Password Hashing:** bcryptjs

### 7.2 Session Payload

```typescript
{
  userId: number,
  username: string,
  role: "admin" | "member"
}
```

### 7.3 User Sources (Two-Tier Lookup)

1. **Environment variables** — `ADMIN_USERNAME`/`ADMIN_PASSWORD` + `USERS` JSON array
2. **Database** — `app_users` table in Supabase

`findUserAnywhere()` checks env vars first, then database.

### 7.4 Middleware

- All routes require authentication except: `/login`, `/api/auth/*`, static assets
- Supports URL `?access_token=` parameter for token-based bypass
- Redirects unauthenticated users to `/login`

---

## 8. Feature Catalog

### 8.1 Dashboard Home

The main dashboard provides an at-a-glance view of the entire system:
- **Query bar** with AI search (routes to Ask AI)
- **Stat cards** — Total transcripts, this week, this month, with colored accent bars
- **Calendar widget** — Monthly at-a-glance with meeting indicators
- **Open action items summary** — Count by assignee, overdue items highlighted
- **Top participants list** — Most frequent meeting participants
- **Recent transcripts** — Collapsible list with dates and word counts
- **Activity feed** — Latest system events

### 8.2 Transcript Library

- **Sortable table** — By title, date, word count
- **Search** — By title and content
- **Sync inbox** button — Triggers Gmail inbox scan for new transcripts
- **Extract all** button — Batch AI extraction across all unprocessed transcripts
- **Bulk extraction** result banner with success/failure counts
- **Two-click delete** confirmation
- **"New" indicator** for recently synced transcripts
- **AI-extracted count** badge per transcript

### 8.3 Transcript Detail View (`transcripts/[id]`)

- **Full transcript text** — Rendered with speaker labels preserved
- **Metadata sidebar** — Meeting title, date, participants, word count, extraction method
- **Action items section** — Items extracted from this specific transcript
- **Re-extraction button** — Trigger Claude to re-extract action items
- **Manual add** — Create action items manually linked to this transcript
- **Delete transcript** — With confirmation

### 8.4 Action Items (Kanban Board)

- **Kanban columns** — Open vs Done (grouped layout)
- **Assignee filter** — Lutfiya, Chris, All, Unassigned
- **Priority filter** — Urgent, High, Medium, Low
- **Source filter** — AI-extracted vs Manual
- **Effort filter** — Quick fix, Moderate, Significant
- **Search** — By title text
- **Grouped view** — Items organized by AI-assigned group_label
- **Flat view** toggle — All items in single list
- **Smart grouping** — AI-powered topic clustering (POST `/api/action-items/group`)
- **Bulk effort estimation** — AI analyzes items and suggests effort levels
- **Inline status updates** — Click to toggle status
- **Duplicate hiding** — Deduplicated items hidden by default
- **Create new item** modal — Manual creation with all fields
- **Source transcript link** — Click to view originating meeting

### 8.5 Decision Ledger

- **Domain filter** — Architecture, Product, Business, Design, Infrastructure, Operations, General
- **Status filter** — Active, Completed, Superseded, Reversed, Under Review
- **Confidence filter** — High, Medium, Low
- **Search** — By decision text
- **Sort** — By decided_at or created_at
- **Create new decision** modal — Manual creation with domain, confidence, context
- **Expandable details** — Full context, source text, linked transcript
- **Bulk extraction** from all unprocessed transcripts
- **Extraction progress tracking** with live status updates
- **Status badges** — Superseded decisions show strikethrough styling
- **Supersession chains** — Decisions can reference what they supersede

### 8.6 Ask AI (RAG Chat)

- **Chat-style interface** — User/assistant message bubbles
- **Suggested questions** — Quickstart prompts for new users
- **Multi-source RAG:**
  1. Embed question via OpenAI
  2. Match transcript chunks (cosine similarity > 0.3, top 10)
  3. Match active decisions (cosine similarity > 0.78, top 3)
  4. Fallback: fetch raw transcript if scoped and no chunk matches
  5. Build context from chunks + decisions
  6. Claude Sonnet 4 generates answer with citations
- **Source citations** — Expandable cards with meeting title, date, and excerpt
- **Decision awareness** — Related decisions are prominently highlighted in answers to prevent re-debating
- **Transcript scoping** — Optional `transcript_id` to limit search to a single meeting
- **Auto-scroll** to latest message
- **Links to source transcripts** from citations

### 8.7 Calendar & Scoreboard

- **Month navigation** — Forward/backward by month
- **Heatmap grid** — Color intensity by daily meeting count
- **Selected day details** — Click a day to see its meetings
- **Scoreboard header** (monthly stats cards):
  - Total meetings, total hours, total action items, completed items
  - Action item completion rate
  - Topics discussed count
  - Average meetings per week
  - Busiest day
  - Streak days (consecutive meeting days)
- **Co-founder breakdown:**
  - Meetings together, Lutfiya solo, Chris solo, with external guests
  - Action items created vs completed
  - Free days (no meetings)
- **All-time cumulative panel:**
  - Total meetings, total hours, total action items, total words
  - Unique participants
  - First and last meeting dates
  - Total months active
  - Average meetings per month
- **Cadence label** — Auto-detected (daily, weekly, bi-weekly, etc.)
- **Timezone awareness**

### 8.8 Activity Feed

- **Unified event stream** — All system actions in one timeline
- **Event types with descriptions:**
  - `action_item_created` — "AI extracted 4 action items from [Meeting Title]"
  - `action_item_updated` — "Chris marked 'Send proposal' as done"
  - `transcript_processed` — "New transcript: Chris/Lutfiya Mar 2, 2026"
  - `query_asked` — "Asked: 'What were the key decisions?'"
  - `decision_created` — "Decision extracted: Use Supabase Auth"
  - `bulk_extraction_attempted` — "Bulk extraction: 12 transcripts processed"
- **Pagination** — Limit and offset support
- **Filtering** — By event_type

### 8.9 Processing Log

- **Table view** — Email subject, timestamp, status, extraction method, errors
- **Status badges** — Success (green), Skipped (amber), Error (red)
- **Error messages** — Expandable details for failed ingestions
- **Full audit trail** — Every email the worker attempted to process

### 8.10 Upload (Manual Ingestion)

- **File upload** — Supports `.txt`, `.vtt`, `.sbv`, `.pdf` (max 10 MB)
- **Paste text** — Direct text entry with optional title and date
- **PDF extraction** — Uses pdf-parse library
- **Auto-detection:**
  - Meeting date from text content (regex patterns)
  - Meeting date from filename (YYYY-MM-DD, etc.)
  - Title from filename
- **Post-upload:** Automatic chunking, embedding, and action item extraction

### 8.11 Loom Import

- **Batch import** — `scripts/archive/import-loom-transcripts.mjs` (archived; use `scripts/dev-import.ts` for dev imports)
- **Manifest generation** — `scripts/generate_manifest.mjs` creates a manifest of available Loom files
- **Webhook receiver** — `scripts/loom_receiver.mjs` for real-time Loom transcript capture
- **40+ imported transcripts** in `loom_transcripts_chris_lutfiya/` directory

---

## 9. API Routes — Complete Reference

### 9.1 Authentication

| Route | Method | Purpose |
|:---|:---|:---|
| `/api/auth/login` | POST | Authenticate with username + password, set session cookie |
| `/api/auth/logout` | POST | Clear session cookie, redirect to login |
| `/api/auth/token-login` | POST | Verify access token, create session |
| `/api/auth/generate-token` | POST | Generate long-lived bypass token (admin only) |

### 9.2 Transcripts

| Route | Method | Purpose |
|:---|:---|:---|
| `/api/transcripts` | GET | List all transcripts (newest first, limit 100, includes ai_extracted_count) |
| `/api/transcripts/[id]` | GET | Get single transcript by ID |
| `/api/transcripts/[id]` | DELETE | Hard delete transcript + cascading related data |
| `/api/transcripts/[id]/summarize` | POST | Generate Claude summary of transcript |

### 9.3 Action Items

| Route | Method | Purpose |
|:---|:---|:---|
| `/api/action-items` | GET | List with filters: status, assigned_to, transcript_id, priority, effort, sort, order |
| `/api/action-items` | POST | Create item (normalizes assignees, may produce 1-2 items for joint assignment) |
| `/api/action-items/[id]` | GET | Get single action item |
| `/api/action-items/[id]` | PATCH | Update action item fields |
| `/api/action-items/[id]` | DELETE | Soft-delete (set status to 'dismissed') |
| `/api/action-items/extract` | POST | Extract action items from specific transcript via Claude |
| `/api/action-items/extract-all` | POST | Batch extract from all unprocessed transcripts |
| `/api/action-items/group` | POST | AI-powered smart grouping of ungrouped items |
| `/api/action-items/estimate-effort` | POST | Batch effort estimation via Claude |

### 9.4 Decisions

| Route | Method | Purpose |
|:---|:---|:---|
| `/api/decisions` | GET | List with filters: domain, status, confidence, search, sort, order, limit (max 500) |
| `/api/decisions` | POST | Create decision (generates embedding via OpenAI) |
| `/api/decisions/[id]` | GET | Get single decision |
| `/api/decisions/[id]` | PATCH | Update decision fields |
| `/api/decisions/extract` | POST | Extract decisions from specific transcript via Claude |
| `/api/decisions/extract-all` | POST | Batch extract from all unprocessed transcripts |

### 9.5 Query / Search

| Route | Method | Purpose |
|:---|:---|:---|
| `/api/query` | POST | RAG search: embed question → match chunks + decisions → Claude answer with citations |

### 9.6 Calendar / Analytics

| Route | Method | Purpose |
|:---|:---|:---|
| `/api/calendar` | GET | Monthly + all-time stats: per-day breakdown, scoreboard metrics, cumulative stats |

### 9.7 Activity & Logs

| Route | Method | Purpose |
|:---|:---|:---|
| `/api/activity` | GET | Activity log feed with pagination and event_type filtering |
| `/api/logs` | GET | Processing log (100 newest ingestion attempts) |

### 9.8 Upload & Sync

| Route | Method | Purpose |
|:---|:---|:---|
| `/api/upload` | POST (JSON) | Process pasted transcript text |
| `/api/upload` | POST (FormData) | Process uploaded file (.txt, .vtt, .sbv, .pdf) |
| `/api/sync` | POST | Sync unprocessed emails from Gmail inbox |

### 9.9 Import

| Route | Method | Purpose |
|:---|:---|:---|
| `/api/import-loom` | POST | Import Loom transcript from uploaded file or URL |

### 9.10 Admin

| Route | Method | Purpose |
|:---|:---|:---|
| `/api/admin/setup` | POST | One-time setup (create initial admin user) |
| `/api/admin/users` | GET/POST | List users / create new user (admin only) |

---

## 10. AI Models & Prompts

### 10.1 Models Used

| Model | Purpose | Parameters |
|:---|:---|:---|
| OpenAI `text-embedding-3-small` | Vector embeddings for chunks + decisions | 1536 dimensions |
| Anthropic Claude Sonnet 4 (`claude-sonnet-4-20250514`) | Action item extraction | Structured JSON output |
| Anthropic Claude Sonnet 4 | Decision extraction | Structured JSON output |
| Anthropic Claude Sonnet 4 | RAG answers | Grounded in chunk + decision context |
| Anthropic Claude Sonnet 4 | Smart grouping | Cluster action items by topic |
| Anthropic Claude Sonnet 4 | Effort estimation | Classify effort per item |
| Anthropic Claude Sonnet 4 | Transcript summarization | Free-form summary |

### 10.2 Action Item Extraction Prompt

Claude is instructed to:
- Extract only clearly implied items (no fabrication)
- Return JSON with: `title`, `description`, `assigned_to`, `priority`, `due_date`, `source_text`, `group_label`, `effort`
- Split joint assignments ("both") into separate rows
- Classify effort: `quick_fix` (<30min), `moderate` (30min–few hours), `significant` (multi-hour/multi-day)
- Group items by topic/project with `group_label` (1-3 words)
- Use exact canonical names only: `Lutfiya Miller`, `Chris Müller`

### 10.3 Decision Extraction Prompt

Claude is instructed to:
- Extract only DECISIONS (not tasks, opinions, or preferences)
- Look for explicit agreement language ("decided", "agreed", "confirmed", "going with")
- Return JSON with: `decision_text`, `context`, `domain`, `confidence`, `source_text`
- Classify domain: architecture, product, business, design, infrastructure, operations, general
- Classify confidence: high (explicit agreement), medium (implied consensus), low (tentative)
- Remove restatements of previous decisions in same transcript
- Write decisions as standalone statements (not "We decided to...")
- Include 2-4 sentence source context with alternatives considered

### 10.4 RAG System Prompt

The Ask AI system:
1. Embeds the user's question via OpenAI
2. Performs dual similarity search: transcript chunks (threshold 0.3) + decisions (threshold 0.78)
3. Assembles context with source attributions
4. Calls Claude with: system prompt + retrieved context + user question
5. Returns answer with inline source citations
6. Decisions are highlighted prominently to prevent re-debating settled topics

---

## 11. Design System

### 11.1 Visual Identity

- **Design Language:** Clean, flat cards with subtle borders — originally glassmorphism, evolved to a minimal flat style
- **Primary Accent:** Red/coral `#D94A4A` (ScienceExperts.ai brand)
- **Typography:** Inter (sans-serif, 300-700 weights) + JetBrains Mono (monospace, 400-500)
- **Dark Mode:** Fully implemented via Tailwind `class` strategy + CSS custom properties

### 11.2 Color System

**Light Theme:**
- Background: `#f8f9fa` | Foreground: `#1f2937`
- Card: `#ffffff` | Card border: `#e5e7eb`
- Muted: `#f3f4f6` | Secondary text: `#6b7280`

**Dark Theme:**
- Background: `#121212` | Foreground: `#e5e5e5`
- Card: `#2a2a2a` | Card border: `#323232`
- Muted: `#202020` | Secondary text: `#a3a3a3`

**Accent Colors:**
- Brand red/coral: `#D94A4A` (primary CTA, stat card accent bars)
- Teal: `#06b6d4` | Violet: `#8b5cf6` | Amber: `#f59e0b`
- Rose: `#ef4444` | Emerald: `#22c55e` | Blue: `#3b82f6`

### 11.3 Component Patterns

- **Cards:** `.glass-card` — Solid background, 1px border, 12px radius, subtle shadow, hover elevation
- **Stat Cards:** `.stat-card` — Glass card with 3px red accent bar at top
- **Buttons:** `.btn-primary` — Red/coral pill-shaped (`rounded-full`), white text
- **Navigation:** `.nav-pill` / `.nav-pill-active` — Rounded pill tabs
- **Inputs:** `.input-glow` — Clean border, brand focus ring
- **Badges:** `.badge-success` / `.badge-error` / `.badge-warning` / `.badge-info` — Semantic colored badges with ring
- **Table Rows:** `.table-row` — Subtle border, hover background change
- **Scrollbar:** `.custom-scrollbar` — Thin 6px thumb, transparent track

### 11.4 Animations

- `fade-in` — 0.5s ease-out opacity transition
- `slide-up` — 0.3s ease-out translate + opacity
- `pulse-slow` — 3s infinite pulse

---

## 12. Infrastructure & Deployment

### 12.1 Supabase

- **Database:** PostgreSQL with pgvector extension enabled
- **Vector Indexes:** IVFFlat for cosine similarity search (100 lists for chunks, 50 for decisions)
- **RPC Functions:** `match_chunks()` and `match_decisions()` for server-side similarity search
- **Client:** Service-role key (bypasses RLS) for worker; anon key for browser

### 12.2 Google Cloud

- **Worker deployment:** Cloud Run (Docker container, node:20-alpine)
- **Gmail integration:** Cloud Pub/Sub push subscription → worker's `/pubsub` endpoint
- **APIs enabled:** Gmail API, Google Docs API, Google Drive API, Cloud Pub/Sub
- **OAuth:** Long-lived refresh token for Gmail/Docs/Drive access

### 12.3 Vercel (Frontend)

- **Deployment:** Standard Next.js serverless deployment
- **Environment variables:** Injected at build/runtime
- **Edge:** None currently (no edge middleware beyond auth)

### 12.4 Docker (Worker)

```dockerfile
# Multi-stage build
FROM node:20-alpine AS builder
# Install deps, build shared package, build worker
FROM node:20-alpine AS runner
# Production deps only, copy built artifacts
EXPOSE 8080
CMD ["node", "apps/worker/dist/index.js"]
```

---

## 13. Key Architectural Decisions

1. **Monorepo (Turborepo)** — Shared types in single source of truth, faster incremental builds, consistent tooling
2. **Two-tier architecture** — Worker for async email processing, Web app for sync UI; decoupled for independent scaling
3. **Supabase with pgvector** — PostgreSQL reliability with native vector search, no external vector DB needed
4. **Pub/Sub for Gmail** — Reliable push notifications, eventual consistency, no polling overhead
5. **Embedding-based RAG** — Semantic search over chunks + decisions for context-aware answers, not just keyword matching
6. **Decisions as first-class entities** — Separate from action items, with their own embeddings, search, and supersession chains
7. **Canonical name normalization** — All name variants resolved to exact canonical forms at every entry point
8. **Activity logging** — Unified audit trail for all system actions (distinct from processing log which is ingestion-specific)
9. **Deduplication at multiple levels** — Email dedup (source_email_id), semantic dedup for bulk extraction (is_duplicate flag)
10. **Fire-and-forget extraction** — Action item extraction runs asynchronously post-upload, never blocks the main pipeline

---

## 14. Performance Characteristics

| Parameter | Value | Rationale |
|:---|:---|:---|
| Chunk size | ~2000 chars (~500 tokens) | Balances semantic coherence with retrieval granularity |
| Chunk overlap | 400 chars | Ensures context continuity across chunk boundaries |
| Embedding batch size | 20 texts | OpenAI rate limit optimization |
| Embedding retry | Exponential backoff (1–16s, 5 attempts) | Rate limit resilience |
| Chunk match threshold | 0.3 | Broader recall for transcript search |
| Decision match threshold | 0.78 | Higher precision for decision relevance |
| Chunk match count | 10 | Top 10 most relevant chunks per query |
| Decision match count | 3 | Top 3 most relevant decisions per query |
| Session expiry | 7 days | Cookie-based JWT sessions |
| Access token expiry | 365 days | Long-lived sharing tokens |
| IVFFlat lists (chunks) | 100 | Optimized for larger chunk datasets |
| IVFFlat lists (decisions) | 50 | Optimized for smaller decision datasets |
| Upload file size limit | 10 MB | Practical limit for transcript files |

---

## 15. Environment Variables

```env
# ── Google OAuth & Gmail ──
GOOGLE_CLIENT_ID=              # Google Cloud OAuth client ID
GOOGLE_CLIENT_SECRET=          # OAuth client secret
GOOGLE_REFRESH_TOKEN=          # Long-lived refresh token for Gmail/Docs/Drive
GMAIL_PUBSUB_TOPIC=            # projects/YOUR_PROJECT/topics/gmail-notifications
GMAIL_USER_EMAIL=              # Gmail address to monitor (e.g., solutions@3rdaillc.com)

# ── Supabase ──
NEXT_PUBLIC_SUPABASE_URL=      # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY= # Public anon key (RLS-gated)
SUPABASE_SERVICE_ROLE_KEY=     # Service-role key (bypasses RLS, used by worker)

# ── OpenAI ──
OPENAI_API_KEY=                # For text-embedding-3-small embeddings

# ── Anthropic ──
ANTHROPIC_API_KEY=             # For Claude Sonnet 4 (extraction + RAG)

# ── App ──
NEXT_PUBLIC_APP_URL=           # http://localhost:3000 (or production URL)
WORKER_PORT=                   # 3001 (default)

# ── Auth (Web app only) ──
AUTH_SECRET=                   # Random 32-char secret for JWT signing
ACCESS_TOKEN_SECRET=           # Random 32-char secret for access tokens
ADMIN_USERNAME=                # Initial admin username
ADMIN_PASSWORD=                # Initial admin password
USERS=                         # JSON array of additional users:
                               # [{"username":"user1","password":"pw","role":"member"}]
```

---

## 16. Scripts & Utilities

| Script | Purpose |
|:---|:---|
| `scripts/dev-reset.ts` | Truncate all data tables for a clean dev/testing environment |
| `scripts/dev-import.ts` | Import 1–N Loom transcripts for testing |
| `scripts/dev-status.ts` | Quick DB state checker (row counts, last import) |
| `scripts/setup-oauth.mjs` | Interactive Google OAuth setup helper |
| `scripts/generate_manifest.mjs` | Generate manifest JSON from Loom transcript directory |
| `scripts/loom_receiver.mjs` | Webhook receiver for real-time Loom transcript capture |
| `scripts/normalize-tags.ts` | Tag normalization utility |
| `scripts/archive/backfill.ts` | *(Archived)* Backfill embeddings for transcripts missing chunks |
| `scripts/archive/backfill-action-items.mjs` | *(Archived)* Backfill action items from all existing transcripts |
| `scripts/archive/import-loom-transcripts.mjs` | *(Archived)* Batch import Loom transcripts into MeetScript |

---

## 17. Testing

- **Framework:** Vitest (worker tests)
- **Test suites:**
  - `extraction.test.ts` — Transcript extraction from different formats
  - `chunker.test.ts` — Text chunking algorithm
  - `filters.test.ts` — Gmail email filter detection
  - `normalize.test.ts` — Title, participant, date extraction

**Run tests:**
```bash
npm run test --workspace=apps/worker
# or
cd apps/worker && npx vitest run
```

---

## 18. Current State & Roadmap

### What's Fully Built & Working

- Automatic Gmail transcript ingestion (3 formats + Pub/Sub)
- Manual upload (file + paste + PDF + Loom import)
- Vector embeddings + pgvector semantic search
- RAG-powered Ask AI with Claude Sonnet 4 + citation sources
- Decision-aware RAG (surfaces past decisions before they're re-debated)
- AI action item extraction (per-transcript + batch)
- AI decision extraction (per-transcript + batch)
- Smart grouping + effort estimation
- Kanban board with full filtering
- Decision Ledger with domain/status/confidence filtering
- Calendar heatmap + scoreboard analytics
- Activity feed + processing log
- Dark/light mode theming

### Partially Built / Planned

- Action-aware RAG (include action items in query context)
- Weekly email digests (Resend API integration)
- Overdue item notifications
- ScienceExperts.ai brand reskin
- Commercial features (multi-team, onboarding, sharing)

---

## 19. Summary for AI Context

> **MeetScript** is a meeting intelligence pipeline built with a Turborepo monorepo (Next.js 14 + Express worker) featuring:
>
> - **Full-Stack TypeScript** — React 18 frontend, Next.js App Router API routes, Express worker, shared types package
> - **7 Database Tables** — transcripts, transcript_chunks (vector), action_items, decisions (vector), activity_log, processing_log, app_users
> - **2 PostgreSQL RPC Functions** — match_chunks() and match_decisions() for cosine similarity search
> - **Automatic Gmail Ingestion** — Pub/Sub push notifications, 3 extraction formats (inline HTML, Google Docs, attachments), deduplication
> - **7 Manual Ingestion Methods** — inline, google_doc, attachment, upload, pdf_upload, paste, loom_import
> - **RAG-Powered AI Search** — OpenAI embeddings (1536-dim) + Claude Sonnet 4, dual-source retrieval (chunks + decisions), inline citations
> - **Decision Ledger** — Auto-extracted decisions with embeddings, domain classification, confidence scoring, supersession chains, decision-aware RAG
> - **AI Action Item Extraction** — Claude extracts tasks with assignee detection, priority inference, effort estimation, smart topic grouping, deduplication
> - **Kanban Board** — Action items organized by group/project with filters for assignee, priority, effort, status
> - **Calendar + Scoreboard** — Heatmap visualization, monthly/all-time stats, co-founder breakdown, cadence detection
> - **Activity Feed** — Unified event stream for all system actions
> - **Cloud Run Worker** — Dockerized Express service for async email processing with exponential backoff retry
> - **Vercel Frontend** — Next.js deployment with JWT auth, dark/light mode, glassmorphism-inspired flat design system
> - **40+ Loom Transcripts** — Imported from co-founder collaboration sessions
