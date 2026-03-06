# Prompt: Backlog Transcript Review — Deduplicated Action Items & Decision Timeline

> **Target model:** Claude 4.6 Opus — Google Antigravity IDE
> **App:** MeetScript (3rd AI LLC) — Google Meet Transcript Pipeline
> **Purpose:** Pre-import review of ~39 historical transcripts (Dec 2025 – Feb 2026) to produce a clean, deduplicated action item registry and chronological decision ledger before bulk-importing into MeetScript
> **Date generated:** 2026-03-06

---

## Context

MeetScript is a full-stack app (Next.js 14 + Supabase + Gemini 2.5 Flash + OpenAI embeddings) that auto-ingests meeting transcripts, extracts action items and decisions via AI, and provides a RAG-powered query dashboard. The system was just built and its extraction pipeline is now functional — but there are ~39 historical transcripts from the past few months of Chris & Lutfiya's teleconferences sitting in `loom_transcripts_chris_lutfiya/` that have never been processed.

**The problem:** Bulk-importing these transcripts naively would flood the system with stale action items (already completed), redundant decisions (stated multiple times), and noise. We need a pre-import audit that extracts everything, reconciles it across time, and produces a clean review document before anything touches the database.

---

## Instructions

You are an executive-level meeting analyst processing a backlog of ~39 meeting transcripts between **Lutfiya Miller** and **Chris Müller**, co-founders of 3rd AI LLC, spanning **December 2025 through February 2026**. Your job is to produce a single, comprehensive review document that they can audit before importing these transcripts into their MeetScript pipeline.

### Phase 1 — Individual Transcript Processing (Parallel Sub-Agents)

For each transcript file in `loom_transcripts_chris_lutfiya/`, spawn a sub-agent to perform the following. Process all transcripts in parallel where possible.

**Skip** any transcript with fewer than 100 words (these are failed recordings with no meaningful content).

For each valid transcript, extract:

#### 1A. Meeting Summary
- **Date:** Parse from filename (format `YYYY-MM-DD`) or infer from content
- **Source file:** Exact filename for traceability
- **Duration estimate:** word_count ÷ 150 (approximate minutes of speech)
- **Participants:** Identify speakers from transcript content
- **Summary:** 2-4 sentence synopsis of what was discussed — focus on *topics* and *outcomes*, not play-by-play

