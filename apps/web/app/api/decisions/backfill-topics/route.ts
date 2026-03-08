import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '../../../../lib/supabase';
import { callGemini, stripMarkdownFences, DECISION_TOPIC_CATEGORIES } from '@meet-pipeline/shared';

export const dynamic = 'force-dynamic';

const VALID_TOPICS = new Set<string>(DECISION_TOPIC_CATEGORIES);

/**
 * POST /api/decisions/backfill-topics — Assign broad topic categories to decisions.
 *
 * Body (optional):
 *   { batchSize?: number, recategorize?: boolean }
 *
 * - Default: only processes decisions with topic IS NULL
 * - recategorize: true — re-categorize ALL decisions (e.g. after changing category set)
 */
export async function POST(req: NextRequest) {
    try {
        const geminiKey = process.env.GEMINI_API_KEY;
        if (!geminiKey) {
            return NextResponse.json(
                { error: 'GEMINI_API_KEY is not configured' },
                { status: 503 },
            );
        }

        const body = await req.json().catch(() => ({}));
        const batchSize = Math.min(Math.max(parseInt(body.batchSize ?? '50', 10) || 50, 1), 200);
        const recategorize = body.recategorize === true;

        const supabase = getServerSupabase();

        // Fetch decisions — either all (recategorize) or only those missing a topic
        let query = supabase
            .from('decisions')
            .select('id, decision_text, domain')
            .order('created_at', { ascending: false })
            .limit(batchSize);

        if (!recategorize) {
            query = query.is('topic', null);
        }

        const { data: decisions, error: fetchErr } = await query;

        if (fetchErr) {
            return NextResponse.json({ error: fetchErr.message }, { status: 500 });
        }

        if (!decisions || decisions.length === 0) {
            return NextResponse.json({ updated: 0, message: 'No decisions to process' });
        }

        // Build a numbered list for the AI prompt
        const numberedList = decisions
            .map((d, i) => `${i + 1}. [${d.domain}] ${d.decision_text}`)
            .join('\n');

        const categoryList = DECISION_TOPIC_CATEGORIES.join('", "');

        const systemPrompt = `You categorize decisions into broad topic groups. For each decision, assign exactly one of these categories: "${categoryList}".

Category definitions:
- "UI & Design" — Interface layout, icons, buttons, dashboard, visual style, CSS, colors
- "AI & Automation" — AI features, chatbots, agentic workflows, RAG, extraction, mind maps, model selection
- "Translation" — i18n, multilingual support, translation services, language features
- "DevOps" — Git, deployment, hosting, CI/CD, infrastructure, repos, secrets, migrations
- "Business & Legal" — Pricing, partnerships, contracts, legal, company strategy, payments
- "Product Features" — Feature scope, specific app features, action items, search, notifications
- "Branding & Content" — YouTube, marketing, mascots, merchandise, website copy, social media
- "Process & Meetings" — Meeting logistics, workflow, roles, work sharing, scheduling, cadence
- "Accounts & Access" — Permissions, login, passwords, account setup, user management
- "Personal" — Personal decisions, travel, non-work items

Rules:
- Use ONLY the categories listed above — do not invent new ones
- Pick the single best fit; when in doubt, prefer the more specific category

Return ONLY a JSON array of objects with { "index": number, "topic": string } — one per input decision. No markdown fences or extra text.`;

        const userMessage = `Categorize these ${decisions.length} decisions:\n\n${numberedList}`;

        const rawText = await callGemini(systemPrompt, userMessage, geminiKey, {
            maxOutputTokens: 8192,
        });

        const cleaned = stripMarkdownFences(rawText);
        const assignments: { index: number; topic: string }[] = JSON.parse(cleaned || '[]');

        if (!Array.isArray(assignments)) {
            return NextResponse.json({ error: 'Unexpected AI response format' }, { status: 500 });
        }

        // Apply topic updates — only accept valid categories
        let updated = 0;
        let rejected = 0;
        for (const assignment of assignments) {
            const idx = assignment.index - 1; // 1-indexed → 0-indexed
            const topic = assignment.topic?.trim();
            if (idx < 0 || idx >= decisions.length || !topic) continue;

            if (!VALID_TOPICS.has(topic)) {
                rejected++;
                console.warn(`[backfill-topics] Rejected invalid topic "${topic}" for decision ${decisions[idx].id}`);
                continue;
            }

            const { error: updateErr } = await supabase
                .from('decisions')
                .update({ topic })
                .eq('id', decisions[idx].id);

            if (!updateErr) updated++;
        }

        console.log(`[backfill-topics] Updated ${updated}/${decisions.length} decisions (${rejected} rejected)`);

        // Count remaining uncategorized
        const { count } = await supabase
            .from('decisions')
            .select('id', { count: 'exact', head: true })
            .is('topic', null);

        return NextResponse.json({
            updated,
            rejected,
            total: decisions.length,
            remaining: count ?? 0,
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error('[backfill-topics] Error:', msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
