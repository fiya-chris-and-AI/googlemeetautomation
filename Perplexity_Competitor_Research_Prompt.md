# Perplexity Pro Research Prompt — Meeting Intelligence Competitor Analysis

> **Usage:** Copy the prompt below and paste it into Perplexity Pro. The prompt is designed as a single deep-research query that leverages Perplexity's multi-source synthesis capabilities. For best results, use Perplexity Pro's "Deep Research" mode.

---

## THE PROMPT

```
I'm building a meeting intelligence platform called MeetScript and need a comprehensive competitor landscape analysis. I need you to research deeply and produce a structured report covering every major player in the meeting transcript / meeting notes / meeting intelligence software space as of 2026.

### PART 1: Complete Market Map

Identify and categorize ALL significant products in the meeting intelligence space. For EACH product, provide:

1. **Product name and company** (include URL)
2. **Founded / launched year**
3. **Funding stage and total raised** (if known)
4. **Pricing model** — free tier? Per-seat? Per-minute? Flat rate? Enterprise custom pricing? Give exact dollar amounts where available.
5. **Platform availability** — web app, desktop app (Mac/Windows/Linux), mobile app, browser extension, API access
6. **Core value proposition** — their one-sentence positioning (from their own marketing)

Organize the products into these tiers:
- **Tier 1 — Major players** (>$10M ARR or >1M users): e.g., Otter.ai, Fireflies.ai, Fathom, tl;dv, Granola, Read.ai, Avoma, Gong, Chorus (ZoomInfo), Clari Copilot
- **Tier 2 — Growing challengers** (funded startups with traction): e.g., Grain, Fellow, Sembly, Supernormal, Circleback, Nyota, Krisp, Tactiq, MeetGeek, Laxis
- **Tier 3 — Niche / emerging / open-source** (newer entrants, open-source alternatives, developer tools): e.g., Recall.ai (API), Meetingbaas, Bluedot, Sybill, Claap, Rewatch, Vowel
- **Tier 4 — Platform features (not standalone products)** — meeting intelligence built into larger platforms: e.g., Microsoft Copilot (Teams), Google Gemini (Meet), Zoom AI Companion, Notion AI, Slack Huddles AI

Don't limit yourself to the examples I listed — find products I haven't mentioned.

### PART 2: Feature Matrix

Create a detailed feature comparison matrix across ALL Tier 1 and Tier 2 products. The features to compare:

**Capture & Input:**
- Real-time transcription (live during meeting)
- Post-meeting transcript processing (from recordings or emails)
- Supported platforms (Zoom, Meet, Teams, others)
- Bot-based recording vs. native integration vs. no-bot approach
- Manual upload support (text, audio, video)
- Speaker identification / diarization accuracy

**AI Processing & Intelligence:**
- Meeting summary generation (quality and customization)
- Action item extraction (automatic vs. manual)
- Decision tracking / decision extraction
- Key topic / keyword extraction
- Sentiment analysis
- Custom AI queries / "Ask AI" about meetings
- Cross-meeting search and synthesis (can you ask questions across ALL meetings, not just one?)
- RAG or semantic search capabilities

**Collaboration & Workflow:**
- Shared meeting notes (real-time collaborative editing)
- Action item assignment and tracking (Kanban, lists, etc.)
- CRM integration (Salesforce, HubSpot, Pipedrive)
- Project management integration (Jira, Linear, Asana, Notion, ClickUp)
- Slack / Teams integration
- Calendar integration
- Email integration (digest, notifications, sharing)
- API availability for developers

**Analytics & Insights:**
- Meeting analytics / dashboards (frequency, duration, participation)
- Speaker talk-time ratios
- Meeting ROI / productivity metrics
- Trend analysis across meetings over time
- Topic tracking across meetings

**Privacy & Deployment:**
- Self-hosted / on-premise option
- Data residency options (EU, US, etc.)
- SOC 2 / GDPR / HIPAA compliance
- End-to-end encryption
- No-bot / privacy-first approach (no meeting bot joining the call)

**UI/UX Approach:**
- Overall design quality and aesthetic (modern, clean, cluttered, etc.)
- Mobile experience quality
- Onboarding friction (how fast can someone get value?)
- Dark mode support

### PART 3: Pricing Deep Dive

For each Tier 1 and Tier 2 product, provide the EXACT pricing tiers as of 2026:
- Free tier: what's included, what are the limits?
- Paid tiers: price per seat/month, what unlocks at each tier?
- Enterprise: what's custom-quoted?
- Any usage-based pricing (per minute of transcription, per meeting, etc.)?
- Annual vs. monthly discount?

### PART 4: Differentiation Analysis

Based on your research, identify:

1. **Table-stakes features** — What does EVERY product in this space offer? What's the minimum feature set to be taken seriously?

2. **Common gaps** — What do most products do poorly or not at all? Look specifically for:
   - Cross-meeting intelligence (querying across entire meeting history, not just single meetings)
   - Decision tracking as a distinct concept from action items
   - Meeting-to-work bridging (connecting what was discussed to what gets built)
   - Proactive intelligence (the system volunteering insights vs. just answering questions)
   - Meeting preparation features (pre-meeting briefings)
   - Privacy-first approaches (no bots joining calls)

3. **Emerging trends** — What are the newest features being shipped in 2025-2026? What direction is the market moving?

4. **Underserved segments** — Which customer types are poorly served by existing products? Consider:
   - Technical co-founder pairs / small founding teams (2-5 people)
   - Remote-first cross-timezone teams
   - Teams that want self-hosted / privacy-first solutions
   - Developer teams who want API access and customization
   - Non-English or multilingual teams

5. **Pricing white space** — Is there a pricing model that no one is using but would be compelling? (e.g., one-time purchase, open core, usage-based only, team-flat-rate)

### PART 5: UX and Design Patterns

Describe the dominant UX patterns across the top 10 products:
- How do they present transcript text? (full text, summarized, segmented by topic?)
- How do they handle action items? (inline in transcript, separate view, Kanban, checklist?)
- How do they present AI-generated content? (sidebar, inline, chat interface, separate page?)
- What navigation patterns are most common? (sidebar nav, top tabs, search-first?)
- Do any products have a notably superior or inferior design? Which ones stand out visually and why?
- Which products feel like "tools" vs. which feel like "platforms"?

### PART 6: Specific Product Deep Dives

For these 5 products specifically, go deeper:
1. **Granola** — their "no-bot" approach, how it works technically, adoption, and limitations
2. **Otter.ai** — current feature set in 2026, how they've evolved, enterprise penetration
3. **Fireflies.ai** — their cross-meeting intelligence capabilities, AskFred feature
4. **Read.ai** — their meeting analytics and scoring approach
5. **Fathom** — their free tier strategy, what makes them grow so fast

For each: What do users love? What do users complain about? (Check G2, Capterra, Reddit, Product Hunt reviews.)

### OUTPUT FORMAT

Structure your response as a report with clear sections, tables where appropriate, and specific data points (not vague generalizations). Cite your sources. Prioritize recency — I want 2025-2026 data, not 2023 information. If pricing or features have changed recently, note the most current version.
```