#### 1B. Action Items
Extract using these criteria (aligned with MeetScript's existing schema):

An action item is a **concrete task** someone committed to or was assigned. It must have a clear verb and an identifiable owner.

**Extract these:**
- Explicit commitments: "I'll set up the CI pipeline this week"
- Direct assignments: "Chris, can you handle the API integration?"
- Volunteering: "I can take care of the DNS migration"
- Agreed-upon next steps: "Next step is we need to write the migration script"
- Follow-ups: "Let's circle back after testing the staging deploy"
- Research tasks: "I need to look into whether Vercel supports that"

**Do NOT extract:**
- Decisions or agreements ("We'll use Supabase") — these go in the Decision section
- Descriptions of how something works — this is information, not a task
- Vague intentions with no owner ("We should probably look into that someday")
- Past completed work mentioned in-meeting ("I already fixed that yesterday")
- Observations or opinions

For each action item, capture:
```
- title: Concise, verb-first (max 15 words)
- assigned_to: "Lutfiya Miller" | "Chris Müller" | null
- priority: "low" | "medium" | "high" | "urgent"
- effort: "quick_fix" | "moderate" | "significant"
- group_label: Short topic label (1-3 words, Title Case)
- source_text: Exact 2-4 sentence excerpt from transcript
- source_file: Filename of the transcript
- meeting_date: YYYY-MM-DD
```

#### 1C. Decisions
Extract using these criteria (aligned with MeetScript's existing schema):

A decision is a **choice between alternatives** that was resolved during the meeting. Apply the "rejected alternative" test: if you cannot identify what was rejected or what question was open, it is NOT a decision.

**Extract these:**
- Choosing between options: "Let's go with Supabase instead of Firebase"
- Resolving open questions: "We'll launch in Q2, not Q3"
- Changing direction: "We're switching from polling to WebSockets"
- Scope decisions: "Let's cut feature X from the MVP"
- Process changes: "Standups twice a week instead of daily"

**Do NOT extract:**
- Specifications or feature descriptions ("Search results should show title and snippet")
- Facts or observations
- Plans with no discussed alternative
- Simple agreements with nothing rejected
- Status updates

For each decision, capture:
```
- topic: 2-5 word label (e.g. "Auth Provider", "Launch Timeline")
- decision_text: Standalone statement of what was decided (include what was rejected)
- context: 1-2 sentences on alternatives considered and reasoning
- domain: "architecture" | "product" | "business" | "design" | "infrastructure" | "operations" | "general"
- confidence: "high" | "medium" | "low"
- source_text: Exact 2-4 sentence excerpt
- source_file: Filename of the transcript
- meeting_date: YYYY-MM-DD
```

---

### Phase 2 — Cross-Transcript Reconciliation (Aggregation Agent)

Once all sub-agents complete, a single aggregation agent collects all results and performs the following:

#### 2A. Action Item Deduplication & Status Assessment

1. **Sort** all action items chronologically by meeting_date
2. **Cluster** items that refer to the same underlying task (even if phrased differently across meetings)
3. **Assess likely status** for each unique action item:
   - `likely_done` — A later transcript mentions completion, or a subsequent meeting discusses the output of this task, or the task was clearly a short-term item from months ago
   - `likely_open` — No evidence of completion; still appears relevant
   - `superseded` — A later decision or action item replaced this one
   - `unclear` — Cannot determine status from transcripts alone
4. **Flag recurring items** — tasks mentioned in 2+ meetings that may indicate they were stuck or repeatedly deferred
5. For each cluster, select the **most specific version** as the canonical item and note which other transcripts mentioned it

#### 2B. Decision Timeline & Evolution Tracking

1. **Sort** all decisions chronologically
2. **Group** decisions by topic area
3. **Detect decision evolution** — where a later meeting revisited and changed an earlier decision:
   - Mark the earlier decision as `superseded`
   - Mark the later one as `active`
   - Note the shift in a `evolution_note` field
4. **Flag one-time decisions** — decisions that came up only once and were never revisited (these are the ones Lutfiya specifically doesn't want to miss)
5. **Flag decisions with low confidence** that may warrant re-confirmation

---

### Phase 3 — Output Document Generation

Produce a single Markdown document structured as follows:

```markdown
# MeetScript Backlog Review — Chris & Lutfiya (Dec 2025 – Feb 2026)

> Generated: [date]
> Transcripts processed: [count]
> Transcripts skipped (too short): [count]

## Executive Summary
[3-5 sentences: how many meetings, key themes, total action items found,
total decisions found, how many action items appear done vs. open]

---

## Part 1: Meeting-by-Meeting Summaries (Chronological)

### [YYYY-MM-DD] — [Brief Topic Title]
**Source:** `filename.txt` | **~XX min** | **Participants:** Chris, Lutfiya
[2-4 sentence summary]
- **Action items extracted:** X
- **Decisions extracted:** X

[Repeat for each meeting, ordered by date]

---

## Part 2: Action Item Registry

### Open / Likely Still Relevant
[Table format:]
| # | Action Item | Assigned To | Priority | Effort | Topic | First Mentioned | Source File | Notes |
|---|-------------|-------------|----------|--------|-------|-----------------|-------------|-------|

### Likely Completed
[Same table format — these are items that appear done based on transcript evidence]
| # | Action Item | Assigned To | Topic | First Mentioned | Source File | Evidence of Completion |
|---|-------------|-------------|-------|-----------------|-------------|----------------------|

### Superseded / Replaced
[Items that were overtaken by later decisions or actions]

### Recurring / Deferred Items (Appeared in 2+ Meetings)
[Items that kept coming up — potential stuck points worth discussing]

---

## Part 3: Decision Ledger (Chronological Flow)

### Decision Timeline
[For each decision, ordered by date:]

#### [YYYY-MM-DD] — [Topic Label]
> **Decision:** [decision_text]
> **Domain:** [domain] | **Confidence:** [confidence]
> **Context:** [context]
> **Source:** `filename.txt`
> **Status:** active | superseded | one-time

[If superseded, show arrow to the later decision that replaced it:]
> ⚠️ **Superseded on [date]:** [new decision text] (from `filename.txt`)

### Decision Evolution Map
[Group decisions by topic area and show how they evolved over time:]

#### Topic: [e.g. "Deployment Platform"]
1. **[date]** — [initial decision] (`source.txt`)
   ↓ *revisited*
2. **[date]** — [revised decision] (`source.txt`) ← **CURRENT**

#### Topic: [e.g. "Meeting Cadence"]
1. **[date]** — [decision] (`source.txt`) — 🟢 Never revisited (one-time)

### One-Time Decisions (Never Revisited — Review These)
[Flagged list of decisions that only appeared once and may need
re-confirmation or should be preserved as institutional knowledge]

---

## Part 4: Recommended Import Strategy

Based on this analysis, here is what we recommend:

### Import as-is (clean):
- [X] decisions that are active and well-formed
- [X] action items that are clearly still open

### Skip (do not import):
- [X] action items that are clearly completed
- [X] decisions that were superseded (only import the final version)

### Flag for manual review:
- [X] items with unclear status
- [X] recurring items that may or may not be resolved
- [X] low-confidence decisions

---

## Appendix: Transcript Manifest
[Table of all transcript files with date, word count, items extracted,
and Loom URL from _manifest.json for quick reference]
```

---

## Technical Notes for Execution

### File Locations
- **Transcripts:** `loom_transcripts_chris_lutfiya/*.txt`
- **Manifest:** `loom_transcripts_chris_lutfiya/_manifest.json` (contains Loom URLs, word counts, video IDs, dates)
- **Output:** Save the review document to the project root as `BACKLOG_REVIEW.md`

### Participant Names (Canonical Spelling)
- **Lutfiya Miller** — co-founder, technical lead. May appear as "Lutfiya", "L", or first-person narrator
- **Chris Müller** — co-founder, product & business lead. May appear as "Chris", "C", or "Chris-Steven"
- Always normalize to exactly **"Lutfiya Miller"** or **"Chris Müller"** — never use alternate spellings

### Date Inference Rules
1. First: Parse from filename prefix (e.g. `2026-01-24_chrislutfiya.txt` → 2026-01-24)
2. Second: Check `_manifest.json` for the `date` field
3. Third: Look for date references within transcript content
4. If a Loom ID file (e.g. `loom_abc123.txt`) has no date in the manifest, attempt to infer from content or place it in an "undated" group — do NOT guess

### Handling Loom-ID Files Without Dates
Many transcripts have filenames like `loom_abc123.txt` with no date prefix. Cross-reference `_manifest.json` for any available date. If truly undated, group them separately at the end and note this — they can still be processed for content but cannot be placed precisely on the timeline.

### Quality Guardrails
- If a transcript yields 0 action items AND 0 decisions, that's fine — note it as "informational/status meeting"
- If a transcript yields >15 action items, re-evaluate — you're likely including specs or decisions
- If a transcript yields >8 decisions, re-evaluate — you're likely including specs or statements
- Always prefer false negatives over false positives — it's better to miss a borderline item than to pollute the registry with noise

### Token Optimization
- Process transcripts in parallel sub-agents to maximize throughput
- Each sub-agent only needs the transcript text + the extraction criteria above
- The aggregation agent receives only the structured extractions (not raw transcripts) for Phase 2
- If any individual transcript exceeds 20,000 words, chunk it into ~10,000-word segments with 500-word overlap and extract from each segment, then deduplicate within that transcript before passing to aggregation
