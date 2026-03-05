# Prompt: Decision Ledger — Auto-Extracted Decision Memory System

Copy everything below this line and paste it into Claude in Antigravity.

---

## Task

Build a Decision Ledger feature for MeetScript that automatically extracts *decisions* (distinct from action items) from meeting transcripts, stores them with vector embeddings for semantic search, surfaces them proactively during RAG queries when a user is about to re-debate a settled topic, and provides a dedicated Decisions page for browsing, filtering, and managing all historical decisions. This feature should include a batch backfill pipeline for the existing 200+ transcript corpus and real-time extraction for new transcripts as they're ingested.

## Architecture Context

This is a Turborepo monorepo:
- `apps/web` — Next.js 14 (App Router), React 18, Tailwind CSS 3.4, TypeScript 5.5
- `apps/worker` — Node.js/Express on Cloud Run (handles Gmail Pub/Sub ingest)
- `packages/shared/src/types.ts` — Shared TypeScript interfaces (barrel-exported from `index.ts`)
- `packages/shared/src/extract-action-items.ts` — Existing Claude extraction pattern to follow
- `packages/shared/src/normalize-assignee.ts` — Canonical names: `"Lutfiya Miller"`, `"Chris Müller"`
- Database: Supabase (PostgreSQL + pgvector)
- AI: Anthropic Claude (`claude-sonnet-4-20250514`) via REST API, OpenAI (`text-embedding-3-small`, 1536 dims) for embeddings
- Supabase client: `getServerSupabase()` from `apps/web/lib/supabase.ts` (service role, `cache: 'no-store'`)
- Typed API wrapper: `apps/web/lib/api.ts` (uses `apiFetch<T>()` pattern)
- No additional npm dependencies should be added

## What Decisions Are (vs. Action Items)

Decisions are NOT the same as action items. A decision is a *concluded determination* — a choice that was made, a direction that was set, a question that was answered. Action items are *tasks to be done*. Examples:

| Transcript excerpt | Is it a decision? | Is it an action item? |
|---|---|---|
| "We decided to use Stripe for LMS payments." | ✅ Decision | ❌ Not an action item |
| "Let's go with Next.js 16 for the rebuild." | ✅ Decision | ❌ Not an action item |
| "Chris will set up the Stripe webhook." | ❌ Not a decision | ✅ Action item |
| "We agreed the MVP won't include gamification." | ✅ Decision | ❌ Not an action item |
| "Let's revisit the pricing model next week." | ❌ Not a decision (deferred) | ✅ Action item |
| "We're going to self-host on Hetzner." | ✅ Decision | ❌ Not an action item |

Claude should extract decisions and action items as completely separate entities during transcript processing.

## Current Database Schema

These tables already exist — DO NOT recreate them:

```sql
-- 001_create_tables.sql
CREATE TABLE transcripts (
  id TEXT PRIMARY KEY,
  meeting_title TEXT NOT NULL,
  meeting_date TIMESTAMPTZ NOT NULL,
  participants TEXT[],
  raw_transcript TEXT NOT NULL,
  source_email_id TEXT UNIQUE NOT NULL,
  extraction_method TEXT,
  word_count INTEGER,
  processed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE transcript_chunks (
  id TEXT PRIMARY KEY,
  transcript_id TEXT REFERENCES transcripts(id) ON DELETE CASCADE,
  meeting_title TEXT,
  meeting_date TIMESTAMPTZ,
  participants TEXT[],
  chunk_index INTEGER,
  total_chunks INTEGER,
  text TEXT NOT NULL,
  embedding VECTOR(1536),
  token_estimate INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Existing RPC function for similarity search:
CREATE OR REPLACE FUNCTION match_chunks(
  query_embedding VECTOR(1536),
  match_count INT DEFAULT 10,
  match_threshold FLOAT DEFAULT 0.7,
  filter_transcript_id TEXT DEFAULT NULL
) RETURNS TABLE (
  id TEXT, transcript_id TEXT, meeting_title TEXT,
  meeting_date TIMESTAMPTZ, text TEXT, similarity FLOAT
);

-- 002_action_items.sql
CREATE TABLE action_items (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  transcript_id TEXT REFERENCES transcripts(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  assigned_to TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT DEFAULT 'medium',
  due_date DATE,
  source_text TEXT,
  created_by TEXT DEFAULT 'ai',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);
-- Additional columns added by later migrations:
-- group_label TEXT (003), is_duplicate BOOLEAN (005), duplicate_of TEXT (005), effort TEXT (006)

CREATE TABLE activity_log (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  event_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  actor TEXT,
  summary TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
```

## Current Shared Types

In `packages/shared/src/types.ts` (relevant subset):