---

## FOLLOW-UP PROMPTS

After the initial research comes back, use these follow-up prompts to go deeper:

### Follow-up 1: Open Source & Developer Tools
```
Now focus specifically on open-source and developer-oriented meeting intelligence tools. Research:
- Recall.ai (API platform for meeting bots)
- Meetingbaas (open-source meeting bot infrastructure)
- Any open-source transcription + summarization projects on GitHub with >500 stars
- Self-hosted alternatives to Otter/Fireflies
- Developer APIs that let you build custom meeting intelligence (not just embed someone else's product)

For each: What's the architecture? What can you build on top of it? What are the limitations? What's the community size?
```

### Follow-up 2: Decision Tracking Specifically
```
I want to go deeper on decision tracking in meetings. Research:
- Which meeting tools (if any) treat "decisions" as a distinct entity from "action items"?
- How do existing products handle the problem of teams re-debating decisions that were already made?
- Are there any standalone "decision log" or "decision register" tools that integrate with meeting software?
- How do enterprise governance/compliance tools handle decision traceability from meetings?
- What does the academic/UX research say about how teams track decisions vs. tasks?

This is a potential key differentiator for our product — we have a full Decision Ledger with vector embeddings, supersession chains, domain classification, and decision-aware RAG that surfaces past decisions before they're re-debated.
```

### Follow-up 3: Revenue Intelligence vs. Meeting Intelligence
```
Map the boundary between "meeting intelligence" (general productivity) and "revenue intelligence" / "conversation intelligence" (sales-focused). Specifically:
- Gong, Chorus (ZoomInfo), Clari Copilot, Salesloft — how do these differ from general-purpose meeting tools?
- What features do revenue intelligence tools have that general meeting tools don't?
- What's the pricing difference? (Revenue intelligence tools are typically 5-10x more expensive)
- Is there a gap in the market for a product that has revenue intelligence depth but at meeting intelligence pricing?
- Which general meeting tools are moving "upmarket" into revenue intelligence territory?
```

### Follow-up 4: Cross-Meeting Intelligence
```
This is our core differentiator. Research deeply:
- Which products offer the ability to ask questions ACROSS your entire meeting history (not just summarize a single meeting)?
- How do they implement this technically? (RAG, embeddings, keyword search, something else?)
- What's the UX for cross-meeting queries? (Chat interface, search bar, natural language, structured filters?)
- Fireflies has "AskFred" — how does it actually work? What are its limitations according to user reviews?
- Otter has "Otter AI Chat" — same questions.
- Are there any products that proactively surface insights across meetings without being asked? (e.g., "You've discussed this topic 5 times without resolving it")
- What does user sentiment look like for cross-meeting search? (Is it a feature people actively want, or is it a nice-to-have?)
```

### Follow-up 5: No-Bot / Privacy-First Approaches
```
Research the "no meeting bot" trend in meeting intelligence:
- Granola's approach: how does it capture meeting content without a bot? Technical details.
- Tactiq: browser extension approach — how does it work?
- Any other products that avoid sending a bot to the meeting?
- What do users say about meeting bot fatigue? (multiple bots in one meeting, permission issues, "is this being recorded" awkwardness)
- How does Google Meet's native Gemini transcript feature work? Is it replacing third-party tools?
- How does Microsoft Copilot in Teams handle transcription and summarization natively?
- What's the market impact of platform-native AI (Zoom AI Companion, Meet Gemini, Teams Copilot) on third-party meeting tools?

Our product (MeetScript) ingests Google Meet transcripts from Gmail AFTER the meeting — no bot, no recording, just the transcript that Google already generates. How unique is this approach?
```
