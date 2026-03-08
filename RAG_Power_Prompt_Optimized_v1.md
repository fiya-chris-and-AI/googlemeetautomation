# Optimized RAG Company Brain Prompt — Claude 4.6 Opus × Antigravity IDE

> **What changed from the original:** The prompt below has been restructured with XML tags, explicit reasoning gates, Antigravity-specific tooling hooks, typed output schemas, and chain-of-thought scaffolding — all patterns Claude 4.6 Opus responds to strongly. A changelog is at the bottom.

---

## The Prompt

```xml
<system>
You are a senior RAG Systems Architect paired with a Prompt Engineering lead.
You think step-by-step, show your reasoning before each deliverable, and
produce implementation-ready artifacts — not hand-wavy overviews.

<constraints>
- Target model for ALL generated prompts: Claude 4.6 Opus
- Execution environment: Google Antigravity IDE (agent-first, VS Code fork,
  Gemini 3 + Claude Opus agent support, artifact-based review flow)
- The engineer will work inside Antigravity's Editor view and may delegate
  subtasks to its built-in agent sidebar. Design steps accordingly.
- Prefer open-source / self-hostable components where possible.
- Keep the total system runnable on a single machine for prototyping before
  any cloud deployment.
</constraints>
</system>

<user>
<context>
We have a growing library of internal development transcripts — raw text and
timestamped recordings of our team discussing product builds. We need a
"Company Brain" that lets us:

1. Ingest those transcripts into a searchable vector store.
2. Automatically surface the moments where new features are introduced,
   discussed, or decided ("key moments").
3. Generate optimized "Power Prompts" that combine retrieved transcript
   snippets + screenshot placeholders into a ready-to-run prompt whose
   output is a viral YouTube video script showcasing our dev workflow.
</context>

<task>
Produce a phased implementation plan with the exact structure below.
For every phase, FIRST write a short <reasoning> block explaining your
design choices, THEN deliver the artifact.
</task>

<!-- =========================================================== -->
<!-- PHASE 1 — RAG SYSTEM ARCHITECTURE                           -->
<!-- =========================================================== -->
<phase id="1" title="RAG System Architecture">
  <deliverables>
    <deliverable type="diagram_description">
      A plain-text component diagram showing:
        • Embedding model (name + dimension)
        • Vector database (name, why chosen)
        • Retrieval strategy (similarity metric, top-k, reranker if any)
        • Orchestration layer (LangChain / LlamaIndex / raw SDK — justify)
    </deliverable>

    <deliverable type="ingestion_spec">
      Detailed ingestion pipeline for raw transcripts:
        • Accepted input formats (txt, srt, vtt, json)
        • Chunking strategy — specify: method (semantic vs. fixed-window),
          chunk size, overlap, and WHY these values optimise short-form
          video context retrieval
        • Metadata attached to each chunk at index time
    </deliverable>
  </deliverables>
</phase>

<!-- =========================================================== -->
<!-- PHASE 2 — TRANSCRIPT ANALYSIS & FEATURE IDENTIFICATION      -->
<!-- =========================================================== -->
<phase id="2" title="Transcript Analysis & Feature Identification">
  <deliverables>
    <deliverable type="analysis_prompt">
      The exact system + user prompt pair the RAG pipeline will send to
      Claude 4.6 Opus to analyse a batch of retrieved chunks and return
      structured "key moments."

      The prompt MUST instruct the model to output valid JSON matching
      this schema:

      ```json
      {
        "key_moments": [
          {
            "feature_name": "string",
            "speakers": ["string"],
            "timestamp_range": { "start": "HH:MM:SS", "end": "HH:MM:SS" },
            "task_id": "string | null",
            "summary": "string (≤ 50 words)",
            "verbatim_quote": "string (the single most compelling quote)",
            "virality_score": "1-10 integer — how visually / narratively
                               compelling this moment is for a YouTube audience"
          }
        ]
      }
      ```
    </deliverable>

    <deliverable type="metadata_schema">
      A table defining every metadata field stored alongside each chunk
      in the vector DB (field name, type, source, example value).
    </deliverable>
  </deliverables>
</phase>

<!-- =========================================================== -->
<!-- PHASE 3 — POWER PROMPT GENERATION PIPELINE                  -->
<!-- =========================================================== -->
<phase id="3" title="Power Prompt Generation Pipeline">
  <deliverables>
    <deliverable type="power_prompt_template">
      A complete, copy-paste-ready "Power Prompt" template that:

      1. Accepts these variables (use {{variable_name}} syntax):
         • {{key_moments_json}} — output of Phase 2
         • {{screenshot_urls}}  — comma-separated image links or
           base64 placeholders
         • {{video_length_seconds}} — target duration (default 60)
         • {{tone}} — e.g. "hype", "educational", "behind-the-scenes"

      2. Instructs Claude 4.6 Opus to produce:
         • A hook line (first 3 seconds of the video)
         • Scene-by-scene breakdown with VO (voice-over) text,
           on-screen text, and screenshot call-outs
         • A CTA (call to action) closing beat
         • Estimated word count for the VO (targeting {{video_length_seconds}})

      3. Includes an explicit "viral optimisation" instruction block
         telling the model to prioritise curiosity gaps, pattern
         interrupts, and transformation arcs.
    </deliverable>
  </deliverables>
</phase>

<!-- =========================================================== -->
<!-- PHASE 4 — ANTIGRAVITY ACTION PLAN                           -->
<!-- =========================================================== -->
<phase id="4" title="Antigravity IDE Action Plan">
  <deliverables>
    <deliverable type="action_plan">
      A numbered checklist (5–7 items) a single engineer can start
      TODAY inside Google Antigravity IDE. Each item must include:

        • The task (one sentence)
        • Which Antigravity feature to use (Editor view, agent sidebar
          task delegation, artifact review, terminal, etc.)
        • Estimated time (in hours)
        • The concrete file or artifact produced when done

      End with a "Day-1 Definition of Done" — the minimum viable state
      where the engineer can paste a transcript and get back a Power Prompt.
    </deliverable>
  </deliverables>
</phase>
</user>
```

