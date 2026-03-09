import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '../../../../lib/supabase';
import { callGemini, stripMarkdownFences, ACTION_ITEM_TOPIC_CATEGORIES } from '@meet-pipeline/shared';

export const dynamic = 'force-dynamic';

const VALID_GROUPS = new Set<string>(ACTION_ITEM_TOPIC_CATEGORIES);

/**
 * POST /api/action-items/backfill-groups — Re-categorize action item group_labels
 * into the fixed broad-category set.
 *
 * Body (optional):
 *   { batchSize?: number, recategorize?: boolean }
 *
 * - Default: only processes items whose group_label is NULL or not in the valid set.
 * - recategorize: true — re-categorize ALL items (for initial migration).
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
        const batchSize = Math.min(Math.max(parseInt(body.batchSize ?? '100', 10) || 100, 1), 500);
        const recategorize = body.recategorize === true;

        const supabase = getServerSupabase();

        // Fetch action items — either all (recategorize) or only those needing re-grouping
        let query = supabase
            .from('action_items')
            .select('id, title, description')
            .order('created_at', { ascending: false })
            .limit(batchSize);

        if (!recategorize) {
            // Items that are NULL or have a non-standard group_label
            query = query.or(
                `group_label.is.null,group_label.not.in.(${ACTION_ITEM_TOPIC_CATEGORIES.map(c => `"${c}"`).join(',')})`,
            );
        }

        const { data: items, error: fetchErr } = await query;

        if (fetchErr) {
            return NextResponse.json({ error: fetchErr.message }, { status: 500 });
        }

        if (!items || items.length === 0) {
            return NextResponse.json({ updated: 0, message: 'No action items to process' });
        }

        // Build a numbered list for the AI prompt
        const numberedList = items
            .map((item, i) => `${i + 1}. ${item.title}${item.description ? ` — ${item.description}` : ''}`)
            .join('\n');

        const categoryList = ACTION_ITEM_TOPIC_CATEGORIES.join('", "');

        const systemPrompt = `You categorize action items into broad topic groups. For each item, assign exactly one of these categories: "${categoryList}".

Category definitions:
- "UI & Design" — Interface layout, icons, buttons, dashboard, visual style, CSS, colors, frontend components
- "AI & Automation" — AI features, chatbots, agentic workflows, RAG, extraction, model selection, prompts
- "Translation" — i18n, multilingual support, translation services, language features, DeepL
- "DevOps" — Git, deployment, hosting, CI/CD, infrastructure, repos, secrets, migrations, Vercel, Docker
- "Business & Legal" — Pricing, partnerships, contracts, legal, company strategy, payments, invoicing
- "Product Features" — Feature scope, specific app features, action items, search, notifications, mobile app
- "Branding & Content" — YouTube, marketing, mascots, merchandise, website copy, social media, Printful
- "Process & Meetings" — Meeting logistics, workflow, roles, work sharing, scheduling, cadence, hackathons
- "Accounts & Access" — Permissions, login, passwords, account setup, user management, API keys
- "Data & Analytics" — Database, analytics, metrics, monitoring, data models, Supabase queries
- "Documentation" — Docs, READMEs, guides, architecture notes, onboarding, README updates
- "Personal" — Personal decisions, travel, non-work items, health, lifestyle

Rules:
- Use ONLY the categories listed above — do not invent new ones
- Pick the single best fit; when in doubt, prefer the more specific category

Return ONLY a JSON array of objects with { "index": number, "group_label": string } — one per input item. No markdown fences or extra text.`;

        const userMessage = `Categorize these ${items.length} action items:\n\n${numberedList}`;

        const rawText = await callGemini(systemPrompt, userMessage, geminiKey, {
            maxOutputTokens: 16384,
        });

        const cleaned = stripMarkdownFences(rawText);
        const assignments: { index: number; group_label: string }[] = JSON.parse(cleaned || '[]');

        if (!Array.isArray(assignments)) {
            return NextResponse.json({ error: 'Unexpected AI response format' }, { status: 500 });
        }

        // Apply group_label updates — only accept valid categories
        let updated = 0;
        let rejected = 0;
        for (const assignment of assignments) {
            const idx = assignment.index - 1; // 1-indexed → 0-indexed
            const groupLabel = assignment.group_label?.trim();
            if (idx < 0 || idx >= items.length || !groupLabel) continue;

            if (!VALID_GROUPS.has(groupLabel)) {
                rejected++;
                console.warn(`[backfill-groups] Rejected invalid group "${groupLabel}" for item ${items[idx].id}`);
                continue;
            }

            const { error: updateErr } = await supabase
                .from('action_items')
                .update({ group_label: groupLabel })
                .eq('id', items[idx].id);

            if (!updateErr) updated++;
        }

        console.log(`[backfill-groups] Updated ${updated}/${items.length} action items (${rejected} rejected)`);

        // Count remaining items that still need categorization
        const { count } = await supabase
            .from('action_items')
            .select('id', { count: 'exact', head: true })
            .or(
                `group_label.is.null,group_label.not.in.(${ACTION_ITEM_TOPIC_CATEGORIES.map(c => `"${c}"`).join(',')})`,
            );

        return NextResponse.json({
            updated,
            rejected,
            total: items.length,
            remaining: count ?? 0,
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error('[backfill-groups] Error:', msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
