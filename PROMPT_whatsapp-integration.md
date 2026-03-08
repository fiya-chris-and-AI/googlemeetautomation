# Optimized Prompt: WhatsApp Chat Integration into Google Meet Transcript Dashboard

> **Target Model:** Claude 4.6 Opus (via Cowork / Claude Code)
> **Generated:** 2026-03-08
> **Author:** Claude (Prompt Engineering Agent)

---

## How to Use This Prompt

Copy everything inside the `---PROMPT START---` / `---PROMPT END---` fences below and paste it as your instruction to Claude 4.6 Opus in a new session with the `googlemeetautomation` folder mounted. The prompt is self-contained and references your exact codebase architecture.

---

## Important Context for the Human

Before executing, be aware of these WhatsApp Cloud API realities discovered during research:

1. **No historical message retrieval** — The Meta Cloud API has no endpoint to pull past chat history. You can only capture messages **from the moment webhooks are configured forward**. To seed older conversations, you would need to use WhatsApp's in-app "Export Chat" feature (.txt files) and ingest those via a manual upload flow.

2. **Group chat support is available** — Meta's Groups API supports group creation, member management, and receiving group messages via webhooks. The 24-hour session window refreshes when any group member sends a message.

3. **On-Premises API is deprecated** — As of October 2025, only the Cloud API (hosted by Meta) is supported. Graph API v21.0 is current stable.

4. **Pricing** — Since July 2025, Meta charges per delivered template message (no more flat 24-hour conversation fees). Incoming webhook messages are free to receive.

5. **AI compliance** — Meta requires bots to perform "concrete business tasks" (not open-ended chat). Your use case (capturing action items/decisions) qualifies.

---

```
---PROMPT START---
```

## System Context

You are a senior full-stack TypeScript engineer. You are building a WhatsApp integration module for an existing **Google Meet Transcript Automation** platform. The platform is a Turborepo monorepo with:

- **`apps/web`** — Next.js 14 (App Router) frontend + API routes, Tailwind CSS, Supabase client
- **`apps/worker`** — Express.js backend that currently handles Gmail Pub/Sub webhooks for transcript ingestion
- **`packages/shared`** — Shared TypeScript types, Gemini AI extraction prompts, OpenAI embedding utilities

### Current Data Flow (Gmail → Transcripts)
```
Gmail Pub/Sub notification → POST /pubsub on worker
  → Gmail API history.list() → filter transcript emails
  → extract text (attachment/google-doc/inline cascade)
  → normalize (title, participants, date, slug ID)
  → store in `transcripts` table
  → chunk (~500 tokens) → OpenAI embeddings (text-embedding-3-small, 1536d)
  → store chunks in `transcript_chunks` with pgvector
  → log to `processing_log`
```

### Current Database Schema (Supabase PostgreSQL + pgvector)

**Core tables:**
- `transcripts` — id (YYYY-MM-DD_slug), meeting_title, meeting_date, participants[], raw_transcript, source_email_id, extraction_method, word_count
- `transcript_chunks` — id, transcript_id (FK), chunk_index, text, embedding(1536), token_estimate
- `action_items` — id, transcript_id (FK, nullable), title, description, assigned_to, status (open/in_progress/done/dismissed/archived), priority, effort, due_date, source_text, created_by (ai/manual), group_label, is_duplicate, is_locked
- `decisions` — id, transcript_id (FK, nullable), decision_text, context, domain, confidence, participants[], status (active/superseded/reversed/under_review/completed/archived), is_locked
- `processing_log` — id, source_email_id, email_subject, status, extraction_method, error_message
- `activity_log` — id, event_type, entity_type, entity_id, actor, summary, metadata (JSONB)

**Key RPC functions:** `match_chunks()` (vector cosine search), `match_decisions()` (semantic decision search), `archive_expired_items()` (24h TTL auto-archival)

**Known participants:** "Lutfiya Miller", "Chris Müller" (assignee normalization exists in `packages/shared`)

### AI Pipeline
- **Gemini API** (REST) — structured JSON extraction of action items and decisions from transcript text
- **OpenAI API** — text-embedding-3-small for RAG embeddings
- **RAG query** — embed question → match_chunks() → match_decisions() → Gemini generates answer with citations

---

## Your Task

Design and implement a **WhatsApp Chat Integration** that treats WhatsApp group conversations as a parallel source of communication alongside Google Meet transcripts. The goal is to capture developer discussions from WhatsApp and extract action items, decisions, and searchable context — exactly like we do with meeting transcripts today.

### Requirements

#### 1. WhatsApp Webhook Receiver (apps/worker)

Create a new webhook module at `apps/worker/src/whatsapp/` that:

