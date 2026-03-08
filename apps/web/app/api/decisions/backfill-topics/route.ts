import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '../../../../lib/supabase';
import { callGemini, stripMarkdownFences } from '@meet-pipeline/shared';

export const dynamic = 'force-dynamic';

/**
 * POST /api/decisions/backfill-topics — Assign topics to decisions that don't have one.
 *
 * Uses Gemini to generate a short 2-5 word topic label for each decision
 * based on its decision_text. Processes in batches of 50 to stay within
 * token limits.
 *
 * Body (optional): { batchSize?: number }   // default 50, max 200
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

        const supabase = getServerSupabase();

        // Fetch decisions missing a topic
        const { data: decisions, error: fetchErr } = await supabase
            .from('decisions')
            .select('id, decision_text, domain')
            .is('topic', null)
            .order('created_at', { ascending: false })
            .limit(batchSize);

        if (fetchErr) {
            return NextResponse.json({ error: fetchErr.message }, { status: 500 });
        }

        if (!decisions || decisions.length === 0) {
            return NextResponse.json({ updated: 0, message: 'All decisions already have topics' });
        }

        // Build a numbered list for the AI prompt
        const numberedList = decisions
            .map((d, i) => `${i + 1}. [${d.domain}] ${d.decision_text}`)
            .join('\n');

        const systemPrompt = `You assign short topic labels to decisions. For each decision, produce a 2-5 word topic label that captures the subject area (e.g. "Auth provider", "Launch timeline", "WhatsApp integration", "Sidebar design", "Meeting cadence", "Lock feature").

Rules:
- Group related decisions under the SAME topic label when they cover the same subject
- Use Title Case (e.g. "Transcript Editing" not "transcript editing")
- Be specific enough to distinguish topics, but general enough to group related items
- Keep labels between 2-5 words

Return ONLY a JSON array of objects with { "index": number, "topic": string } — one per input decision. No markdown fences or extra text.`;

        const userMessage = `Assign topic labels to these ${decisions.length} decisions:\n\n${numberedList}`;

        const rawText = await callGemini(systemPrompt, userMessage, geminiKey, {
            maxOutputTokens: 8192,
        });

        const cleaned = stripMarkdownFences(rawText);
        const assignments: { index: number; topic: string }[] = JSON.parse(cleaned || '[]');

        if (!Array.isArray(assignments)) {
            return NextResponse.json({ error: 'Unexpected AI response format' }, { status: 500 });
        }

        // Apply topic updates
        let updated = 0;
        for (const assignment of assignments) {
            const idx = assignment.index - 1; // 1-indexed → 0-indexed
            if (idx < 0 || idx >= decisions.length || !assignment.topic?.trim()) continue;

            const { error: updateErr } = await supabase
                .from('decisions')
                .update({ topic: assignment.topic.trim() })
                .eq('id', decisions[idx].id);

            if (!updateErr) updated++;
        }

        console.log(`[backfill-topics] Updated ${updated}/${decisions.length} decisions with topics`);

        return NextResponse.json({
            updated,
            total: decisions.length,
            remaining: await countRemaining(supabase),
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error('[backfill-topics] Error:', msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

/** Count how many decisions still have no topic. */
async function countRemaining(supabase: ReturnType<typeof getServerSupabase>) {
    const { count } = await supabase
        .from('decisions')
        .select('id', { count: 'exact', head: true })
        .is('topic', null);
    return count ?? 0;
}
