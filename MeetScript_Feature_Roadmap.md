# MeetScript → Co-Founder Command Center
## Feature Roadmap & Strategic Vision

*Prepared for Lutfiya Miller & Chris Müller — March 2026*

---

## Executive Summary

MeetScript already solves the *recording* problem — you'll never lose what was said. The next leap is solving the *remembering, anticipating, and accelerating* problems. The features below transform MeetScript from a searchable archive into an opinionated co-founder intelligence layer that proactively surfaces the right context at the right moment, holds both of you accountable to your own commitments, and turns 200+ meetings of institutional memory into a strategic asset that compounds weekly. The design philosophy throughout: Claude acts as your silent third co-founder — one who has perfect recall, zero ego, and works the overnight shift between your time zones.

---

## Feature Cards

---

### 1. Decision Ledger

**One-line pitch:** Every decision you've ever made, auto-extracted, searchable, and surfaced *before* you re-debate it.

**The problem it solves:** Co-founders re-litigate settled decisions constantly — not from disagreement, but from forgetting. "Didn't we already decide to use Stripe for the LMS payments?" wastes 10–20 minutes per meeting and erodes confidence in your own process. With 200+ meetings, the corpus of forgotten decisions is massive.

**How it works technically:**

- **Extraction pass:** Run a one-time Claude batch job over all existing transcripts in the `transcripts` table, plus a real-time extraction step in the Cloud Run worker for new transcripts. Prompt Claude to identify *decisions* (distinct from action items) — things like "we decided X," "we're going with Y," "let's do Z." Extract: decision text, topic/domain, date, confidence level, relevant context quote.
- **New table:** `decisions` — columns: `id`, `transcript_id`, `decision_text`, `domain` (enum: architecture, product, business, design, ops), `decided_at`, `participants`, `confidence` (high/medium/low), `superseded_by` (self-referencing FK for decision chains), `embedding` (vector 1536).
- **RAG integration:** When a user asks a question via "Ask AI," include a decision-similarity search alongside chunk similarity. If the query matches a prior decision with cosine > 0.82, Claude's response leads with: *"Note: You decided on [date] that [decision]. Here's the context..."*
- **Decision conflict detection:** When a new decision is extracted that has high similarity (>0.88) to an existing one but different content, flag it as a potential reversal and log it in the `activity_log`.
- **UI:** A filterable ledger page grouped by domain, with a timeline view showing decision evolution. Each decision links back to the exact transcript moment.

**Why it compounds:** Every new meeting adds to the ledger. After 6 months, you have a living constitution of your product. After a year, new team members can onboard by reading the decision history instead of sitting through months of meetings. Decision chains show *how your thinking evolved* — invaluable for investor narratives and retrospectives.

**Effort estimate:** L (20–25 hrs) — batch extraction, new table + migrations, RAG integration, UI

**Priority:** **Must-have** — This is the single highest-leverage feature. Re-debating decisions is the #1 time sink in co-founder meetings, and this directly leverages your existing transcript corpus.

---

### 2. Pre-Meeting Brief

**One-line pitch:** 30 minutes before every Google Meet, you each get a personalized briefing doc with everything you need to hit the ground running.

**The problem it solves:** The first 15 minutes of most co-founder calls are spent asking "where were we?" and "what did you get done?" That's 15 minutes × 4 calls/week × 52 weeks = 52 hours/year of pure warm-up overhead. Across time zones, this is worse — you can't casually ask "hey, what's the status on X?" during the day.

**How it works technically:**

- **Trigger:** Cloud Scheduler fires a Cloud Run job 30 minutes before each recurring Google Meet (read from Google Calendar API, or a simple config table of meeting times).
- **Brief generation:** The job queries:
  - `action_items WHERE status IN ('pending','in_progress') AND assignee = [each founder]` — their open items
  - `action_items WHERE status = 'pending' AND due_date < NOW()` — overdue items for both
  - `action_items WHERE updated_at > [last_meeting_date]` — items that changed since last call
  - `decisions WHERE decided_at > [last_meeting_date]` — recent decisions to confirm
  - The last transcript's extracted topics (from `transcript_chunks` similarity search against a "what were we working on" query)
- **Claude synthesis:** Feed all of this to Claude with a prompt: *"Generate a concise pre-meeting brief for [Lutfiya/Chris]. Lead with: (1) their overdue items, (2) items the other person completed since last meeting, (3) open questions/parked topics from last session, (4) suggested agenda based on priorities."*
- **Delivery:** Send via email (Supabase Edge Function → SendGrid/Resend) or render as a pinned card on the MeetScript dashboard. Include a "Meeting #247 Brief" header with the date.
- **Post-meeting feedback loop:** After the meeting transcript is processed, compare what was actually discussed vs. what the brief suggested. Over time, tune the brief to match actual meeting patterns.

