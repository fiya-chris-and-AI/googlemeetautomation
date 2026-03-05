# Optimized Prompt: Replace Participants Column with Key Topics

> For use in Google Antigravity IDE with Claude 4.6 Opus

---

## Prompt

```
<context>
This is a Next.js + Supabase monorepo (Turborepo) for a meeting transcript pipeline at ScienceExperts.ai. The meetings are almost always between the same two co-founders (Chris and Lutfiya), so showing "Participants" adds no value. The current "Participants" column is also broken — a regex-based `extractParticipants()` function false-matches random English sentence fragments as speaker names (e.g., "And I haven't gone", "I've shared this good", "It").

Instead of fixing participant extraction, **replace the entire Participants feature with a Key Topics feature** that extracts and displays the main ideas/themes discussed in each meeting.
</context>

<architecture_overview>
- **Monorepo**: Turborepo with `apps/web` (Next.js), `apps/worker`, `packages/shared`
- **Database**: Supabase (Postgres + pgvector)
- **AI**: The app already uses the Anthropic API (Claude) via `ANTHROPIC_API_KEY` for action item extraction — see `apps/web/app/api/action-items/extract/route.ts` for the existing pattern
- **Embeddings**: OpenAI `text-embedding-3-small` for RAG chunks
</architecture_overview>

<task>
Replace the `participants TEXT[]` column with `key_topics TEXT[]` across the full stack. This involves:

### 1. Database Migration
Create a new Supabase migration that:
- Adds `key_topics TEXT[]` column to `transcripts` table (default `'{}'`)
- Adds `key_topics TEXT[]` column to `transcript_chunks` table (default `'{}'`)
- The `participants` columns can remain for now (don't drop them) to avoid breaking anything during rollout

### 2. Shared Types (`packages/shared/src/types.ts`)
- Add `key_topics: string[]` to `MeetingTranscript` interface (line 18 area)
- Add `key_topics: string[]` to `TranscriptChunk` interface (line 40 area)
- Update `DayMeetingSummary` (line 132 area) — replace `participants: string[]` and `uniqueParticipants: string[]` with topic equivalents
- Update `ScoreboardMetrics` and `CumulativeStats` as appropriate

### 3. Topic Extraction Function
Replace the broken `extractParticipants()` with a new `extractKeyTopics()` function in:
- `apps/web/lib/upload-pipeline.ts` (replaces lines 62–77)
- `apps/worker/src/extraction/normalize.ts` (replaces lines 32–49)

**Two-tier approach:**
- **Fast/free extraction (default for ingestion)**: A regex/heuristic function that pulls topic-like phrases from the transcript. Look for recurring noun phrases, capitalized terms, technical vocabulary, or named entities. Return 3–7 short topic labels (2–5 words each, title-cased). Examples: "Pipeline Architecture", "Loom Integration", "Action Item Tracking", "User Onboarding Flow".
- **AI extraction (on-demand, like action items)**: A new API endpoint that calls Claude to extract topics from the full transcript. Follow the exact same pattern as `apps/web/app/api/action-items/extract/route.ts` — use the Anthropic API with `ANTHROPIC_API_KEY`, send the transcript text, and parse a JSON array response.

The AI extraction prompt should ask Claude to return 3–7 key topics as a JSON array of short strings, capturing the main subjects, decisions, and themes discussed. Provide the transcript text and meeting title as context.

### 4. Update `processUpload()` in `apps/web/lib/upload-pipeline.ts`
- Call `extractKeyTopics(text)` instead of `extractParticipants(text)`
- Store results in the `key_topics` field when inserting into `transcripts` and `transcript_chunks` tables
- Remove the `pdf_upload` special-case skip (line 262) — topic extraction should work on all formats

### 5. Update `normalizeTranscript()` in `apps/worker/src/extraction/normalize.ts`
- Same change: call `extractKeyTopics()` instead of `extractParticipants()`
- Store in `key_topics` field

### 6. API Routes
**`apps/web/app/api/transcripts/route.ts`** (GET):
- Add `key_topics: row.key_topics ?? []` to the response mapping (line 40 area)

**`apps/web/app/api/transcripts/[id]/route.ts`** (GET + PATCH):
- Include `key_topics` in the select and response
- Support updating `key_topics` via PATCH

**New: `apps/web/app/api/transcripts/[id]/extract-topics/route.ts`** (POST):
- AI-powered topic extraction endpoint (mirrors action-items/extract pattern)
- Fetches transcript, calls Claude, parses JSON array of topic strings
- Updates the `key_topics` column in both `transcripts` and `transcript_chunks` tables
- Returns the extracted topics

### 7. Transcript Library Page (`apps/web/app/transcripts/page.tsx`)
- Rename column header from "Participants" → "Key Topics" (line 295)
- Rename filter input from "Filter by participant..." → "Filter by topic..." (line 198 area)
- Rename state variable `participantFilter` → `topicFilter`
- Update display: show `t.key_topics` badges instead of `t.participants` (lines 351–361)
- Update filter logic to search `t.key_topics` instead of `t.participants` (lines 143–147)
- Style the topic badges: use a subtle color scheme (e.g., `badge-info` is fine, or use a muted tag style)

### 8. Transcript Detail Page (`apps/web/app/transcripts/[id]/page.tsx`)
- Replace the "Participants (N)" sidebar section (lines 300–313) with "Key Topics (N)"
- Show each topic as a tag/badge instead of colored-dot participant names
- Remove the `speakerColorMap` logic (lines 142–146) — it was only used for participant highlighting
- Keep the transcript text rendering but remove speaker-name coloring (lines 246–248)
- Add an "Extract with AI" button next to the Key Topics header (same pattern as the Action Items section at line 321–328)

### 9. Backfill Script
Create `scripts/backfill-topics.ts` that:
- Fetches all existing transcripts from Supabase
- Runs `extractKeyTopics()` (the heuristic version) on each transcript's `raw_transcript`
- Updates the `key_topics` column in both `transcripts` and `transcript_chunks`
- Can be run via `npx tsx scripts/backfill-topics.ts`
</task>

<files_to_modify>
| File | Change |
|------|--------|
| `supabase/migrations/002_add_key_topics.sql` | **NEW** — add `key_topics TEXT[]` to both tables |
| `packages/shared/src/types.ts` | Add `key_topics` to interfaces |
| `apps/web/lib/upload-pipeline.ts` | Replace `extractParticipants()` → `extractKeyTopics()` + update `processUpload()` |
| `apps/worker/src/extraction/normalize.ts` | Replace `extractParticipants()` → `extractKeyTopics()` + update `normalizeTranscript()` |
| `apps/web/app/api/transcripts/route.ts` | Include `key_topics` in GET response |
| `apps/web/app/api/transcripts/[id]/route.ts` | Include `key_topics` in GET/PATCH |
| `apps/web/app/api/transcripts/[id]/extract-topics/route.ts` | **NEW** — AI topic extraction endpoint |
| `apps/web/app/transcripts/page.tsx` | Rename column + filter + display from participants → topics |
| `apps/web/app/transcripts/[id]/page.tsx` | Replace sidebar participants section with topics + "Extract with AI" button |
| `scripts/backfill-topics.ts` | **NEW** — backfill existing transcripts |
| `apps/worker/src/__tests__/normalize.test.ts` | Update tests for `extractKeyTopics()` |
</files_to_modify>

<constraints>
- Do NOT drop the `participants` column from the database — just add `key_topics` alongside it
- Do NOT remove `participants` from the TypeScript interfaces yet — just add `key_topics` and make `participants` optional
- Follow the existing Claude API call pattern in `apps/web/app/api/action-items/extract/route.ts` for the AI topic extraction endpoint
- Keep the heuristic `extractKeyTopics()` function in sync between both copies (`upload-pipeline.ts` and `normalize.ts`)
- The heuristic extraction must work WITHOUT an API call (it runs at import time for every transcript)
- The AI extraction is on-demand only (user clicks "Extract with AI") — do NOT call the Anthropic API during bulk import
- Topic labels should be short (2–5 words), title-cased, and deduplicated
- Return 3–7 topics per transcript (not too few, not too many)
</constraints>

<heuristic_extraction_guidance>
For the fast/free `extractKeyTopics()` function, consider these approaches:
1. **TF-IDF-like approach**: Find words/bigrams that appear frequently in this transcript but are uncommon in general speech (skip stopwords, filler words like "uh", "uhm", "like", "you know")
2. **Capitalized entity extraction**: Pull out capitalized multi-word phrases that aren't at sentence starts (proper nouns, product names, company names)
3. **Pattern matching**: Look for phrases following patterns like "working on [X]", "we need to [X]", "the [X] feature", "update on [X]"
4. **Section detection**: If timestamps exist, identify topic shifts by looking for long pauses or explicit topic markers

The function should return clean, readable topic labels like: ["Pipeline Architecture", "Loom Integration", "Database Schema", "Sprint Planning", "Customer Feedback"]

NOT raw phrases like: ["the pipeline thing we talked about", "I think we should maybe"]
</heuristic_extraction_guidance>

<ai_extraction_prompt>
When building the Claude API call for on-demand extraction, use a system prompt similar to:

"You extract the key topics and themes from meeting transcripts. Return a JSON array of 3-7 short topic labels (2-5 words each, title-cased). Focus on: main subjects discussed, decisions made, projects referenced, and technical topics covered. Omit greetings, small talk, and filler. Example output: ["Sprint Planning", "Database Migration", "Customer Onboarding", "Pricing Strategy"]"
</ai_extraction_prompt>

<tests>
Update `apps/worker/src/__tests__/normalize.test.ts`:
1. `extractKeyTopics()` on a real Loom transcript sample → returns meaningful topic labels
2. `extractKeyTopics()` returns 3–7 items, all title-cased and 2–5 words
3. `extractKeyTopics()` does NOT return filler phrases, sentence fragments, or stopwords
4. `extractKeyTopics()` handles empty/very short transcripts gracefully (returns `[]`)
5. `normalizeTranscript()` now includes `key_topics` in output
</tests>
```