---

## Why This Version Is Better — Changelog

| # | Original Issue | Optimisation Applied |
|---|---|---|
| 1 | **Flat markdown structure** — Claude performs better with explicit tag boundaries | Wrapped in `<system>`, `<user>`, `<phase>`, `<deliverable>` XML tags so the model can unambiguously parse scope |
| 2 | **No reasoning gate** — original jumped straight to output | Added `<task>` instruction requiring a `<reasoning>` block before each phase, activating chain-of-thought |
| 3 | **Vague output format for Phase 2** — "define the metadata structure" | Provided an exact JSON schema for key moments + required a metadata field table with types and examples |
| 4 | **Power Prompt template underspecified** — "a placeholder variable for screenshots" | Defined 4 named template variables (`{{key_moments_json}}`, `{{screenshot_urls}}`, `{{video_length_seconds}}`, `{{tone}}`), plus explicit output sections (hook, scenes, CTA, word count) |
| 5 | **No viral strategy instruction** — original just said "viral" | Added a concrete "viral optimisation" instruction block referencing curiosity gaps, pattern interrupts, and transformation arcs |
| 6 | **Antigravity IDE mentioned but not leveraged** — original treated it as a generic IDE | Action plan now maps each task to a specific Antigravity feature (Editor view, agent sidebar, artifact review) with time estimates and concrete artifacts |
| 7 | **No "Definition of Done"** — unclear when Phase 1 is shippable | Added Day-1 DoD so the engineer knows the minimum viable loop |
| 8 | **No constraints block** — model could drift toward cloud-only or enterprise tooling | Added `<constraints>` specifying single-machine prototyping, open-source preference, and Antigravity's agent workflow |
| 9 | **Chunk strategy rationale missing** — original said "maximise context" without forcing justification | Deliverable now requires the architect to state chunk size, overlap, method, AND why those values suit short-form video retrieval |
| 10 | **No virality scoring** — original had no way to rank moments | Added `virality_score` (1–10) to the JSON schema so downstream sorting is automatic |

---

## How to Use This in Antigravity

1. Open **Antigravity IDE → Editor View**
2. Create a new file: `prompts/rag_company_brain.md`
3. Paste the prompt above (the content inside the code fence)
4. Open the **Agent Sidebar** → select **Claude 4.6 Opus** as the model
5. Send the prompt — the agent will produce the full phased plan as an **Artifact** you can review, annotate, and iterate on
6. Use the plan's Action Checklist to begin implementation directly in the IDE

---

*Generated for Fiya — March 8, 2026*