**Why it compounds:** The brief gets smarter with every meeting. After 20 meetings with feedback, it learns which topics you consistently discuss, which ones you skip, and what priority ordering matches your real behavior. It also creates a forcing function: seeing your overdue items in writing 30 minutes before a call is a powerful nudge.

**Effort estimate:** M (8–12 hrs) — Calendar integration, query composition, Claude prompt, email delivery

**Priority:** **Must-have** — Immediate, tangible time savings on every single call. Low complexity, high visibility.

---

### 3. Drift Detector

**One-line pitch:** Spots when you keep talking about something but never actually do it — and calls you out.

**The problem it solves:** "Strategic drift" — where a topic comes up in meeting after meeting without resolution or action. You both *feel* busy, but certain initiatives quietly stall for weeks. Neither of you notices because each individual meeting feels productive. This is especially dangerous across time zones where you can't see each other's day-to-day work.

**How it works technically:**

- **Topic extraction:** Extend the existing Claude extraction step to also identify *topics discussed* (beyond action items). Store in a new table: `meeting_topics` — columns: `id`, `transcript_id`, `topic_label`, `topic_summary`, `first_mentioned_date`, `mention_count`, `last_action_item_id` (FK), `embedding`.
- **Drift analysis:** Weekly Cloud Scheduler job runs a drift analysis:
  1. Query `meeting_topics` grouped by `topic_label` similarity (cluster embeddings with cosine > 0.85).
  2. For each cluster, check: how many meetings mentioned it? Is there a linked `action_item` with status `completed`? What's the ratio of mentions to completions?
  3. Flag clusters where: mentions ≥ 3 AND completed_actions = 0 AND last_mention within 2 weeks. These are "drifting topics."
- **Claude narration:** Feed drifting topics to Claude: *"These topics have been discussed in [N] meetings over [timeframe] without resolution. For each, write a one-sentence summary of what keeps being said and a suggested next action to break the logjam."*
- **UI:** A "Drift Report" section on the dashboard — red/yellow/green cards. Red = discussed 5+ times with no action. Yellow = discussed 3+ times. Green = topic introduced and resolved within 2 meetings. Include a "Resolve" button that either creates an action item or marks it as intentionally deferred.

**Why it compounds:** Historical drift data reveals your organizational patterns. After 6 months you can see: "We always stall on infrastructure decisions" or "Design topics resolve fast but backend topics linger." This meta-awareness changes how you structure discussions.

**Effort estimate:** L (15–20 hrs) — Topic extraction pipeline, clustering logic, weekly job, UI

**Priority:** **High-value** — This is the accountability feature that no human co-founder will do for themselves. It surfaces invisible problems.

---

### 4. Async Handoff Notes

**One-line pitch:** End-of-day summaries that bridge the time zone gap — what you did, what's blocked, what the other person should pick up.

**The problem it solves:** With US/Europe time zones, there's a ~6-hour window where one founder is working and the other is asleep. Progress happens, decisions get made locally, and context is lost. The next meeting starts with 10 minutes of "so here's what I did yesterday..." This is the cross-timezone tax.

**How it works technically:**

- **Input methods:** (a) A simple text box in the MeetScript dashboard ("End of day notes"), (b) a Slack/email integration where you can forward a quick voice memo or text, (c) or capture from a Loom recording (you already support Loom imports).
- **Processing:** Notes hit the same Cloud Run worker pipeline as transcripts — chunked, embedded, stored in `transcript_chunks` (with a `type: 'handoff'` discriminator). Claude extracts any implicit action items or decisions.
- **Smart delivery:** When the other founder starts their day (inferred from timezone config), surface the handoff note as a dashboard notification and optional email. Include: what was done, what's blocked (with suggested unblocking actions), and what to pick up.
- **RAG integration:** Handoff notes are searchable alongside meeting transcripts. "What did Chris work on last Tuesday?" returns both meeting discussions and his handoff note.
- **Table extension:** Add `source_type ENUM ('google_meet', 'loom', 'manual', 'handoff')` to the `transcripts` table (or extend existing field).

**Why it compounds:** Over time, handoff notes create a daily log of development progress that's far richer than git commits. Combined with meeting transcripts, you get complete coverage: meetings capture *decisions and discussions*, handoff notes capture *execution and context*. The RAG system becomes omniscient.

