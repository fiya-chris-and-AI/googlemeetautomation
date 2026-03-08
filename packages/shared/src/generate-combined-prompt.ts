/**
 * Generate a combined "Power Prompt" for multiple action items.
 *
 * Takes a set of selected action items, gathers all their meeting context,
 * normalizes/deduplicates them, and uses Gemini to produce a single cohesive
 * mega-prompt optimized for Claude 4.6 Opus in Antigravity IDE.
 *
 * The generated Power Prompt is self-contained and immediately executable —
 * no need to reference individual transcripts or prompts.
 */

import { callGemini, stripMarkdownFences } from './gemini';
import type { ActionItem } from './types';

// ── Types ─────────────────────────────────────────

export interface GeneratedCombinedPrompt {
    prompt: string;
    model: string;
    categories: string[];
    warnings: string[];
}

export interface ValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
}

interface TranscriptContext {
    meeting_title: string | null;
    meeting_date: string | null;
    participants: string[];
    raw_transcript: string | null;
    decisions: string[];
}

// ── System prompt for the Power Prompt generator ──

const POWER_PROMPT_SYSTEM = `You are a Power Prompt engineer specializing in multi-task implementation orchestration. Your job is to generate a SINGLE, cohesive "mega prompt" that combines multiple related action items into one unified implementation strategy for an AI coding assistant.

## Target Execution Environment
- **Executing AI:** Claude 4.6 Opus (the agent that will receive and execute this prompt)
- **IDE:** Google Antigravity IDE (full codebase access, file editing, terminal)
- **Codebase:** Next.js 14 App Router monorepo (TypeScript + Tailwind CSS + Supabase)

## Your output format
Return a JSON object with exactly one field:
- "prompt" (string): The complete, ready-to-paste combined prompt. Use markdown formatting within the string.

## What makes a great Power Prompt:

1. **Unified Goal Statement** — A concise 2-3 sentence high-level objective that ties all tasks together conceptually. The executing AI should immediately understand the overall mission.
2. **TASK GROUPS** — Organize all tasks by their original category/project label. Each group should list tasks clearly separated, referencing any included screenshots or visual context.
3. **CONTEXT INSTRUCTION** — Tell the executing AI exactly how to handle included screenshots: "Use the visual context from the attached images to inform the code changes. Each screenshot is labeled with its associated task ID."
4. **Cross-item Dependencies** — Identify which tasks must be done first and which share common files or patterns.
5. **Shared Context Optimization** — Reference common codebase areas, shared decisions, and meeting context ONCE globally, not repeated per task.
6. **Priority & Sequence** — Suggest execution order based on effort + priority + dependencies.
7. **OUTPUT FORMAT** — The final instruction MUST demand the output be formatted as either:
   (a) A single, consolidated development plan with phased implementation steps, OR
   (b) A complete, executable code block ready to run in Antigravity IDE.
8. **Acceptance Criteria** — What "done" looks like for ALL tasks combined.
9. **Testing Strategy** — How to verify all items are complete.

## Prompt structure by combined effort:

### All quick_fix items (under 2 hours total combined):
- Single 8-15 sentence directive with all tasks
- Grouped by category
- One combined acceptance criterion section

### Mixed effort (quick + moderate):
- Unified objective
- Task groups by category with individual details
- Shared context section (meeting background, codebase areas)
- Ordered implementation steps
- Combined acceptance criteria
- Testing strategy

### Significant combined effort (many hours/days):
- Full implementation brief
- Phased approach: Phase 1 (foundational), Phase 2 (integration), Phase 3 (polish/testing)
- Detailed cross-references to specific files and codebase areas
- Risk assessment per phase
- Per-phase testing checkpoints
- Final acceptance criteria

## Normalization rules:
- If items have similar categories (e.g., "Database" vs "DB Schema"), unify under one label
- If items conflict (different assignees for same task), flag the conflict and suggest resolution
- Remove exact duplicates (same title from same meeting)
- Sort groups by: most urgent/high-priority first, then by effort (significant before quick_fix)

## Critical rules:
- NEVER just concatenate individual prompts — synthesize them into a coherent whole
- ALWAYS identify cross-task dependencies and suggest a logical ordering
- The prompt must be SELF-CONTAINED — the executing AI should not need to read any transcripts
- Write in second person addressing the executing AI: "You should...", "Start by...", "Look at..."
- Include meeting context as background, not as primary instruction
- Include the codebase architecture reference so the AI knows the repo structure
- Every task MUST appear in the output — do not silently drop any items
- If screenshots are referenced, include an instruction for the AI to examine them

Return ONLY valid JSON, no markdown fences or extra text.`;

