/**
 * Generate context-aware IDE prompts for completing action items.
 *
 * Takes an action item (with its meeting context) and produces a prompt
 * that can be pasted into an AI IDE (Claude in Project IDX / Antigravity)
 * to initiate work on the task.
 *
 * The generated prompt is self-improving: it adapts based on feedback signals
 * and the specificity of the available context.
 */

import { callGemini, stripMarkdownFences } from './gemini';

// ── Types ─────────────────────────────────────────

export interface ActionItemForPrompt {
    id: string;
    title: string;
    description: string | null;
    assigned_to: string | null;
    priority: string;
    effort: string | null;
    due_date: string | null;
    source_text: string | null;
    group_label: string | null;
    created_by: string;
    /** AI-generated alt text describing an attached screenshot. */
    screenshot_alt: string | null;
    /** Category names assigned to this item. */
    categories: string[];
}

export interface PromptContext {
    /** Meeting title the action item came from */
    meeting_title: string | null;
    /** Date of the meeting */
    meeting_date: string | null;
    /** Participants in the meeting */
    participants: string[];
    /** The broader transcript excerpt surrounding the action item's source_text */
    surrounding_transcript: string | null;
    /** Related decisions made in the same meeting */
    related_decisions: string[];
    /** Other action items from the same meeting (for cross-reference) */
    sibling_action_items: string[];
    /** Feedback from previous prompt generations (for self-improvement) */
    feedback_history: { version: number; feedback: string }[];
}

export interface GeneratedPrompt {
    prompt: string;
    model: string;
    version: number;
}

// ── System prompt for the meta-prompt generator ──

const PROMPT_GENERATION_SYSTEM = `You are a prompt engineer embedded in a development workflow system. Your job is to generate a SINGLE, high-quality implementation prompt that a developer can paste into an AI coding assistant (Claude in an IDE with full codebase access) to begin working on a specific task.

## Your output format
Return a JSON object with exactly one field:
- "prompt" (string): The complete, ready-to-paste prompt. Use markdown formatting within the string.

## What makes a great implementation prompt:

1. **Starts with clear objective** — A 1-2 sentence summary of what needs to be done
2. **Includes acceptance criteria** — What "done" looks like, derived from the meeting context
3. **References the codebase** — Mentions specific directories, file patterns, or architectural patterns to look at (inferred from the project context: this is a Next.js 14 + Supabase + TypeScript monorepo at the root, with apps/web for the frontend, apps/worker for the backend, packages/shared for shared types/logic, and supabase/migrations for DB schema)
4. **Provides implementation hints** — Suggests an approach based on what was discussed in the meeting
5. **Includes constraints** — Mentions what NOT to break, existing patterns to follow, testing expectations
6. **Scopes appropriately** — Quick_fix tasks get concise prompts; significant tasks get structured multi-step prompts with phases

## Prompt structure by effort level:

### quick_fix (under 30 min):
- 3-6 sentences total
- Direct instruction: "In [file/area], change X to Y because Z"
- One acceptance criterion

### moderate (30 min to a few hours):
- Structured with: Objective → Context → Approach → Acceptance Criteria
- Reference 2-3 specific areas of the codebase
- 2-4 acceptance criteria

### significant (multiple hours/days):
- Full implementation brief with: Objective → Background → Implementation Plan (phased) → Key Files → Constraints → Acceptance Criteria → Testing Plan
- Reference specific files, migration patterns, API route patterns
- 4-6 acceptance criteria
- Suggest breaking into sub-tasks if appropriate

## Self-improvement rules:
- If previous feedback says "not_useful", make the next prompt MORE specific — add file paths, code patterns, and concrete steps
- If previous feedback says "useful", maintain the same level of detail
- If no feedback exists, default to moderately specific

## Critical rules:
- NEVER generate vague prompts like "implement the feature discussed in the meeting"
- ALWAYS include at least one concrete reference to a file path pattern or codebase area
- The prompt must be SELF-CONTAINED — the person pasting it should not need to read the transcript
- Write the prompt as if addressing Claude or an AI coding assistant directly (second person: "You should...", "Look at...", "Start by...")
- Include the meeting context as background, not as the primary instruction
- The generated prompt MUST be actionable on its own — even without the meeting recording

Return ONLY valid JSON, no markdown fences or extra text.`;

