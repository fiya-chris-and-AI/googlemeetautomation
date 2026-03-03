import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '../../../../lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * POST /api/action-items/group — Use AI to assign group labels to action items.
 *
 * Body: { force?: boolean }
 *   force: false (default) — only group items where group_label IS NULL
 *   force: true — re-group ALL non-dismissed items (overwrites existing labels)
 */
export async function POST(req: NextRequest) {
    try {
        const body = (await req.json().catch(() => ({}))) as { force?: boolean };
        const force = body.force === true;

        const anthropicKey = process.env.ANTHROPIC_API_KEY;
        if (!anthropicKey) {
            return NextResponse.json(
                { error: 'ANTHROPIC_API_KEY is not configured' },
                { status: 503 }
            );
        }

        const supabase = getServerSupabase();

        // Fetch items to group
        let query = supabase
            .from('action_items')
            .select('id, title, description')
            .neq('status', 'dismissed');

        if (!force) {
            query = query.is('group_label', null);
        }

        const { data: items, error: fetchError } = await query;

        if (fetchError) {
            return NextResponse.json({ error: fetchError.message }, { status: 500 });
        }

        if (!items || items.length === 0) {
            return NextResponse.json({ message: 'No items to group', updated: 0 });
        }

        // Build the payload for Claude
        const itemsPayload = items.map((i) => ({
            id: i.id,
            title: i.title,
            description: i.description,
        }));

        const systemPrompt = `You are organizing action items into logical groups for a task management dashboard.

Below is a JSON array of action items. Each has an "id", "title", and optional "description".

Your job:
1. Identify items that belong to the same project, product, tool, client, initiative, or topic.
2. Assign a short group label (1–3 words, title-cased) to each item.
3. Items that don't clearly belong to any group should get group_label: null.
4. A group must have at least 2 items. If only 1 item relates to a topic, set its group_label to null.
5. Be conservative — only group items that are genuinely related, not just vaguely similar.

Return a JSON object where keys are item IDs and values are the group label (string) or null.
Example: { "abc123": "Raggy", "def456": "Raggy", "ghi789": "Website UI", "jkl012": null }

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
                        content: JSON.stringify(itemsPayload),
                    },
                ],
            }),
        });

        const anthropicData = (await anthropicRes.json()) as { content?: { text?: string }[] };
        const rawText: string = anthropicData.content?.[0]?.text ?? '{}';

        // Parse the grouping mapping
        let mapping: Record<string, string | null>;
        try {
            mapping = JSON.parse(rawText);
            if (typeof mapping !== 'object' || Array.isArray(mapping)) {
                throw new Error('Expected an object');
            }
        } catch {
            return NextResponse.json(
                { error: 'AI returned invalid JSON', raw: rawText },
                { status: 502 }
            );
        }

        // Batch-update each item with its group_label
        let updated = 0;
        for (const [itemId, groupLabel] of Object.entries(mapping)) {
            const { error: updateError } = await supabase
                .from('action_items')
                .update({
                    group_label: groupLabel || null,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', itemId);

            if (!updateError) updated++;
        }

        // Log the grouping action
        await supabase.from('activity_log').insert({
            event_type: 'action_items_grouped',
            entity_type: 'action_item',
            entity_id: null,
            actor: 'system',
            summary: `AI grouped ${updated} action items (force=${force})`,
            metadata: { force, items_processed: items.length, items_updated: updated },
        });

        return NextResponse.json({ message: 'Grouping complete', updated });
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error('Group action items error:', msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