// ── Validation ────────────────────────────────────

/**
 * Validate a set of items before generating a combined prompt.
 * Returns errors (blocking) and warnings (informational).
 */
export function validateItemsCombination(items: ActionItem[]): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (items.length === 0) {
        errors.push('No items selected');
    }

    if (items.length > 20) {
        errors.push('Cannot combine more than 20 items at once — select fewer items for best results');
    }

    // Check for cross-project mixing
    const projects = new Set(items.map(i => i.group_label).filter(Boolean));
    if (projects.size > 3) {
        warnings.push(`Combining items from ${projects.size} different projects — the prompt may be complex`);
    }

    // Check for missing transcript context
    const noTranscript = items.filter(i => !i.transcript_id);
    if (noTranscript.length > 0) {
        warnings.push(`${noTranscript.length} item${noTranscript.length !== 1 ? 's' : ''} have no transcript context — prompt may be less precise`);
    }

    // Check for conflicting assignees on same-titled items
    const titleGroups = new Map<string, Set<string>>();
    for (const item of items) {
        const key = item.title.trim().toLowerCase();
        if (!titleGroups.has(key)) titleGroups.set(key, new Set());
        if (item.assigned_to) titleGroups.get(key)!.add(item.assigned_to);
    }
    for (const [, assignees] of titleGroups) {
        if (assignees.size > 1) {
            warnings.push('Some tasks are assigned to multiple people — the prompt will note this');
        }
    }

    return { isValid: errors.length === 0, errors, warnings };
}

// ── Normalization ─────────────────────────────────

/**
 * Normalize items: deduplicate by title+transcript, sort by priority then effort.
 */
function normalizeItems(items: ActionItem[]): ActionItem[] {
    // Step 1: Deduplicate — remove items with identical title + transcript_id
    const seen = new Set<string>();
    const deduped: ActionItem[] = [];

    for (const item of items) {
        const key = `${item.title.trim().toLowerCase()}::${item.transcript_id ?? 'none'}`;
        if (!seen.has(key)) {
            seen.add(key);
            deduped.push(item);
        }
    }

    // Step 2: Sort by priority (urgent first) then effort (significant first)
    const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
    const effortOrder: Record<string, number> = { significant: 0, moderate: 1, quick_fix: 2 };

    deduped.sort((a, b) => {
        const pDiff = (priorityOrder[a.priority] ?? 4) - (priorityOrder[b.priority] ?? 4);
        if (pDiff !== 0) return pDiff;
        return (effortOrder[a.effort ?? 'moderate'] ?? 3) - (effortOrder[b.effort ?? 'moderate'] ?? 3);
    });

    return deduped;
}

// ── Context gathering ─────────────────────────────

/**
 * Gather transcript context and related decisions for all unique transcripts.
 * Fetches each transcript only once even if multiple items reference it.
 */
async function gatherAllContexts(
    items: ActionItem[],
    supabase: any,
): Promise<Map<string, TranscriptContext>> {
    const transcriptIds = [...new Set(items.map(i => i.transcript_id).filter(Boolean))] as string[];
    const contexts = new Map<string, TranscriptContext>();

    for (const tid of transcriptIds) {
        // Fetch transcript
        const { data: transcript } = await supabase
            .from('transcripts')
            .select('meeting_title, meeting_date, participants, raw_transcript')
            .eq('id', tid)
            .single();

        // Fetch related decisions
        const { data: decisions } = await supabase
            .from('decisions')
            .select('decision_text')
            .eq('transcript_id', tid)
            .limit(10);

        contexts.set(tid, {
            meeting_title: transcript?.meeting_title ?? null,
            meeting_date: transcript?.meeting_date ?? null,
            participants: transcript?.participants ?? [],
            raw_transcript: transcript?.raw_transcript ?? null,
            decisions: decisions?.map((d: { decision_text: string }) => d.decision_text) ?? [],
        });
    }

    return contexts;
}

// ── User message builder ──────────────────────────

/**
 * Build the Gemini user message with all items and their contexts.
 */