```typescript
export type ExtractionMethod = 'inline' | 'google_doc' | 'attachment' | 'upload' | 'pdf_upload' | 'paste' | 'loom_import';
export type ActionItemStatus = 'open' | 'in_progress' | 'done' | 'dismissed';
export type ActionItemPriority = 'low' | 'medium' | 'high' | 'urgent';
export type ActionItemEffort = 'quick_fix' | 'moderate' | 'significant';
export type ActionItemCreatedBy = 'ai' | 'manual';

export interface ActionItem {
  id: string;
  transcript_id: string | null;
  title: string;
  description: string | null;
  assigned_to: string | null;
  status: ActionItemStatus;
  priority: ActionItemPriority;
  effort: ActionItemEffort | null;
  due_date: string | null;
  source_text: string | null;
  created_by: ActionItemCreatedBy;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  group_label: string | null;
  is_duplicate: boolean;
  duplicate_of: string | null;
}

export interface ActivityLogEntry {
  id: string;
  event_type: string;
  entity_type: string | null;
  entity_id: string | null;
  actor: string;
  summary: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface SourceChunk {
  chunk_id: string;
  transcript_id: string;
  meeting_title: string;
  meeting_date: string;
  text: string;
  similarity: number;
}

export interface QueryResponse {
  answer: string;
  sources: SourceChunk[];
}
```

## Existing Claude Integration Pattern

Follow the EXACT pattern used in `packages/shared/src/extract-action-items.ts` and `apps/web/app/api/action-items/extract/route.ts`:

```typescript
// Anthropic REST API call pattern (used everywhere in this codebase):
const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
    }),
});

const data = (await anthropicRes.json()) as { content?: { text?: string }[] };
const rawText: string = data.content?.[0]?.text ?? '[]';
const parsed = JSON.parse(rawText);
```

The key for `process.env.ANTHROPIC_API_KEY` is always read from the environment. OpenAI embeddings use:

```typescript
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const embeddingRes = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: textToEmbed,
});
const embedding = embeddingRes.data[0].embedding; // number[1536]
```

## Existing Embedding & RAG Pattern

From `apps/web/app/api/query/route.ts`:

1. Embed user question via OpenAI `text-embedding-3-small`
2. Call `supabase.rpc('match_chunks', { query_embedding, match_count: 10, match_threshold: 0.3 })`
3. Build context string from matched chunks
4. Call Claude with system prompt + context + question
5. Return `{ answer, sources }`

## What to Build

### Step 1: Database Migration

**File:** `supabase/migrations/007_decisions.sql`

```sql
-- Decision Ledger — auto-extracted decisions from meeting transcripts

CREATE TABLE decisions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  transcript_id TEXT REFERENCES transcripts(id) ON DELETE SET NULL,
  decision_text TEXT NOT NULL,              -- The decision itself (concise)
  context TEXT,                             -- Surrounding discussion context
  domain TEXT DEFAULT 'general',            -- 'architecture' | 'product' | 'business' | 'design' | 'infrastructure' | 'operations' | 'general'
  confidence TEXT DEFAULT 'high',           -- 'high' | 'medium' | 'low'
  participants TEXT[],                      -- Who was present when this was decided
  decided_at TIMESTAMPTZ,                   -- When the decision was made (transcript meeting_date)
  source_text TEXT,                         -- The exact transcript excerpt
  embedding VECTOR(1536),                   -- For semantic similarity search
  superseded_by TEXT REFERENCES decisions(id) ON DELETE SET NULL, -- Self-referencing FK for decision chains
  status TEXT NOT NULL DEFAULT 'active',    -- 'active' | 'superseded' | 'reversed' | 'under_review'
  created_by TEXT DEFAULT 'ai',             -- 'ai' | 'manual'
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_decisions_transcript ON decisions(transcript_id);
CREATE INDEX idx_decisions_domain ON decisions(domain);
CREATE INDEX idx_decisions_status ON decisions(status);
CREATE INDEX idx_decisions_decided_at ON decisions(decided_at DESC);

-- IVFFlat index for fast cosine similarity search on decision embeddings
-- Using fewer lists than transcript_chunks since we'll have fewer decisions
CREATE INDEX idx_decisions_embedding
  ON decisions
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50);

-- RPC function for decision similarity search
CREATE OR REPLACE FUNCTION match_decisions(
  query_embedding VECTOR(1536),
  match_count INT DEFAULT 5,
  match_threshold FLOAT DEFAULT 0.75,
  filter_status TEXT DEFAULT 'active'
)
RETURNS TABLE (
  id TEXT,
  transcript_id TEXT,
  decision_text TEXT,
  context TEXT,
  domain TEXT,
  confidence TEXT,
  decided_at TIMESTAMPTZ,
  source_text TEXT,
  status TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.transcript_id,
    d.decision_text,
    d.context,
    d.domain,
    d.confidence,
    d.decided_at,
    d.source_text,
    d.status,
    1 - (d.embedding <=> query_embedding) AS similarity
  FROM decisions d
  WHERE 1 - (d.embedding <=> query_embedding) > match_threshold
    AND (filter_status IS NULL OR d.status = filter_status)
  ORDER BY d.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

Run this migration in Supabase SQL Editor or via CLI.

### Step 2: Update Shared Types

**File:** `packages/shared/src/types.ts`

Add these types AFTER the existing `ActionItem` interface (around line 114):

```typescript
// ── Decisions ───────────────────────────────────

