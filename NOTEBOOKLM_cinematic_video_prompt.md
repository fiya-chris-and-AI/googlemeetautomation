# NotebookLM — MeetScript Cinematic Video Prompt

Copy and paste the full prompt below into NotebookLM to generate a cinematic promotional/educational video about MeetScript.

---

Create a cinematic, visually rich video that tells the story of MeetScript — a meeting intelligence platform built by 3rd AI LLC.

## The Origin Story

ScienceExperts.ai is a self-hosted community platform for scientists and researchers in the life sciences, built by co-founders Dr. Lutfiya Miller and Chris Müller. It's a full-featured platform with a community feed, an integrated learning management system with courses and lessons, an event calendar, gamification with points and leaderboards, a 23-page admin dashboard, Stripe payments, and real-time multilingual support in 10 languages powered by DeepL — all built on Next.js, Supabase, and Vercel. The two co-founders live in different countries and coordinate their entire business virtually through Google Meet. As the platform grew more ambitious — with 25+ database models, 118+ components, and features spanning from AI tools to content translation — their meetings multiplied. Decisions got buried in memory. Action items slipped through the cracks. They needed a way to make every meeting count.

## What MeetScript Solves

MeetScript was born from that need. It automatically captures every Google Meet transcript, processes it through a deterministic data pipeline, and makes every word searchable, queryable, and actionable — without anyone taking notes. It's purpose-built for two people running a global platform who can't afford to lose a single decision or action item across hundreds of virtual meetings.

## The Technical Workflow

When a Google Meet call ends, a transcript email arrives in Gmail. MeetScript detects it instantly via Google Cloud Pub/Sub, extracts the text using a three-method priority cascade (file attachment, Google Doc link, or inline HTML), normalizes it into a structured record with title, date, and participants, then splits it into overlapping chunks aligned to speaker turns. Each chunk is converted into a 1,536-dimension vector embedding using OpenAI's text-embedding-3-small and stored in PostgreSQL with pgvector for semantic search. Next, Anthropic's Claude Sonnet 4 extracts action items — with assignee, priority, and effort — and decisions — with domain classification and confidence level — as structured JSON. Users query their full meeting history through a natural-language RAG interface: their question is embedded, matched against stored chunks via cosine similarity, and Claude generates a cited answer grounded only in real transcripts. A meeting calendar, monthly scoreboard, co-founder pair analytics, and activity heatmap round out the experience — all computed deterministically from the data.

## The Key Architectural Insight

The architecture separates a fully deterministic data pipeline (capture, parse, chunk, embed, store) from a constrained AI analysis layer (extract, query). The pipeline stages are entirely rule-based — given the same input, they always produce the same output. The AI stages use large language models but are tightly constrained: structured prompts, validated JSON output, and grounded-in-context generation that never invents information. This gives scientists the reliability of traditional data engineering for the foundation and the analytical power of AI for the intelligence layer on top.

## Video Tone and Audience

The audience is scientists, researchers, and technical professionals who may have no background in AI or software engineering. The tone should be confident and educational — not salesy. Show the viewer exactly how the system works, stage by stage, so they come away understanding both the problem and the elegance of the solution. Frame MeetScript as what happens when two scientist-founders build the tool they actually needed.