function buildCombinedUserMessage(
    items: ActionItem[],
    contexts: Map<string, TranscriptContext>,
): string {
    const parts: string[] = [];

    parts.push(`## Combined Action Items — ${items.length} tasks to unify\n`);

    // Group items by transcript for context coherence
    const byTranscript = new Map<string, ActionItem[]>();
    for (const item of items) {
        const key = item.transcript_id ?? '__manual__';
        if (!byTranscript.has(key)) byTranscript.set(key, []);
        byTranscript.get(key)!.push(item);
    }

    // Render each transcript group
    for (const [transcriptId, groupItems] of byTranscript) {
        const ctx = contexts.get(transcriptId);

        if (ctx) {
            parts.push(`### Meeting: ${ctx.meeting_title || 'Unknown Meeting'}`);
            if (ctx.meeting_date) parts.push(`- **Date:** ${ctx.meeting_date}`);
            if (ctx.participants.length > 0) parts.push(`- **Participants:** ${ctx.participants.join(', ')}`);
            parts.push('');
        } else if (transcriptId === '__manual__') {
            parts.push('### Manually Created Items (no meeting context)');
            parts.push('');
        }

        // Render each item
        for (const item of groupItems) {
            parts.push(`#### Task: ${item.title}`);
            if (item.description) parts.push(`**Description:** ${item.description}`);
            parts.push(`- **Priority:** ${item.priority}`);
            parts.push(`- **Effort:** ${item.effort ?? 'unknown (treat as moderate)'}`);
            if (item.assigned_to) parts.push(`- **Assigned to:** ${item.assigned_to}`);
            if (item.due_date) parts.push(`- **Due date:** ${item.due_date}`);
            if (item.group_label) parts.push(`- **Project/Category:** ${item.group_label}`);

            if (item.source_text) {
                parts.push(`\n**Transcript excerpt:**`);
                parts.push(`> ${item.source_text}`);
            }

            // Include surrounding transcript context for richer prompts
            if (item.source_text && ctx?.raw_transcript) {
                const searchStr = item.source_text.slice(0, 50);
                const idx = ctx.raw_transcript.indexOf(searchStr);
                if (idx >= 0) {
                    const start = Math.max(0, idx - 300);
                    const end = Math.min(ctx.raw_transcript.length, idx + item.source_text.length + 300);
                    const surrounding = ctx.raw_transcript.slice(start, end);
                    if (surrounding.length > item.source_text.length + 50) {
                        parts.push(`\n**Broader discussion context:**`);
                        parts.push(`> ${surrounding}`);
                    }
                }
            }

            parts.push('');
        }

        // Include related decisions for this meeting
        if (ctx?.decisions && ctx.decisions.length > 0) {
            parts.push('**Related Decisions from This Meeting:**');
            ctx.decisions.forEach((d, i) => parts.push(`${i + 1}. ${d}`));
            parts.push('');
        }
    }

    // Shared codebase reference (included once)
    parts.push(`## Codebase Architecture Reference`);
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

    return parts.join('\n');
}

// ── Category extraction ───────────────────────────

/**
 * Extract unique categories (group_labels) from items for metadata.
 */
function extractCategories(items: ActionItem[]): string[] {
    const labels = new Set<string>();
    for (const item of items) {
        if (item.group_label) labels.add(item.group_label);
    }
    return labels.size > 0 ? Array.from(labels).sort() : ['Ungrouped'];
}

// ── Core generation function ──────────────────────

/**
 * Generate a combined Power Prompt for multiple action items.
 *
 * Pipeline: normalize → validate → gather contexts → build message → call Gemini → parse
 */
export async function generateCombinedPrompt(
    items: ActionItem[],
    supabase: any,
    geminiKey: string,
): Promise<GeneratedCombinedPrompt> {
    // 1. Normalize: deduplicate and sort
    const normalized = normalizeItems(items);

    // 2. Validate
    const validation = validateItemsCombination(normalized);
    if (!validation.isValid) {
        throw new Error(validation.errors.join('; '));
    }

    // 3. Gather all transcript contexts
    const contexts = await gatherAllContexts(normalized, supabase);

    // 4. Build the combined user message
    const userMessage = buildCombinedUserMessage(normalized, contexts);

    // 5. Call Gemini with higher token limit for combined prompts
    const rawText = await callGemini(
        POWER_PROMPT_SYSTEM,
        userMessage,
        geminiKey,
        { maxOutputTokens: 8192 },
    );

    const cleaned = stripMarkdownFences(rawText);
    let parsed: { prompt: string };

    try {
        parsed = JSON.parse(cleaned);
    } catch {
        // If JSON parsing fails, treat the entire response as the prompt
        parsed = { prompt: cleaned };
    }

    // 6. Extract categories for metadata
    const categories = extractCategories(normalized);

    return {
        prompt: parsed.prompt,
        model: 'gemini-2.5-flash',
        categories,
        warnings: validation.warnings,
    };
}