**Effort estimate:** M (8–10 hrs) — Input UI, processing pipeline extension, timezone-aware delivery

**Priority:** **Must-have** — Directly attacks the #1 structural friction (timezone gap) with minimal complexity.

---

### 5. Commitment Scorecard

**One-line pitch:** A transparent, no-BS scoreboard of who committed to what and whether they delivered.

**The problem it solves:** Soft accountability. You both make commitments in meetings, but there's no system tracking *follow-through rate*. Over time, this leads to either (a) resentment ("I always do my items, Chris doesn't") or (b) learned helplessness ("nobody follows through so why bother assigning"). Neither is spoken aloud, both are toxic.

**How it works technically:**

- **Data source:** The `action_items` table already has `assignee`, `status`, `created_at`, and `due_date`. This feature is primarily a *view layer* over existing data.
- **Metrics calculation:** Supabase SQL views or Edge Functions computing per-founder:
  - Completion rate (completed / total assigned, rolling 30/60/90 days)
  - On-time rate (completed before due_date / total completed)
  - Average time-to-completion by priority level
  - Items currently overdue (count + age)
  - "Carry-over rate" — items that were open at the start of the period and are still open
- **Comparative view:** Side-by-side scorecard for both founders. Not competitive — informational. Frame as "team health metrics."
- **Trend lines:** Chart.js or Recharts line graphs showing completion rate over time. Annotate with significant events ("shipped v2.0," "conference week").
- **Claude commentary:** Monthly, feed the scorecard data to Claude and ask for a candid 3-sentence assessment: *"Lutfiya's completion rate dropped from 78% to 61% this month, primarily in 'Database' tasks. Chris completed 12/14 items but 8 were low-priority. Suggest: re-prioritize Lutfiya's DB items and promote Chris's high-priority backlog."*
- **UI:** Dedicated "Scorecard" tab on the dashboard, co-founder avatars, clean stat cards, sparklines.

**Why it compounds:** Behavioral change. When you see your completion rate, you start committing more carefully and following through more consistently. The trend lines show whether you're improving. After 6 months, you have hard data for any "are we working effectively?" conversation — no feelings, just numbers.

**Effort estimate:** M (10–12 hrs) — SQL views, metrics API, dashboard UI, Claude commentary

**Priority:** **High-value** — Leverages existing data entirely. High impact on co-founder dynamics and accountability.

---

### 6. Smart Agenda Generator

**One-line pitch:** Auto-generates your next meeting's agenda by analyzing what's overdue, what's drifting, and what needs a decision.

**The problem it solves:** Meetings without agendas meander. Meetings with manually written agendas take 15 minutes to prepare and still miss things. You need an agenda that's *derived from the actual state of your work*, not from memory.

**How it works technically:**

