import { NextResponse } from 'next/server';
import { getServerSupabase } from '../../../../lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * POST /api/action-items/estimate-effort
 *
 * Batch-estimate effort for action items that have effort = NULL.
 * Uses Claude to classify each item as quick_fix | moderate | significant.
 *
 * Follows the same pattern as /api/action-items/group.
 */
export async function POST() {
    try {
        const anthropicKey = process.env.ANTHROPIC_API_KEY;
        if (!anthropicKey) {
            return NextResponse.json(
                { error: 'ANTHROPIC_API_KEY is not configured' },
                { status: 503 },
            );
        }

        const supabase = getServerSupabase();

        // Fetch items missing effort estimation
        const { data: items, error: fetchError } = await supabase
            .from('action_items')
            .select('id, title, description')
            .is('effort', null)
            .neq('status', 'dismissed');

        if (fetchError) {
            return NextResponse.json({ error: fetchError.message }, { status: 500 });
        }

        if (!items || items.length === 0) {
            return NextResponse.json({ message: 'No items to estimate', updated: 0 });
        }

        // Build payload for Claude
        const payload = items.map((i) => ({
            id: i.id,
            title: i.title,
            description: i.description,
        }));

        const systemPrompt = `You estimate the effort required for action items.

Below is a JSON array of action items. Each has an "id", "title", and optional "description".

For each item, classify the effort as one of:
- "quick_fix" — Can likely be done in under 30 minutes (e.g. sending an email, a quick decision, looking something up, a short reply)
- "moderate" — Likely takes 30 minutes to a few hours (e.g. writing a short document, setting up a tool, having a focused work session, scheduling and conducting a call)
- "significant" — Likely takes multiple hours or spans multiple days (e.g. building a feature, conducting research, creating a presentation, coordinating across multiple people or steps)

Base your estimate on the nature and complexity of the task, not on its urgency or priority.

Return a JSON object where keys are item IDs and values are the effort level string.
Every item must be included in the output.
Example: { "abc123": "quick_fix", "def456": "moderate", "ghi789": "significant" }

Return ONLY valid JSON, no markdown fences or extra text.`;

        const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': anthropicKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 8192,
                system: systemPrompt,
                messages: [
                    {
                        role: 'user',
                        content: JSON.stringify(payload),
                    },
                ],
            }),
        });

        const anthropicData = (await anthropicRes.json()) as { content?: { text?: string }[] };
        const rawText: string = anthropicData.content?.[0]?.text ?? '{}';

        // Parse the effort mapping
        let mapping: Record<string, string>;
        try {
            mapping = JSON.parse(rawText);
            if (typeof mapping !== 'object' || Array.isArray(mapping)) {
                throw new Error('Expected an object');
            }
        } catch {
            return NextResponse.json(
                { error: 'AI returned invalid JSON', raw: rawText },
                { status: 502 },
            );
        }

        // Validate and batch-update each item
        const VALID_EFFORTS = new Set(['quick_fix', 'moderate', 'significant']);
        let updated = 0;

        for (const [itemId, effortLevel] of Object.entries(mapping)) {
            if (!VALID_EFFORTS.has(effortLevel)) continue;

            const { error: updateError } = await supabase
                .from('action_items')
                .update({
                    effort: effortLevel,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', itemId);

            if (!updateError) updated++;
        }

        // Log the estimation action
        await supabase.from('activity_log').insert({
            event_type: 'action_items_effort_estimated',
            entity_type: 'action_item',
            entity_id: null,
            actor: 'system',
            summary: `AI estimated effort for ${updated} action items`,
            metadata: { items_processed: items.length, items_updated: updated },
        });

        return NextResponse.json({ message: 'Effort estimation complete', updated });
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error('Estimate effort error:', msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