export type DecisionDomain = 'architecture' | 'product' | 'business' | 'design' | 'infrastructure' | 'operations' | 'general';
export type DecisionConfidence = 'high' | 'medium' | 'low';
export type DecisionStatus = 'active' | 'superseded' | 'reversed' | 'under_review';
export type DecisionCreatedBy = 'ai' | 'manual';

export interface Decision {
    id: string;
    transcript_id: string | null;
    decision_text: string;
    context: string | null;
    domain: DecisionDomain;
    confidence: DecisionConfidence;
    participants: string[];
    decided_at: string;
    source_text: string | null;
    superseded_by: string | null;
    status: DecisionStatus;
    created_by: DecisionCreatedBy;
    created_at: string;
    updated_at: string;
    /** Meeting title, joined from transcripts table when needed */
    meeting_title?: string;
}

/** Shape of a single extracted decision from Claude (pre-normalization). */
export interface RawExtractedDecision {
    decision_text: string;
    context?: string | null;
    domain?: DecisionDomain;
    confidence?: DecisionConfidence;
    source_text?: string;
}
```

Add the new types to the barrel export in `packages/shared/src/index.ts`.

### Step 3: Shared Decision Extraction Logic

**File:** `packages/shared/src/extract-decisions.ts`

Create this file following the EXACT pattern of `extract-action-items.ts`:

```typescript
/**
 * Shared logic for AI-powered decision extraction from transcripts.
 *
 * Used by both the single-transcript and batch extraction API routes
 * to avoid duplicating prompts, parsing, and normalization logic.
 */
import type { DecisionDomain, DecisionConfidence } from './types';

// ── Claude system prompt ────────────────────────

export const DECISION_EXTRACTION_SYSTEM_PROMPT = `You extract DECISIONS from meeting transcripts. Decisions are concluded determinations — choices made, directions set, questions answered.

IMPORTANT: Decisions are NOT action items. Do NOT extract tasks, to-dos, or assignments. Only extract statements where the participants clearly decided, agreed, chose, or concluded something.

Return a JSON array of objects with these fields:
- decision_text (string, required): A concise, standalone statement of the decision. Write it as "We decided to..." or "The team agreed that..." so it reads clearly out of context. Maximum 2 sentences.
- context (string | null): A 1-2 sentence summary of the discussion that led to this decision (what alternatives were considered, why this was chosen). Null if the decision appears without much surrounding context.
- domain (string): Classify into exactly one of: "architecture", "product", "business", "design", "infrastructure", "operations", "general"
  • "architecture" — Technology choices, stack decisions, system design, API design, database schema
  • "product" — Feature scope, MVP definitions, user experience decisions, prioritization, what to build/not build
  • "business" — Pricing, partnerships, legal, hiring, marketing, company strategy
  • "design" — UI/UX, branding, visual design, layout choices
  • "infrastructure" — Hosting, deployment, CI/CD, monitoring, DevOps
  • "operations" — Process decisions, workflow changes, tool adoption, meeting cadence
  • "general" — Anything that doesn't clearly fit the above categories
- confidence (string): How clearly was this stated as a decision?
  • "high" — Explicit agreement language: "we decided", "let's go with", "agreed", "confirmed"
  • "medium" — Implied agreement: one person states a direction and the other doesn't object, or "I think we should" followed by "yeah, makes sense"
  • "low" — Ambiguous: could be a tentative direction rather than a firm decision
- source_text (string): The exact excerpt from the transcript that contains or implies this decision. Include enough context (2-4 sentences) to understand the decision without reading the full transcript.

Extraction rules:
- Only extract decisions that are clearly present in the transcript — do not infer or fabricate
- If a topic is discussed but explicitly DEFERRED ("let's revisit next week"), do NOT extract it as a decision
- If someone proposes something but the other person pushes back, do NOT extract it as a decision
- One transcript may contain 0-15 decisions; most meetings have 2-6 decisions
- Remove any decisions that are merely restatements of previously extracted decisions within the same transcript
- If there are no decisions, return an empty array

Return ONLY valid JSON, no markdown fences or extra text.`;

// ── Types ───────────────────────────────────────

export interface RawExtractedDecision {
    decision_text: string;
    context?: string | null;
    domain?: string;
    confidence?: string;
    source_text?: string;
}