- **Implements Meta Cloud API webhook verification** (GET endpoint with hub.mode, hub.verify_token, hub.challenge)
- **Receives incoming messages** via POST webhook (text messages, media captions, reactions, replies)
- **Handles group messages** — extract group name, sender name, message text, timestamp, quoted/reply context
- **Buffers messages into conversation windows** — aggregate messages from the same WhatsApp group into logical "conversation sessions" using a configurable idle timeout (default: 2 hours of no messages = new session). This is critical because WhatsApp messages arrive one at a time, unlike transcripts which arrive as complete documents.
- **Validates webhook signatures** using the app secret (X-Hub-Signature-256 header)
- **Is idempotent** — deduplicates by WhatsApp message ID (wamid)

Create a new Express route: `POST /whatsapp/webhook` and `GET /whatsapp/webhook`

#### 2. New Database Tables

Design and provide Supabase migration SQL for:

**`whatsapp_messages`** — raw message storage
- id (TEXT PK) — the wamid from WhatsApp
- group_id (TEXT) — WhatsApp group JID
- group_name (TEXT)
- sender_phone (TEXT)
- sender_name (TEXT) — WhatsApp profile name
- message_type (TEXT) — text/image/document/reaction/reply
- message_text (TEXT, nullable)
- quoted_message_id (TEXT, nullable) — for reply threading
- media_caption (TEXT, nullable)
- timestamp (TIMESTAMPTZ)
- raw_payload (JSONB) — full webhook payload for debugging
- session_id (TEXT, nullable) — links to whatsapp_sessions
- processed (BOOLEAN DEFAULT false)
- created_at (TIMESTAMPTZ DEFAULT now())

**`whatsapp_sessions`** — aggregated conversation windows
- id (TEXT PK) — YYYY-MM-DD_group-slug_session-N
- group_id (TEXT)
- group_name (TEXT)
- participants (TEXT[]) — unique senders in this session
- session_start (TIMESTAMPTZ)
- session_end (TIMESTAMPTZ)
- message_count (INTEGER)
- compiled_transcript (TEXT) — formatted conversation text (like a meeting transcript)
- word_count (INTEGER)
- source_type (TEXT DEFAULT 'whatsapp')
- processed_at (TIMESTAMPTZ, nullable) — when AI extraction ran
- created_at (TIMESTAMPTZ DEFAULT now())

#### 3. Session Compiler (apps/worker)

Build a session compilation pipeline at `apps/worker/src/whatsapp/session-compiler.ts`:

- **Triggered periodically** (e.g., every 30 minutes via cron or on idle-timeout detection)
- **Groups buffered messages** into sessions by group + idle timeout
- **Compiles messages into transcript format:**
  ```
  WhatsApp Group: [Group Name]
  Date: [Session Date]
  Participants: [Sender1, Sender2, ...]

  [HH:MM] Sender Name: message text
  [HH:MM] Sender Name: message text
    ↳ (replying to Sender2): quoted context
  [HH:MM] Sender Name: message text
  ```
- **Maps WhatsApp sender names to known participants** using the existing `normalizeAssignee()` function from `packages/shared`, extended with a phone-number-to-name mapping table or config
- **Inserts the compiled transcript into BOTH:**
  - The new `whatsapp_sessions` table
  - The existing `transcripts` table with `extraction_method = 'whatsapp'` so it flows through the existing RAG pipeline (chunking → embedding → searchable)
- **Links messages to their session** by updating `whatsapp_messages.session_id`

#### 4. AI Extraction Integration

Ensure WhatsApp sessions flow through the existing extraction pipeline:

- Extend `packages/shared/src/extract-action-items.ts` system prompt to handle WhatsApp conversation format (shorter messages, informal tone, emoji, abbreviations)
- Extend `packages/shared/src/extract-decisions.ts` similarly
- Add a WhatsApp-specific extraction prompt addendum:
  ```
  When processing WhatsApp conversations (as opposed to meeting transcripts):
  - Messages are shorter and more informal — look for implicit commitments ("I'll do it", "on it", "will push tonight")
  - Decisions may be expressed as quick agreements ("sounds good", "let's go with that", "+1", "👍")
  - Pay attention to reply chains — the quoted context often contains the decision or task being agreed to
  - Participants may use first names, nicknames, or just initials
  - Code snippets, links, and technical references are common and should be captured in context
  ```

#### 5. Frontend Updates (apps/web)

**Transcript list page (`/transcripts`):**
- Add a source filter chip: "All" | "Google Meet" | "WhatsApp" | "Upload"
- WhatsApp transcripts get a distinct badge/icon (green WhatsApp icon)
- Show group name instead of meeting title for WhatsApp sources

**Dashboard (`/`):**
- Add a "WhatsApp Sessions" stat card alongside existing transcript stats
- Include WhatsApp sessions in the activity feed
- WhatsApp-sourced action items and decisions should be visually tagged

**Processing Log (`/logs`):**
- Include WhatsApp session processing entries
- Show source_type to distinguish from Gmail-ingested transcripts