- **Trigger:** Runs as part of the Pre-Meeting Brief pipeline (Feature #2), or on-demand via a "Generate Agenda" button.
- **Inputs:** Queries the same data sources as the Pre-Meeting Brief, plus:
  - Drift Detector output (Feature #3) — topics that need resolution
  - Decision Ledger (Feature #1) — pending decisions or recently reversed ones
  - `action_items WHERE status = 'pending' AND priority = 'high'` — high-priority open work
  - Time since last discussion of each `group_label` in action items
- **Claude generation:** Prompt: *"Based on the following context, generate a prioritized 6-item meeting agenda for a 45-minute co-founder sync. Each item should have: topic, why it's on the agenda (data-driven reason), suggested time allocation, and desired outcome (decision, update, or brainstorm). Prioritize: (1) overdue blockers, (2) drifting topics, (3) upcoming deadlines, (4) strategic items that haven't been discussed in 2+ weeks."*
- **Interactive UI:** Agenda renders as a sortable list. Each founder can upvote/downvote items or add their own. Final agenda is saved and compared post-meeting to what was actually discussed (feeds back into the brief's learning loop).
- **Calendar integration:** Optionally push the agenda to the Google Calendar event description so it's visible in the Meet waiting room.

**Why it compounds:** Over time, the agenda generator learns your meeting rhythm. It notices that you always discuss "Raggy" first and "design" last. It learns that 45-minute agendas with 8 items never finish, but 5 items do. The feedback loop between generated agendas and actual discussions makes each agenda better than the last.

**Effort estimate:** S–M (6–8 hrs) — Mostly prompt engineering + UI, builds on Pre-Meeting Brief infrastructure

**Priority:** **High-value** — Directly improves meeting quality. Low effort if Pre-Meeting Brief is built first.

---

### 7. Topic Radar

**One-line pitch:** A visual map showing which parts of ScienceExperts.ai are getting attention and which are being neglected.

**The problem it solves:** When you're deep in building, you develop tunnel vision. You spend 3 weeks talking about the payment system and completely forget about the onboarding flow. There's no bird's-eye view of where your *attention* is going vs. where it *should* be going based on your roadmap.

**How it works technically:**

- **Topic taxonomy:** Define a lightweight taxonomy of ScienceExperts.ai domains: Authentication, LMS, Events, Gamification, Payments/Stripe, Community, Translation/DeepL, Infrastructure, Design, Marketing, Ops. Store in a `topic_domains` config table.
- **Auto-classification:** During transcript processing, Claude classifies each chunk's primary domain (using the taxonomy). Store as `domain` on `transcript_chunks`. Also classify `action_items` by domain.
- **Radar computation:** Weekly aggregation — for each domain, compute: discussion minutes (chunk count × avg chunk duration), action items created, action items completed, days since last mention.
- **Visualization:** A radar/spider chart (Recharts RadarChart) showing attention distribution across domains. Overlay with a "target" distribution (manually set by you — e.g., "LMS should be 30% of our focus this quarter"). Gaps between actual and target are immediately visible.
- **Alerts:** If a domain drops to zero mentions for 2+ weeks and has open action items, trigger an `activity_log` alert: "⚠️ No discussion of Gamification in 18 days — 4 open items."
- **Historical view:** Stacked area chart showing attention distribution over time. See exactly when you pivoted focus from "Infrastructure" to "LMS."

**Why it compounds:** Creates strategic self-awareness. After a quarter, you can see: "We spent 40% of our meeting time on Payments but it's only 15% of the product." This data informs resource allocation, hiring decisions, and roadmap prioritization. It's the kind of insight that usually requires a VP of Product to surface.

**Effort estimate:** M (10–14 hrs) — Classification pipeline, aggregation queries, radar chart UI, alert logic

**Priority:** **High-value** — Unique strategic insight that no other tool provides. Directly applicable to roadmap planning.

---

### 8. Meeting Replay Clips

**One-line pitch:** Jump to the exact moment in a meeting where a specific decision, task, or topic was discussed.

**The problem it solves:** You know you discussed the Stripe webhook architecture "a few weeks ago" but you can't find it. Full-text search returns 12 transcript matches across 8 meetings. You need *precision* — the exact 2-minute window where the key discussion happened, with surrounding context.

**How it works technically:**

- **Timestamp alignment:** Your transcript chunks already have positional data. Enhance the `transcript_chunks` table with `start_offset` and `end_offset` (character positions in the original transcript). For VTT/SBV formats, extract actual timestamps during parsing.
- **Clip generation:** When a user finds a relevant chunk via RAG or browsing, render a "clip view" — the matched chunk plus 2 chunks before and after, with speaker labels highlighted and timestamps shown.
- **Deep linking:** Each clip gets a stable URL: `/meetings/[id]/clip/[chunk_id]`. These URLs are embedded in action items (`source_text` already exists — enhance it to `source_chunk_id` FK), decisions, and search results.
- **Contextual clips in RAG:** When "Ask AI" returns an answer, include clip links for each source. Instead of "Based on your meeting on March 1st...", say "Based on [this discussion about Stripe webhooks →] from March 1st..."
- **UI:** A transcript viewer with a highlighted "clip" region, collapsible context above and below, and speaker-color-coded text. If timestamp data exists, show a timeline scrubber.

**Why it compounds:** Every feature that references a transcript moment (decisions, action items, drift reports, search results) becomes more useful with clip links. It's infrastructure that multiplies the value of everything else. Over 200+ meetings, the ability to jump to the exact moment transforms your corpus from "searchable" to "navigable."

**Effort estimate:** M (8–12 hrs) — Timestamp extraction enhancement, clip viewer UI, deep linking

**Priority:** **High-value** — Foundational UX improvement that amplifies every other feature.

---

### 9. Weekly Pulse Report

**One-line pitch:** Every Monday morning, both founders get a Claude-written report on last week's momentum, this week's priorities, and emerging risks.

**The problem it solves:** There's no regular cadence of reflection. You're always sprinting forward. Without a weekly synthesis, patterns go unnoticed: "We've been blocked on the same infrastructure issue for 3 weeks" or "We completed 22 action items last week — that's a record."

**How it works technically:**

- **Trigger:** Cloud Scheduler, Monday 7am in each founder's timezone.
- **Data collection:** Query the past 7 days across all tables:
  - Meetings held (count, total duration, topics covered)
  - Action items created / completed / overdue
  - Decisions made (from Decision Ledger)
  - Drift alerts triggered
  - Scorecard deltas (completion rate change)
  - Topic Radar shifts (any domain attention changes > 15%)
- **Claude synthesis:** A carefully crafted prompt that produces a structured-but-readable weekly report:
  - **Momentum summary:** 2–3 sentences on overall velocity
  - **Wins:** What shipped or resolved
  - **Risks:** What's stalling, overdue, or drifting
  - **This week's priorities:** Top 5 action items by impact, with suggested owner
  - **One insight:** Something non-obvious from the data ("You've had 4 meetings about translation but no action items — is this blocked or just exploratory?")
- **Delivery:** Email + dashboard notification. Store the report in a `weekly_reports` table for historical access.
- **Feedback loop:** Each report has a 👍/👎 at the bottom. Track which sections get engaged with to tune future reports.

**Why it compounds:** Weekly reports create a rhythm of reflection. After 3 months, you have 12 weekly snapshots that tell the story of your product's development better than any retrospective. The "One Insight" section is where Claude earns its keep — pattern detection across weeks that you'd never see in the daily grind.

**Effort estimate:** M (8–10 hrs) — Mostly data aggregation + prompt engineering + email template

**Priority:** **Must-have** — Low effort, high impact, creates a cadence of accountability. Build this right after Pre-Meeting Brief since they share infrastructure.

---

### 10. Context Resurrector

**One-line pitch:** When you mention a topic, instantly surface everything you've ever said about it — organized chronologically with decisions, actions, and status.

**The problem it solves:** "What was our latest thinking on the gamification system?" Currently, answering this requires: (1) searching transcripts, (2) reading through multiple results, (3) mentally piecing together the timeline, (4) checking which action items are still open. That's 10+ minutes of archaeology. The Context Resurrector does it in 2 seconds.

**How it works technically:**

- **Trigger:** A dedicated UI component — a "Topic Deep Dive" search bar (distinct from the general "Ask AI"). Also triggerable from any topic tag/label throughout the app.
- **Query pipeline:**
  1. Take the topic query, embed it, and search `transcript_chunks` for all chunks with cosine > 0.78.
  2. Group results by transcript (meeting date).
  3. For each meeting, also pull: related `action_items`, related `decisions` (from Feature #1), and related `meeting_topics` (from Feature #3).
  4. Sort chronologically.
- **Claude synthesis:** Feed the full chronological bundle to Claude: *"Create a 'Topic Timeline' for [query]. For each meeting where this was discussed, summarize: what was said, what was decided, what actions were assigned, and current status of those actions. End with a 'Current State' section that synthesizes where things stand today."*
- **UI:** A timeline view — vertical line with meeting nodes. Each node expands to show the summary, linked decisions, and action items (with current status badges). The "Current State" card is pinned at the top.
- **Caching:** Cache frequently accessed topic timelines in a `topic_cache` table (invalidate when new transcripts mentioning the topic are processed).

**Why it compounds:** This is the feature that makes your 200+ meeting corpus *truly* accessible. Without it, old meetings are archives. With it, every past discussion is instantly available context. The more meetings you have, the more valuable this becomes — it's an anti-entropy feature.

**Effort estimate:** L (15–20 hrs) — Multi-table query orchestration, Claude synthesis, timeline UI

**Priority:** **High-value** — Transforms the value proposition of the entire transcript corpus. Build after Decision Ledger for maximum impact.

---

### 11. Stale Item Reaper

**One-line pitch:** Automatically detects zombie action items — tasks that have been "pending" so long they're probably irrelevant — and asks you to kill or revive them.

**The problem it solves:** Action item lists grow monotonically. Old items from 3 months ago sit at the bottom of the Kanban board, creating noise and guilt. Nobody explicitly closes them because "maybe we'll get to it." The backlog becomes a graveyard that everyone ignores, which means *new* items also start getting ignored.

**How it works technically:**

- **Detection rules** (configurable):
  - Pending for > 30 days with no status change → "Stale"
  - Pending for > 60 days → "Zombie"
  - Mentioned in a meeting within the last 2 weeks but still no progress → "Stuck" (different from stale — it's actively being discussed but not moved)
- **Reaper job:** Weekly Cloud Scheduler job queries `action_items` with these rules. Groups results by `group_label`.
- **Claude triage:** For each zombie/stale item, Claude assesses: *"Given the current project state and recent meeting discussions, is this item: (a) still relevant and should be re-prioritized, (b) superseded by another item or decision, (c) no longer relevant and should be archived?"* Claude provides a recommendation with reasoning.
- **UI:** A "Backlog Health" card on the dashboard showing stale/zombie/stuck counts. Clicking opens a triage view where you can bulk-accept Claude's recommendations (archive, re-prioritize, or keep) with one click per item.
- **Auto-archive:** Items marked zombie for 2 consecutive weeks without intervention get auto-archived (soft delete, recoverable) with an `activity_log` entry.

**Why it compounds:** Keeps your action item system trustworthy. A clean backlog means the Kanban board, scorecard, and pre-meeting briefs all stay accurate and useful. This is a maintenance feature that preserves the value of every other feature.

**Effort estimate:** S–M (5–8 hrs) — Detection queries, Claude triage prompt, bulk action UI

**Priority:** **High-value** — Essential hygiene that keeps the entire system healthy. Low effort.

---

### 12. Meeting Pattern Analyzer

**One-line pitch:** Learns how your meetings *actually* work — duration patterns, topic flow, decision density — and suggests structural improvements.

**The problem it solves:** You've had 200+ meetings but no meta-analysis of *how* you meet. Are your meetings getting longer? Are you making fewer decisions per meeting? Do Monday meetings produce more action items than Friday ones? Without data, you can't optimize your meeting practice.

**How it works technically:**

- **Data already exists:** `transcripts` has timestamps and duration. `action_items` and `decisions` have `transcript_id` links. `transcript_chunks` have speaker attribution.
- **Metrics computation:** Supabase SQL views:
  - Average meeting duration (rolling 30 days, trend)
  - Decisions per meeting (from Decision Ledger)
  - Action items per meeting
  - Speaking ratio (Lutfiya chunks vs. Chris chunks per meeting)
  - Topic diversity per meeting (unique `group_labels` discussed)
  - "Resolution rate" — topics raised and resolved within the same meeting vs. carried over
  - Day-of-week and time-of-day correlations with productivity metrics
- **Claude insights (monthly):** Feed 30 days of metrics to Claude: *"Analyze these meeting patterns for two co-founders. Identify: (1) the most productive meeting conditions, (2) any concerning trends, (3) specific suggestions to improve meeting efficiency. Be data-driven and specific."*
- **UI:** A "Meeting Intelligence" page with stat cards, trend charts, and Claude's monthly analysis. Include a "Meeting Score" for each individual meeting (composite of decisions made + items created + resolution rate).

**Why it compounds:** Meta-learning about your collaboration style. After 6 months, you know empirically that your Tuesday afternoon meetings are 2× more productive than Friday ones, or that meetings over 50 minutes have diminishing returns. This shapes your calendar, not just your meetings.

**Effort estimate:** M (10–12 hrs) — SQL aggregations, visualization, monthly Claude analysis

**Priority:** **Nice-to-have** — Valuable but not urgent. Best built after you have the Decision Ledger and Scorecard generating the input data.

---

### 13. GitHub Bridge

**One-line pitch:** Connects meeting discussions to actual code — see which conversations led to which PRs, and which PRs were never discussed.

**The problem it solves:** Meetings produce intentions. Code produces reality. There's no connection between the two. You discuss "refactor the auth module" in a meeting, Chris pushes a PR two days later, but the action item sits as "pending" because nobody manually updated it. Meanwhile, PRs land that were never discussed — silent scope changes that the other founder doesn't know about.

**How it works technically:**

- **GitHub webhook listener:** Add a Cloud Run endpoint that receives GitHub push/PR webhooks. Store events in a `github_events` table: `id`, `type` (pr_opened, pr_merged, push), `repo`, `branch`, `title`, `description`, `author`, `created_at`, `embedding` (embed PR title + description).
- **Auto-linking:** When a new GitHub event arrives, compute cosine similarity between its embedding and recent `action_items` embeddings. If similarity > 0.80, suggest a link. Store in `action_item_github_links` junction table.
- **Auto-status update:** When a linked PR is merged, prompt: should the action item be marked complete? Surface as a one-click confirmation in the UI.
- **Unlinked PR detection:** PRs with no matching action item or transcript discussion get flagged in the Activity Feed: "🔔 Chris merged 'Add payment retry logic' — this wasn't discussed in any recent meeting."
- **UI enhancements:** Action items show linked PRs with status badges. A "Dev Activity" panel on the dashboard shows recent GitHub activity alongside meeting discussions.

**Why it compounds:** Closes the loop between discussion and execution. Over time, you build a complete map of "idea → discussion → decision → code → ship." This is invaluable for understanding your development velocity and for any future team members or investors who want to see how the sausage gets made.

**Effort estimate:** L (20–25 hrs) — Webhook setup, embedding pipeline, linking logic, UI integration

**Priority:** **High-value** — Bridges the meeting/code gap, which is the core value prop for a dev-focused command center. Build in Phase 2 after core features stabilize.

---

### 14. Quarterly Strategy Review

**One-line pitch:** Every quarter, Claude generates a comprehensive review of your product's evolution — what you planned, what you built, how your strategy shifted, and what to focus on next.

**The problem it solves:** You never stop to zoom out. Every meeting is tactical. Every week is a sprint. But the strategic questions — "Are we building the right thing?" "Has our vision changed?" "Where are we vs. 3 months ago?" — only get asked in crisis moments. A quarterly review forces the zoom-out.

**How it works technically:**

- **Trigger:** Manual (button click) or scheduled at quarter-end.
- **Data aggregation:** Pull 90 days of:
  - All decisions from Decision Ledger, grouped by domain
  - Action item completion stats from Scorecard
  - Topic Radar data showing attention shifts
  - Drift Detector historical alerts
  - Meeting Pattern Analyzer trends
  - Key RAG-retrieved themes (embed "What were the major themes of Q1 2026?" and retrieve top chunks)
- **Claude deep analysis:** A long-form prompt producing a structured quarterly review:
  - **Executive summary** (what happened in 3 sentences)
  - **Strategic shifts** (how your priorities changed and why)
  - **Velocity analysis** (what accelerated, what stalled)
  - **Decision audit** (major decisions made, any reversals, decisions still pending)
  - **Risk register** (ongoing risks from Drift Detector, overdue items, neglected domains)
  - **Recommendations** (3–5 specific suggestions for next quarter, data-driven)
- **Output:** Generated as a downloadable PDF/markdown report + stored in `quarterly_reviews` table. Can also render as an interactive dashboard page.

**Why it compounds:** Each quarterly review references the previous one. After a year, you have a four-chapter story of your product's development. This is the kind of artifact that transforms a scrappy startup into a well-documented company. It's also incredibly useful for fundraising narratives.

**Effort estimate:** M–L (12–16 hrs) — Aggregation across multiple feature tables, complex Claude prompt, report generation

**Priority:** **Nice-to-have** — Depends on several other features being built first. Schedule for Phase 3.

---

### 15. Proactive Conflict Detector

**One-line pitch:** Spots when you and Chris said contradictory things in different meetings — before it becomes a real problem.

**The problem it solves:** In cross-timezone work, each founder sometimes makes local decisions or states positions that conflict with what the other said in a previous meeting. "Lutfiya told the designer we're using Tailwind components, but Chris told the backend team we're going with custom CSS-in-JS." These conflicts simmer until they surface as bugs, rework, or arguments.

**How it works technically:**

- **Detection pipeline:** During transcript processing, Claude identifies *stated positions* — opinions, commitments, or technical choices attributed to a specific speaker. Store in a `stated_positions` table: `id`, `transcript_id`, `speaker`, `position_text`, `domain`, `embedding`, `stated_at`.
- **Conflict check:** When a new position is extracted, compute similarity against all existing positions from the *other* speaker. If cosine > 0.85 (same topic) but Claude determines the positions are contradictory (via a classification prompt), flag as a potential conflict.
- **Severity assessment:** Claude rates conflict severity: Low (preference difference), Medium (approach disagreement), High (directly contradictory commitments to external parties).
- **Alert:** High-severity conflicts trigger an immediate notification. Medium conflicts appear in the Weekly Pulse Report. Low conflicts are logged in `activity_log` for reference.
- **Resolution tracking:** Each conflict gets a status: detected → discussed → resolved. The Pre-Meeting Brief includes unresolved conflicts as agenda items.

**Why it compounds:** Builds a map of where you and Chris align and diverge. Over time, you learn which domains tend to generate disagreement (and can proactively discuss those). Prevents the slow accumulation of misalignment that kills co-founder relationships.

**Effort estimate:** L (18–22 hrs) — Position extraction, contradiction detection, severity classification, alert system

**Priority:** **Nice-to-have** — Powerful but complex. Best built after the Decision Ledger and core extraction pipeline are mature. Phase 3.

---

## Implementation Roadmap

### Phase 1: Foundation (Weeks 1–3)
*Goal: Immediate daily value + data infrastructure for everything else*

| Order | Feature | Effort | Rationale |
|-------|---------|--------|-----------|
| 1 | **Pre-Meeting Brief** (#2) | M | Instant daily value. Establishes the calendar integration and query patterns used by 5+ other features. |
| 2 | **Decision Ledger** (#1) | L | The single highest-leverage feature. Batch process existing 200+ transcripts to populate historical decisions. Every subsequent feature references this data. |
| 3 | **Async Handoff Notes** (#4) | M | Directly solves the timezone pain. Extends existing pipeline with minimal new infrastructure. |
| 4 | **Weekly Pulse Report** (#9) | M | Shares delivery infrastructure with Pre-Meeting Brief. Creates the weekly accountability cadence. |

### Phase 2: Accountability & Intelligence (Weeks 4–7)
*Goal: Close the accountability loop, add strategic awareness*

| Order | Feature | Effort | Rationale |
|-------|---------|--------|-----------|
| 5 | **Commitment Scorecard** (#5) | M | Pure view layer over existing `action_items` data. High behavioral impact. |
| 6 | **Stale Item Reaper** (#11) | S–M | Essential hygiene that keeps the Scorecard and Kanban accurate. |
| 7 | **Smart Agenda Generator** (#6) | S–M | Builds on Pre-Meeting Brief infrastructure. Improves every future meeting. |
| 8 | **Drift Detector** (#3) | L | Requires topic extraction pipeline. Produces the "drifting topics" data used by Agenda Generator and Pulse Report. |
| 9 | **Topic Radar** (#7) | M | Uses the topic classification from Drift Detector. Adds strategic layer. |

### Phase 3: Deep Intelligence & Integrations (Weeks 8–12)
*Goal: Leverage the full corpus, connect to external systems*

| Order | Feature | Effort | Rationale |
|-------|---------|--------|-----------|
| 10 | **Context Resurrector** (#10) | L | Maximum value once Decision Ledger and Drift Detector are populating data. |
| 11 | **Meeting Replay Clips** (#8) | M | UX infrastructure that improves every other feature's linking. |
| 12 | **GitHub Bridge** (#13) | L | Closes the meeting-to-code loop. Requires webhook infrastructure. |
| 13 | **Meeting Pattern Analyzer** (#12) | M | Needs several months of enriched data to be meaningful. |
| 14 | **Quarterly Strategy Review** (#14) | M–L | Depends on most other features for input data. |
| 15 | **Proactive Conflict Detector** (#15) | L | Most complex NLP task. Benefits from mature extraction pipeline. |

---

## Compounding Effects Map

The real power of this system isn't any individual feature — it's how they reinforce each other. Here's the dependency and amplification graph:

### Data Layer Compounding
```
Transcript Processing (existing)
  ├─→ Decision Ledger (#1) ─→ feeds Pre-Meeting Brief, Agenda, Conflict Detector
  ├─→ Topic Extraction (#3) ─→ feeds Drift Detector, Topic Radar, Context Resurrector
  ├─→ Action Items (existing) ─→ feeds Scorecard, Reaper, Pulse Report
  └─→ Stated Positions (#15) ─→ feeds Conflict Detector
```

### Intelligence Layer Compounding
```
Pre-Meeting Brief (#2)
  + Decision Ledger (#1) = "You decided this already"
  + Drift Detector (#3) = "This has been stuck for 3 weeks"
  + Scorecard (#5) = "You have 4 overdue items"
  + Conflict Detector (#15) = "You and Chris disagree on this"
  = A brief that makes every meeting 3× more productive
```

### Accountability Loop
```
Meeting → Action Items → Scorecard (#5)
  ↓                         ↓
Stale Item Reaper (#11)   Pulse Report (#9)
  ↓                         ↓
Clean backlog            Weekly reflection
  ↓                         ↓
  └──→ Better next meeting ←┘
```

### Strategic Awareness Loop
```
Daily meetings → Topic Radar (#7) → Attention gaps identified
                                      ↓
            Quarterly Review (#14) ← Drift Detector (#3) → Agenda Generator (#6)
                    ↓
              Strategic correction → Better meeting topics → ...
```

### The Corpus Flywheel
Every meeting makes every feature more valuable:
- More meetings → richer Decision Ledger → fewer re-debates → shorter meetings
- More meetings → better Topic Radar → better attention allocation → more focused meetings
- More meetings → smarter Pre-Meeting Briefs → less warm-up time → more productive meetings
- More meetings → more pattern data → better Meeting Analyzer insights → optimized meeting structure

**The endgame:** After 6 months of all features running, MeetScript knows your product, your process, your patterns, and your blind spots better than either of you individually. It becomes the institutional memory that makes your two-person team operate like a well-oiled six-person team.

---

*Total estimated effort: ~160–200 hours across all features*
*Phase 1 alone (4 features): ~35–45 hours — achievable in 2–3 focused weeks*