export interface TranscriptForDecisionExtraction {
    id: string;
    meeting_title: string;
    meeting_date: string;
    raw_transcript: string;
    participants: string[];
}

// ── Core extraction call ────────────────────────

/**
 * Call Claude to extract decisions from a single transcript.
 * Returns the raw parsed array (may be empty).
 *
 * Throws on network / parsing errors so callers can handle them.
 */
export async function extractDecisionsFromTranscript(
    transcript: TranscriptForDecisionExtraction,
    anthropicKey: string,
): Promise<RawExtractedDecision[]> {
    const participants = transcript.participants ?? [];

    const requestBody = {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: DECISION_EXTRACTION_SYSTEM_PROMPT,
        messages: [
            {
                role: 'user',
                content: `Meeting: ${transcript.meeting_title}\nDate: ${transcript.meeting_date}\nParticipants: ${participants.join(', ')}\n\nTranscript:\n${transcript.raw_transcript}`,
            },
        ],
    };

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(requestBody),
    });

    if (!anthropicRes.ok) {
        const errorBody = await anthropicRes.text();
        console.error(`[extract-decisions] Claude API error ${anthropicRes.status}: ${errorBody}`);
        throw new Error(`Claude API returned ${anthropicRes.status}: ${errorBody}`);
    }

    const data = (await anthropicRes.json()) as { content?: { text?: string }[] };
    const rawText: string = data.content?.[0]?.text ?? '[]';

    console.log(`[extract-decisions] Claude response for "${transcript.meeting_title}": ${rawText.slice(0, 200)}...`);

    const extracted: RawExtractedDecision[] = JSON.parse(rawText);
    if (!Array.isArray(extracted)) return [];

    console.log(`[extract-decisions] Extracted ${extracted.length} decisions from "${transcript.meeting_title}"`);
    return extracted;
}

// ── Row builder ─────────────────────────────────

const VALID_DOMAINS: Set<string> = new Set(['architecture', 'product', 'business', 'design', 'infrastructure', 'operations', 'general']);
const VALID_CONFIDENCE: Set<string> = new Set(['high', 'medium', 'low']);

/**
 * Normalize extracted decisions and build database insertion rows.
 */
export function buildDecisionInsertionRows(
    extracted: RawExtractedDecision[],
    transcript: { id: string; meeting_date: string; participants: string[] },
    overrides?: Record<string, unknown>,
): Record<string, unknown>[] {
    return extracted.map((item) => ({
        transcript_id: transcript.id,
        decision_text: item.decision_text,
        context: item.context ?? null,
        domain: VALID_DOMAINS.has(item.domain ?? '') ? item.domain : 'general',
        confidence: VALID_CONFIDENCE.has(item.confidence ?? '') ? item.confidence : 'medium',
        participants: transcript.participants ?? [],
        decided_at: transcript.meeting_date,
        source_text: item.source_text ?? null,
        status: 'active',
        created_by: 'ai',
        ...overrides,
    }));
}
```

Add exports to `packages/shared/src/index.ts` following the existing explicit-export pattern:

```typescript
// Add these lines alongside the existing exports:
export type { Decision, DecisionDomain, DecisionConfidence, DecisionStatus, DecisionCreatedBy, RawExtractedDecision } from './types.js';
export {
    DECISION_EXTRACTION_SYSTEM_PROMPT,
    extractDecisionsFromTranscript,
    buildDecisionInsertionRows,
} from './extract-decisions';
export type { TranscriptForDecisionExtraction } from './extract-decisions';
```

### Step 4: API Routes

#### 4a. Decision CRUD

**File:** `apps/web/app/api/decisions/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '../../../lib/supabase';
import type { Decision } from '@meet-pipeline/shared';

export const dynamic = 'force-dynamic';

/**
 * GET /api/decisions — List decisions with filtering and sorting.
 *
 * Query params:
 *   domain      — exact match (e.g. "architecture")
 *   status      — exact match or comma-separated (default: "active")
 *   confidence  — exact match
 *   sort        — decided_at | created_at (default: decided_at)
 *   order       — asc | desc (default: desc)
 *   limit       — max rows (default: 100, max: 500)
 *   search      — text search in decision_text
 */