#### 6. Manual Chat Import (for historical data)

Since the Cloud API cannot retrieve historical messages, add a manual import flow:

- New API route: `POST /api/upload/whatsapp-export`
- Accepts WhatsApp's native `.txt` export format (the format from "Export Chat" in-app)
- Parses the format: `[MM/DD/YY, HH:MM:SS] Sender Name: message text`
- Creates a `whatsapp_sessions` record and inserts into the transcript pipeline
- Frontend: Add "Import WhatsApp Export" option to the existing upload modal

#### 7. Configuration

Add to `.env`:
```
# WhatsApp Cloud API (Meta)
WHATSAPP_VERIFY_TOKEN=<random-secret-for-webhook-verification>
WHATSAPP_ACCESS_TOKEN=<permanent-system-user-token>
WHATSAPP_APP_SECRET=<meta-app-secret-for-signature-validation>
WHATSAPP_PHONE_NUMBER_ID=<your-business-phone-number-id>
WHATSAPP_BUSINESS_ACCOUNT_ID=<your-waba-id>

# WhatsApp Session Config
WHATSAPP_SESSION_IDLE_TIMEOUT_MINUTES=120
WHATSAPP_SESSION_COMPILE_INTERVAL_MINUTES=30
```

Extend `apps/worker/src/config.ts` to validate these.

#### 8. Phone-to-Name Mapping

Create a config file or Supabase table `whatsapp_contacts` that maps phone numbers to canonical participant names:
```
phone_number | display_name     | canonical_name
+1234567890  | Fiya             | Lutfiya Miller
+0987654321  | Chris M          | Chris Müller
```

This feeds into `normalizeAssignee()` so WhatsApp messages attribute action items correctly.

---

### Architecture Principles

1. **Treat WhatsApp sessions as first-class transcripts** — they should appear in RAG search, the calendar scoreboard, the activity feed, and all analytics alongside meeting transcripts
2. **Reuse existing infrastructure** — the chunking, embedding, extraction, and query pipelines should not be duplicated; WhatsApp sessions feed into the same `transcripts` table
3. **Buffer then batch** — never process individual WhatsApp messages through the AI pipeline; always compile into sessions first for cost efficiency and context quality
4. **Graceful degradation** — if WhatsApp webhook config is missing, the app should work exactly as before (Gmail-only mode)
5. **Type safety** — extend all shared types in `packages/shared/src/types.ts` with WhatsApp-specific fields and a `source_type` discriminator

### Deliverables

Produce these files in order:

1. **Supabase migration SQL** — `supabase/migrations/XXXXXX_whatsapp_integration.sql`
2. **Shared types** — updates to `packages/shared/src/types.ts`
3. **Worker: WhatsApp webhook handler** — `apps/worker/src/whatsapp/handler.ts`
4. **Worker: WhatsApp config** — update `apps/worker/src/config.ts`
5. **Worker: Session compiler** — `apps/worker/src/whatsapp/session-compiler.ts`
6. **Worker: Message buffer/store** — `apps/worker/src/whatsapp/store.ts`
7. **Worker: Route registration** — update `apps/worker/src/index.ts`
8. **Shared: Extraction prompt updates** — update extraction prompts for WhatsApp format
9. **Web: Upload WhatsApp export** — `apps/web/app/api/upload/whatsapp-export/route.ts`
10. **Web: Frontend updates** — source filter, badges, dashboard cards
11. **Phone-to-name mapping** — config or migration for contact lookup
12. **Updated `.env.example`** — document new environment variables

Work through each file sequentially. For each file, explain your reasoning briefly, then produce the complete implementation. After all files, provide a **testing checklist** covering webhook verification, message receipt, session compilation, extraction, RAG search, and manual import.

```
---PROMPT END---
```

---

## Research Sources

This prompt was informed by research into:

- [Meta WhatsApp Cloud API Webhook Setup](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks/)
- [WhatsApp Developer Hub](https://business.whatsapp.com/developers/developer-hub)
- [WhatsApp Groups API](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups)
- [WhatsApp 2026 Updates: Pacing, Limits & Usernames](https://sanuker.com/whatsapp-api-2026_updates-pacing-limits-usernames/)
- [WhatsApp Cloud API Integration Guide (Unipile)](https://www.unipile.com/whatsapp-api-a-complete-guide-to-integration/)
- [Implementing Webhooks from WhatsApp Business Platform](https://business.whatsapp.com/blog/how-to-use-webhooks-from-whatsapp-business-api)

### Key API Limitation

The Meta Cloud API **does not provide any endpoint for retrieving historical chat messages**. Messages can only be captured going forward via webhooks. For historical data, users must use WhatsApp's in-app "Export Chat" feature to produce `.txt` files, which this integration handles via the manual import flow.