// ── Core generation function ──────────────────────

/**
 * Generate an implementation prompt for a single action item.
 *
 * Uses Gemini to produce a context-aware, effort-scaled prompt
 * that can be pasted into an AI IDE to start work.
 */
export async function generateActionItemPrompt(
    item: ActionItemForPrompt,
    context: PromptContext,
    geminiKey: string,
    previousVersion?: number,
): Promise<GeneratedPrompt> {
    const version = (previousVersion ?? 0) + 1;

    // Build the user message with all available context
    const parts: string[] = [];

    parts.push(`## Action Item to Generate a Prompt For`);
    parts.push(`- **Title:** ${item.title}`);
    if (item.description) parts.push(`- **Description:** ${item.description}`);
    parts.push(`- **Assigned to:** ${item.assigned_to ?? 'Unassigned'}`);
    parts.push(`- **Priority:** ${item.priority}`);
    parts.push(`- **Effort:** ${item.effort ?? 'unknown (treat as moderate)'}`);
    if (item.due_date) parts.push(`- **Due date:** ${item.due_date}`);
    if (item.group_label) parts.push(`- **Project/Topic:** ${item.group_label}`);
    if (item.categories && item.categories.length > 0) {
        parts.push(`- **Categories:** ${item.categories.join(', ')}`);
    }

    if (context.meeting_title) {
        parts.push(`\n## Meeting Context`);
        parts.push(`- **Meeting:** ${context.meeting_title}`);
        if (context.meeting_date) parts.push(`- **Date:** ${context.meeting_date}`);
        if (context.participants.length > 0) parts.push(`- **Participants:** ${context.participants.join(', ')}`);
    }

    if (item.source_text) {
        parts.push(`\n## Exact Transcript Excerpt (where this task was identified)`);
        parts.push(item.source_text);
    }

    if (context.surrounding_transcript) {
        parts.push(`\n## Broader Discussion Context`);
        parts.push(context.surrounding_transcript);
    }

    if (context.related_decisions.length > 0) {
        parts.push(`\n## Related Decisions Made in This Meeting`);
        context.related_decisions.forEach((d, i) => parts.push(`${i + 1}. ${d}`));
    }

    if (context.sibling_action_items.length > 0) {
        parts.push(`\n## Other Action Items From Same Meeting (for cross-reference)`);
        context.sibling_action_items.forEach((a, i) => parts.push(`${i + 1}. ${a}`));
    }

    if (item.screenshot_alt) {
        parts.push(`\n## Attached Screenshot Context`);
        parts.push(`The developer attached a screenshot to this task. Description of the screenshot:`);
        parts.push(item.screenshot_alt);
        parts.push(`\nUse this visual context to inform your implementation approach. The screenshot may show a bug, a design mockup, an error message, or a UI state that needs attention.`);
    }

    if (context.feedback_history.length > 0) {
        parts.push(`\n## Feedback on Previous Prompt Versions (USE THIS TO IMPROVE)`);
        for (const fb of context.feedback_history) {
            parts.push(`- Version ${fb.version}: "${fb.feedback}"`);
        }
        parts.push(`\nThe current version is ${version}. Adjust specificity based on the feedback above.`);
    }

    parts.push(`\n## Codebase Architecture Reference`);
    parts.push(`This is a Next.js 14 App Router monorepo (TypeScript + Tailwind CSS + Supabase):
- \`apps/web/\` — Frontend (Next.js pages in \`app/\`, components in \`components/\`, API routes in \`app/api/\`)
- \`apps/worker/\` — Backend worker (Gmail listener, Gemini AI extraction)
- \`packages/shared/\` — Shared TypeScript types (\`types.ts\`), extraction logic, utilities
- \`supabase/migrations/\` — PostgreSQL migrations (incremental, numbered)
- Styling: Tailwind with custom theme classes (\`glass-card\`, \`btn-primary\`, \`input-glow\`, \`badge-*\`, \`text-theme-*\`)
- DB access: \`getServerSupabase()\` from \`apps/web/lib/supabase.ts\`
- AI: Gemini for extraction/translation, OpenAI for embeddings, Claude for RAG answers
- All API routes use \`export const dynamic = 'force-dynamic'\` and \`NextResponse.json()\`
- Activity logging: Every mutation inserts into \`activity_log\` table`);

    const userMessage = parts.join('\n');

    const rawText = await callGemini(
        PROMPT_GENERATION_SYSTEM,
        userMessage,
        geminiKey,
        { maxOutputTokens: 4096 },
    );

    const cleaned = stripMarkdownFences(rawText);
    let parsed: { prompt: string };

    try {
        parsed = JSON.parse(cleaned);
    } catch {
        // If JSON parsing fails, treat the entire response as the prompt
        parsed = { prompt: cleaned };
    }

    return {
        prompt: parsed.prompt,
        model: 'gemini-2.5-flash',
        version,
    };
}