export async function GET(req: NextRequest) {
    try {
        const supabase = getServerSupabase();
        const { searchParams } = req.nextUrl;

        const sortCol = ['decided_at', 'created_at'].includes(searchParams.get('sort') ?? '')
            ? searchParams.get('sort')!
            : 'decided_at';
        const ascending = searchParams.get('order') === 'asc';
        const limit = Math.min(parseInt(searchParams.get('limit') ?? '100', 10) || 100, 500);

        let query = supabase
            .from('decisions')
            .select('*, transcripts(meeting_title)')
            .order(sortCol, { ascending })
            .limit(limit);

        const status = searchParams.get('status') ?? 'active';
        if (status !== 'all') {
            const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
            query = statuses.length === 1
                ? query.eq('status', statuses[0])
                : query.in('status', statuses);
        }

        const domain = searchParams.get('domain');
        if (domain) query = query.eq('domain', domain);

        const confidence = searchParams.get('confidence');
        if (confidence) query = query.eq('confidence', confidence);

        const search = searchParams.get('search');
        if (search) query = query.ilike('decision_text', `%${search}%`);

        const { data, error } = await query;

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Flatten the joined meeting_title onto each decision
        const decisions = (data ?? []).map((d: any) => ({
            ...d,
            meeting_title: d.transcripts?.meeting_title ?? null,
            transcripts: undefined,
        }));

        return NextResponse.json(decisions);
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

/**
 * POST /api/decisions — Create a decision manually.
 */
export async function POST(req: NextRequest) {
    try {
        const supabase = getServerSupabase();
        const body = (await req.json()) as Partial<Decision>;

        if (!body.decision_text?.trim()) {
            return NextResponse.json({ error: 'decision_text is required' }, { status: 400 });
        }

        // Generate embedding for the decision text
        const OpenAI = (await import('openai')).default;
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
        const embeddingRes = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: body.decision_text.trim(),
        });
        const embedding = embeddingRes.data[0].embedding;

        const row = {
            decision_text: body.decision_text.trim(),
            context: body.context ?? null,
            domain: body.domain ?? 'general',
            confidence: body.confidence ?? 'high',
            participants: body.participants ?? [],
            decided_at: body.decided_at ?? new Date().toISOString(),
            source_text: body.source_text ?? null,
            transcript_id: body.transcript_id ?? null,
            embedding,
            status: 'active',
            created_by: 'manual',
        };

        const { data, error } = await supabase.from('decisions').insert(row).select().single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Log creation
        await supabase.from('activity_log').insert({
            event_type: 'decision_created',
            entity_type: 'decision',
            entity_id: data.id,
            actor: 'Lutfiya',
            summary: `Decision recorded: ${data.decision_text.slice(0, 80)}...`,
            metadata: { domain: data.domain, confidence: data.confidence, created_by: 'manual' },
        });

        return NextResponse.json(data, { status: 201 });
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
```

#### 4b. Single Decision CRUD

**File:** `apps/web/app/api/decisions/[id]/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '../../../../lib/supabase';

export const dynamic = 'force-dynamic';

/** GET /api/decisions/[id] — Fetch a single decision. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
    try {
        const supabase = getServerSupabase();
        const { data, error } = await supabase
            .from('decisions')
            .select('*, transcripts(meeting_title)')
            .eq('id', params.id)
            .single();

        if (error || !data) {
            return NextResponse.json({ error: 'Decision not found' }, { status: 404 });
        }

        return NextResponse.json({
            ...data,
            meeting_title: (data as any).transcripts?.meeting_title ?? null,
            transcripts: undefined,
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

/** PATCH /api/decisions/[id] — Update a decision. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
    try {
        const supabase = getServerSupabase();
        const body = await req.json();

        const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

        if (body.decision_text !== undefined) update.decision_text = body.decision_text;
        if (body.context !== undefined) update.context = body.context;
        if (body.domain !== undefined) update.domain = body.domain;
        if (body.confidence !== undefined) update.confidence = body.confidence;
        if (body.status !== undefined) update.status = body.status;
        if (body.superseded_by !== undefined) update.superseded_by = body.superseded_by;

        // Re-embed if decision_text changed
        if (body.decision_text) {
            const OpenAI = (await import('openai')).default;
            const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
            const embeddingRes = await openai.embeddings.create({
                model: 'text-embedding-3-small',
                input: body.decision_text.trim(),
            });
            update.embedding = embeddingRes.data[0].embedding;
        }

        const { data, error } = await supabase
            .from('decisions')
            .update(update)
            .eq('id', params.id)
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Log the update
        await supabase.from('activity_log').insert({
            event_type: 'decision_updated',
            entity_type: 'decision',
            entity_id: params.id,
            actor: 'Lutfiya',
            summary: `Decision updated: ${data.decision_text.slice(0, 80)}...`,
            metadata: { fields_updated: Object.keys(update).filter(k => k !== 'updated_at') },
        });

        return NextResponse.json(data);
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
```

#### 4c. Decision Extraction from Single Transcript

**File:** `apps/web/app/api/decisions/extract/route.ts`

Follow the exact pattern of `apps/web/app/api/action-items/extract/route.ts`. This endpoint:

1. Accepts `{ transcript_id: string }`
2. Fetches the transcript from `transcripts` table
3. Calls `extractDecisionsFromTranscript()` from `@meet-pipeline/shared`
4. Builds insertion rows via `buildDecisionInsertionRows()`
5. Generates vector embeddings for each `decision_text` using OpenAI `text-embedding-3-small`
6. Bulk-inserts into the `decisions` table (include the `embedding` column)
7. Logs each creation to `activity_log` with `event_type: 'decision_extracted'`
8. Returns `{ decisions: Decision[], count: number }`

**Key implementation detail for embeddings:** After getting the raw rows from `buildDecisionInsertionRows()`, batch-embed all `decision_text` values:

```typescript
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const texts = rows.map(r => r.decision_text as string);
const embeddingRes = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: texts,
});
// Attach embeddings to rows
for (let i = 0; i < rows.length; i++) {
    rows[i].embedding = embeddingRes.data[i].embedding;
}
```

#### 4d. Batch Backfill Extraction

**File:** `apps/web/app/api/decisions/extract-all/route.ts`

Follow the exact pattern of `apps/web/app/api/action-items/extract-all/route.ts`:

1. Find unprocessed transcripts — those with no entries in `decisions` table AND no `decision_extraction_attempted` activity log entry
2. Process sequentially with `THROTTLE_MS = 5_000` delay between transcripts
3. Retry on 429 rate limits with exponential backoff (`MAX_RETRIES = 3`)
4. For each transcript: extract → build rows → embed → insert → log
5. Log empty results to `activity_log` as `event_type: 'decision_extraction_attempted'` so they're not re-processed
6. Return `{ transcripts_processed, transcripts_skipped, transcripts_empty, transcripts_failed, decisions_extracted }`

Use the same throttling, retry, and logging patterns as the action item extract-all route.

#### 4e. Enhanced RAG Query Endpoint

**File:** `apps/web/app/api/query/route.ts` — MODIFY the existing file

After the existing `match_chunks()` RPC call (line ~35), add a decision similarity search:

```typescript
// Step 2b: Also search for relevant decisions
const { data: matchedDecisions } = await supabase.rpc('match_decisions', {
    query_embedding: queryEmbedding,
    match_count: 3,
    match_threshold: 0.78,
    filter_status: 'active',
});

const relevantDecisions = (matchedDecisions ?? []) as Array<{
    id: string;
    transcript_id: string;
    decision_text: string;
    context: string;
    domain: string;
    decided_at: string;
    similarity: number;
}>;
```

Then modify the context string (around line ~80) to prepend decisions:

```typescript
// Build decision context if any matched
const decisionContext = relevantDecisions.length > 0
    ? `IMPORTANT — Previously recorded decisions that may be relevant:\n\n${relevantDecisions
        .map((d, i) => `[Decision ${i + 1} (${new Date(d.decided_at).toLocaleDateString()}): ${d.decision_text}${d.context ? ` Context: ${d.context}` : ''}]`)
        .join('\n\n')}\n\n---\n\n`
    : '';

const context = decisionContext + matchedChunks
    .map((c, i) => `[Source ${i + 1}: ${c.meeting_title} (${new Date(c.meeting_date).toLocaleDateString()})]\n${c.text}`)
    .join('\n\n---\n\n');
```

Update the system prompt to instruct Claude to reference decisions:

```typescript
const systemPrompt = `You are a knowledgeable assistant for ScienceExperts.ai, a transcript analysis platform used by Dr. Lutfiya Miller and Chris Müller.

You answer questions about meeting transcripts using ONLY the provided context. Structure your response clearly:
- Use markdown formatting (headers, bold, bullet points) for readability
- Be specific — reference actual names, tools, features, and dates mentioned in the transcripts
- If the context doesn't contain enough information to fully answer, say what you can answer and note what's missing
- Cite the meeting title and date when referencing specific information
- Keep responses concise but thorough

DECISION AWARENESS: If the context includes previously recorded decisions that are relevant to the question, ALWAYS mention them prominently at the start of your answer. Use phrasing like "Note: You previously decided on [date] that [decision]." This helps prevent re-debating settled topics. If the question seems to be reconsidering a past decision, point that out diplomatically.`;
```

### Step 5: Client API Wrapper Functions

**File:** `apps/web/lib/api.ts` — ADD these functions alongside the existing ones:

```typescript
import type { Decision } from '@meet-pipeline/shared';

/** Fetch decisions with optional filters. */
export function fetchDecisions(filters?: {
    domain?: string;
    status?: string;
    confidence?: string;
    search?: string;
    sort?: 'decided_at' | 'created_at';
    order?: 'asc' | 'desc';
    limit?: number;
}): Promise<Decision[]> {
    const params = new URLSearchParams();
    if (filters?.domain) params.set('domain', filters.domain);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.confidence) params.set('confidence', filters.confidence);
    if (filters?.search) params.set('search', filters.search);
    if (filters?.sort) params.set('sort', filters.sort);
    if (filters?.order) params.set('order', filters.order);
    if (filters?.limit) params.set('limit', String(filters.limit));
    const qs = params.toString();
    return apiFetch(`/api/decisions${qs ? `?${qs}` : ''}`);
}

/** Fetch a single decision by ID. */
export function fetchDecision(id: string): Promise<Decision> {
    return apiFetch(`/api/decisions/${encodeURIComponent(id)}`);
}

/** Create a decision manually. */
export function createDecision(decision: Partial<Decision>): Promise<Decision> {
    return apiFetch('/api/decisions', {
        method: 'POST',
        body: JSON.stringify(decision),
    });
}

/** Update a decision by ID. */
export function updateDecision(id: string, updates: Partial<Decision>): Promise<Decision> {
    return apiFetch(`/api/decisions/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
    });
}

/** Trigger AI extraction of decisions from a transcript. */
export function extractDecisions(transcriptId: string): Promise<{ decisions: Decision[]; count: number }> {
    return apiFetch('/api/decisions/extract', {
        method: 'POST',
        body: JSON.stringify({ transcript_id: transcriptId }),
    });
}

/** Trigger batch extraction of decisions from all unprocessed transcripts. */
export function extractAllDecisions(): Promise<{
    transcripts_processed: number;
    transcripts_skipped: number;
    transcripts_empty: number;
    transcripts_failed: number;
    decisions_extracted: number;
}> {
    return apiFetch('/api/decisions/extract-all', { method: 'POST' });
}
```

### Step 6: Decisions Page

**File:** `apps/web/app/decisions/page.tsx`

Build a full page at the route `/decisions` with these features:

#### Layout and Header
- Page title: "Decision Ledger" with a subtitle "Every decision you've made, searchable and surfaced."
- Header buttons: "✦ Extract All" (triggers batch backfill, same pattern as action items extract-all), "+ Add Decision" (opens a create modal)
- Stats bar showing: total decisions count, decisions by domain (as colored mini-badges), active vs. superseded counts

#### Filter Bar
- Domain dropdown: All, Architecture, Product, Business, Design, Infrastructure, Operations, General
- Status filter: Active (default), Superseded, Reversed, Under Review, All
- Confidence filter: All, High, Medium, Low
- Text search input (searches `decision_text`)
- Sort toggle: Most Recent / Oldest First

#### Decision Cards
Each decision renders as a card with:
- **Decision text** — `text-sm font-medium text-theme-text-primary` — the main content
- **Domain badge** — colored badge (use existing badge classes, color-code by domain: architecture=violet, product=blue, business=amber, design=pink, infrastructure=green, operations=teal, general=gray)
- **Confidence indicator** — dot: green (high), yellow (medium), red (low)
- **Date** — `text-xs text-theme-text-tertiary` — formatted as "Mar 5, 2026"
- **Status badge** — active (green), superseded (gray with strikethrough on decision text), reversed (red), under_review (amber)
- **Expand/collapse** — clicking reveals: context, source_text (styled as a blockquote), transcript link (if `transcript_id` is set), and action buttons
- **Action buttons (in expanded view):**
  - "Mark Superseded" — sets `status: 'superseded'` and prompts for the superseding decision ID (optional)
  - "Mark Reversed" — sets `status: 'reversed'`
  - "Under Review" — sets `status: 'under_review'`
  - "Edit" — inline editing of `decision_text`, `domain`, `confidence`

#### Create Decision Modal
Simple modal (same glass-card pattern as the action items create modal) with fields:
- Decision text (textarea, required)
- Context (textarea, optional)
- Domain (dropdown)
- Confidence (dropdown)
- Date (date picker, defaults to today)

#### Styling
Follow the exact design system used throughout the app:
- Cards: `glass-card` wrapper with `hover:border-theme-border/[0.12]` on hover
- Inputs: `input-glow` for focus states
- Badges: use the existing `badge-info`, `badge-success`, `badge-error`, `badge-warning` classes
- Gradients: Use `from-accent-violet to-purple-600` for the Extract All button (same as Smart Group button pattern)
- Animations: `animate-fade-in` on card list, `animate-slide-up` on expanded content
- All text color classes: `text-theme-text-primary`, `text-theme-text-secondary`, `text-theme-text-tertiary`, `text-theme-text-muted`
- Background classes: `bg-theme-bg-raised`, `bg-theme-bg-overlay`

### Step 7: Add Navigation Link

**File:** `apps/web/components/sidebar.tsx`

Add a navigation item to the `NAV_ITEMS` array. Place it between "Action Items" and "Ask AI". The existing array uses simple Unicode characters as icons (e.g. `'◆'`, `'◇'`, `'☑'`, `'◈'`, `'◉'`). Use `'◩'` (or another distinctive Unicode geometric shape) for the Decisions icon. The new entry should be:

```typescript
{ href: '/decisions', label: 'Decisions', icon: '◩' },
```

Insert this line after the `action-items` entry and before the `ask` entry in the `NAV_ITEMS` array.

### Step 8: Add "Extract Decisions" Button to Transcript Detail Page

**File:** `apps/web/app/transcripts/[id]/page.tsx`

Add a button alongside the existing "Extract Action Items" button that triggers decision extraction for that single transcript. Label: "✦ Extract Decisions". Follow the same loading state and success notification pattern.

## Design System Reference

Use these existing classes throughout — do NOT invent new ones:
- Cards: `glass-card` (glassmorphism with backdrop blur)
- Inputs: `input-glow` (glow border on focus)
- Badges: `badge-info` (blue), `badge-success` (green), `badge-error` (red), `badge-warning` (amber)
- Text: `text-theme-text-primary`, `text-theme-text-secondary`, `text-theme-text-tertiary`, `text-theme-text-muted`
- Backgrounds: `bg-theme-bg-raised`, `bg-theme-bg-overlay`, `bg-theme-bg-muted`
- Borders: `border-theme-border/[opacity]`
- Brand gradient buttons: `bg-gradient-to-r from-brand-500 to-brand-600`
- Accent buttons: `bg-gradient-to-r from-accent-violet to-purple-600`
- Animations: `animate-fade-in`, `animate-slide-up`

## Domain Badge Color Mapping

Consistent color coding for decision domains across all views:

| Domain | Badge color | Tailwind classes |
|--------|-------------|-----------------|
| architecture | Violet | `bg-accent-violet/20 text-accent-violet` |
| product | Blue | `badge-info` |
| business | Amber | `badge-warning` |
| design | Pink | `bg-pink-500/20 text-pink-400` |
| infrastructure | Green | `badge-success` |
| operations | Teal | `bg-accent-teal/20 text-accent-teal` |
| general | Gray | `bg-theme-bg-muted text-theme-text-muted` |

## File Change Summary

| File | Action |
|------|--------|
| `supabase/migrations/007_decisions.sql` | **CREATE** — `decisions` table + `match_decisions()` RPC |
| `packages/shared/src/types.ts` | **EDIT** — Add `Decision`, `DecisionDomain`, `DecisionConfidence`, `DecisionStatus`, `DecisionCreatedBy`, `RawExtractedDecision` types |
| `packages/shared/src/extract-decisions.ts` | **CREATE** — Extraction prompt + `extractDecisionsFromTranscript()` + `buildDecisionInsertionRows()` |
| `packages/shared/src/index.ts` | **EDIT** — Add `export * from './extract-decisions'` |
| `apps/web/app/api/decisions/route.ts` | **CREATE** — GET (list) + POST (create) |
| `apps/web/app/api/decisions/[id]/route.ts` | **CREATE** — GET (single) + PATCH (update) |
| `apps/web/app/api/decisions/extract/route.ts` | **CREATE** — Single-transcript extraction |
| `apps/web/app/api/decisions/extract-all/route.ts` | **CREATE** — Batch backfill extraction |
| `apps/web/app/api/query/route.ts` | **EDIT** — Add decision-aware RAG (match_decisions + system prompt) |
| `apps/web/lib/api.ts` | **EDIT** — Add `fetchDecisions`, `createDecision`, `updateDecision`, `extractDecisions`, `extractAllDecisions` |
| `apps/web/app/decisions/page.tsx` | **CREATE** — Full Decisions page |
| `apps/web/components/sidebar.tsx` | **EDIT** — Add Decisions nav item |
| `apps/web/app/transcripts/[id]/page.tsx` | **EDIT** — Add "Extract Decisions" button |

## Do NOT

- Do NOT add any npm dependencies — everything is achievable with the existing stack
- Do NOT modify the `action_items` table or extraction pipeline — decisions are a completely separate entity
- Do NOT create a separate chunking/embedding pipeline for decisions — each decision gets a single embedding of its `decision_text` (not chunked, since decisions are short)
- Do NOT modify the existing `match_chunks()` function — create the new `match_decisions()` function alongside it
- Do NOT change the glassmorphism design system or color tokens — use existing classes
- Do NOT break any existing functionality — the RAG endpoint modification must be backward compatible (if no decisions match, behavior is identical to today)
- Do NOT use `import Anthropic from '@anthropic-ai/sdk'` — this project uses raw `fetch()` to the Anthropic REST API
- Do NOT skip the embedding step when inserting decisions — every decision must have an embedding for the `match_decisions()` RPC to work
- Do NOT use `gen_random_uuid()` in TypeScript — let the database default handle ID generation
- Do NOT store decision embeddings in a separate table — the `embedding` column is on the `decisions` table itself (unlike transcript chunks which are in a separate table, decisions are short enough to embed individually)
