# MeetScript Feature Ideation Prompt — Claude Opus 4.6

> **Purpose**: Generate high-impact new features for the MeetScript pipeline that help two co-founders (Lutfiya Miller & Chris Müller) manage the ongoing development of ScienceExperts.ai — a self-hosted community platform for scientists with integrated LMS, events, and gamification.

---

## System Prompt

You are a senior product strategist and systems architect specializing in developer productivity tools, co-founder collaboration systems, and AI-augmented project management. You think in systems — not just features — and you design for compounding value over time.

---

## Prompt

I'm one of two co-founders building **ScienceExperts.ai**, a self-hosted community platform for scientists and researchers (Next.js 16, React 19, Prisma, PostgreSQL, Stripe, DeepL translation). My co-founder Chris Müller and I hold regular Google Meet calls to coordinate development, make decisions, and assign work.

We built **MeetScript** — a full-stack meeting intelligence pipeline that:

### What It Does Today
- **Automatically ingests** Google Meet transcripts from Gmail (via Pub/Sub → Cloud Run worker)
- **Extracts text** from 3 formats: inline HTML, Google Docs links, and attachments (.txt/.vtt/.sbv), plus manual uploads and Loom imports
- **Generates vector embeddings** (OpenAI text-embedding-3-small, 1536-dim) and stores them in Supabase pgvector
- **RAG-powered "Ask AI"** — conversational search across all meeting history using Claude Sonnet 4 + cosine similarity retrieval
- **AI action item extraction** — Claude reads each transcript and extracts tasks, commitments, deliverables, and follow-ups with assignee detection, priority inference, effort estimation, and smart topic grouping
- **Kanban board** — action items organized by group/project (e.g., "Website", "Raggy", "Database") with filters for assignee, priority, effort, status, and duplicate detection
- **Meeting calendar + scoreboard** — heatmap visualization, monthly/all-time stats, co-founder collaboration analytics (meetings together vs. solo, streaks, cadence tracking)
- **Activity feed** — unified event stream for all system actions
- **Processing log** — full audit trail of ingestion attempts

### Tech Stack
- **Frontend**: Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS (glassmorphism dark theme)
- **Worker**: Node.js/Express on Cloud Run
- **Database**: Supabase (PostgreSQL + pgvector)
- **AI**: Claude Sonnet 4 (extraction + RAG), OpenAI (embeddings)
- **Monorepo**: Turborepo with shared TypeScript types package

### Database Tables
- `transcripts` — full meeting records with metadata
- `transcript_chunks` — 500-token chunks with vector embeddings
- `action_items` — tasks with assignee, priority, effort, group_label, status, due_date, source_text, dedup flags
- `activity_log` — unified event stream (JSONB metadata)
- `processing_log` — ingestion audit trail

### What's Partially Built / Planned
- Action-aware RAG (include action items in query context)
- Weekly email digests
- Overdue item notifications
- ScienceExperts.ai brand reskin

---

### Your Task

Propose **10–15 new features** that would transform MeetScript from a transcript archive into an indispensable co-founder command center for managing ScienceExperts.ai development. For each feature, provide:

1. **Feature name** — short, memorable
2. **One-line pitch** — what it does in plain language
3. **The problem it solves** — specific pain point for two busy co-founders working across time zones
4. **How it works technically** — concrete implementation approach using the existing stack (Supabase, Claude, pgvector, Next.js, Cloud Run). Reference specific tables, APIs, or patterns already in the codebase where relevant.
5. **Why it compounds** — how this feature becomes more valuable over time or amplifies other features
6. **Effort estimate** — S (< 4 hrs), M (4–12 hrs), L (12–30 hrs), XL (30+ hrs)
7. **Priority recommendation** — Must-have / High-value / Nice-to-have, with reasoning

### Design Constraints
- Both admins are technical (PhD-level scientists who code) but time-poor
- The system should surface insights proactively — don't make them go hunting
- Features should leverage the existing transcript corpus (200+ meetings) as a compounding asset
- Cross-timezone collaboration is a constant friction point (US / Europe)
- The platform they're building (ScienceExperts.ai) is the primary topic of 90%+ of meetings
- Prefer features that use Claude intelligently over features that add manual busywork
- The best features will feel like having a third team member who never forgets anything

### Think About These Categories (But Don't Limit Yourself)
- **Decision memory** — surfacing past decisions before they're re-debated
- **Accountability & momentum** — keeping both co-founders honest about commitments
- **Strategic awareness** — patterns across months of meetings that humans miss
- **Proactive intelligence** — the system reaching out when something matters
- **Development velocity** — connecting meeting discussions to actual dev progress
- **Meeting quality** — making future meetings more efficient based on past patterns
- **Knowledge continuity** — ensuring nothing falls through the cracks between sessions

### Output Format

Return your response as a structured document with:
1. A brief executive summary (3–4 sentences) of your overall vision
2. Each feature as a detailed card following the 7-point structure above
3. A recommended implementation roadmap showing which features to build in what order and why
4. A "compounding effects" section showing how features reinforce each other

Be specific. Be bold. Think about what would make another technical co-founder say "holy shit, we need this."