/**
 * Generate prompts for a batch of action items from the same transcript.
 * More efficient than calling one-by-one because we can share transcript context.
 */
export async function generatePromptsForBatch(
    items: ActionItemForPrompt[],
    transcriptContext: {
        meeting_title: string;
        meeting_date: string | null;
        participants: string[];
        raw_transcript: string;
    },
    relatedDecisions: string[],
    geminiKey: string,
): Promise<Map<string, GeneratedPrompt>> {
    const results = new Map<string, GeneratedPrompt>();

    // Generate prompts sequentially to avoid rate limits
    // but share the transcript context across all items
    for (const item of items) {
        // Find surrounding context — the source_text plus ~500 chars before/after
        let surrounding: string | null = null;
        if (item.source_text && transcriptContext.raw_transcript) {
            const idx = transcriptContext.raw_transcript.indexOf(item.source_text.slice(0, 50));
            if (idx >= 0) {
                const start = Math.max(0, idx - 500);
                const end = Math.min(transcriptContext.raw_transcript.length, idx + item.source_text.length + 500);
                surrounding = transcriptContext.raw_transcript.slice(start, end);
            }
        }

        const siblingTitles = items
            .filter(other => other.id !== item.id)
            .map(other => other.title);

        try {
            const generated = await generateActionItemPrompt(
                item,
                {
                    meeting_title: transcriptContext.meeting_title,
                    meeting_date: transcriptContext.meeting_date,
                    participants: transcriptContext.participants,
                    surrounding_transcript: surrounding,
                    related_decisions: relatedDecisions,
                    sibling_action_items: siblingTitles,
                    feedback_history: [],
                },
                geminiKey,
            );
            results.set(item.id, generated);
        } catch (err) {
            console.error(`[generate-prompt] Failed for item "${item.title}":`, err);
            // Generate a fallback prompt without AI
            results.set(item.id, {
                prompt: buildFallbackPrompt(item, transcriptContext.meeting_title),
                model: 'fallback',
                version: 1,
            });
        }
    }

    return results;
}

/**
 * Build a simple template-based fallback prompt when AI generation fails.
 */
function buildFallbackPrompt(item: ActionItemForPrompt, meetingTitle: string | null): string {
    const effortGuide = item.effort === 'quick_fix'
        ? 'This is a quick task (under 30 min).'
        : item.effort === 'significant'
            ? 'This is a significant task that may span multiple sessions.'
            : 'This is a moderate-effort task (30 min to a few hours).';

    const lines = [
        `## Task: ${item.title}`,
        '',
        item.description ? `**Context:** ${item.description}` : null,
        meetingTitle ? `**From meeting:** ${meetingTitle}` : null,
        '',
        effortGuide,
        '',
        `**What to do:**`,
        `Review the codebase to understand the current implementation relevant to this task, then implement the changes needed to complete it.`,
        '',
        item.source_text ? `**Meeting discussion excerpt:**\n> ${item.source_text}` : null,
        '',
        `**Codebase entry points:**`,
        `- Frontend: \`apps/web/app/\` and \`apps/web/components/\``,
        `- API routes: \`apps/web/app/api/\``,
        `- Shared types: \`packages/shared/src/types.ts\``,
        `- Database: \`supabase/migrations/\``,
        '',
        `Start by exploring the relevant files, then propose an implementation plan before writing code.`,
    ];

    return lines.filter(l => l !== null).join('\n');
}
