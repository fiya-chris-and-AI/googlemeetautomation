import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '../../../../lib/supabase';
import { generateCombinedPrompt, validateItemsCombination } from '@meet-pipeline/shared';

export const dynamic = 'force-dynamic';

/**
 * POST /api/action-items/power-prompt
 *
 * Generate a combined "Power Prompt" for multiple selected action items.
 * Gathers all meeting contexts, normalizes, and calls Gemini to produce
 * a single cohesive mega-prompt optimized for Claude 4.6 Opus.
 *
 * Body: { itemIds: string[] }
 *
 * Response: {
 *   prompt: string,
 *   itemCount: number,
 *   categories: string[],
 *   warnings: string[],
 *   model: string,
 *   generatedAt: string
 * }
 */
export async function POST(req: NextRequest) {
    const body = await req.json().catch(() => ({}));
    const { itemIds } = body as { itemIds?: string[] };

    // ── Input validation ──

    if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
        return NextResponse.json(
            { error: 'itemIds must be a non-empty array of action item IDs' },
            { status: 400 },
        );
    }

    if (itemIds.length > 20) {
        return NextResponse.json(
            { error: 'Cannot combine more than 20 items at once — select fewer items for best results' },
            { status: 400 },
        );
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
        return NextResponse.json(
            { error: 'GEMINI_API_KEY is not configured' },
            { status: 503 },
        );
    }

    const supabase = getServerSupabase();

    // ── Fetch all selected items ──

    const { data: items, error: itemsError } = await supabase
        .from('action_items')
        .select('*')
        .in('id', itemIds);

    if (itemsError) {
        console.error('[power-prompt] Supabase error:', itemsError);
        return NextResponse.json(
            { error: 'Failed to fetch action items' },
            { status: 500 },
        );
    }

    if (!items || items.length === 0) {
        return NextResponse.json(
            { error: 'No action items found for the provided IDs' },
            { status: 404 },
        );
    }

    // ── Validate combination ──

    const validation = validateItemsCombination(items);
    if (!validation.isValid) {
        return NextResponse.json(
            { error: validation.errors.join('; ') },
            { status: 400 },
        );
    }

    if (validation.warnings.length > 0) {
        console.warn('[power-prompt] Warnings:', validation.warnings);
    }

    // ── Generate the combined prompt ──

    try {
        const generated = await generateCombinedPrompt(items, supabase, geminiKey);
        const now = new Date().toISOString();

        // Log the generation
        await supabase.from('activity_log').insert({
            event_type: 'power_prompt_generated',
            entity_type: 'action_items',
            entity_id: itemIds.join(','),
            actor: 'system',
            summary: `Power prompt generated for ${items.length} items: ${items.map(i => i.title).slice(0, 3).join(', ')}${items.length > 3 ? '…' : ''}`,
            metadata: {
                item_ids: itemIds,
                item_count: items.length,
                categories: generated.categories,
                model: generated.model,
                warnings: generated.warnings,
            },
        });

        // Persist to unified_prompts table for history & feedback
        const { data: unified } = await supabase
            .from('unified_prompts')
            .insert({
                action_item_ids: itemIds,
                prompt_text: generated.prompt,
                prompt_model: generated.model,
            })
            .select('id')
            .single();

        return NextResponse.json({
            prompt: generated.prompt,
            itemCount: items.length,
            categories: generated.categories,
            warnings: generated.warnings,
            model: generated.model,
            generatedAt: now,
            unifiedPromptId: unified?.id ?? null,
        }, { status: 201 });
    } catch (error: any) {
        console.error('[power-prompt] Generation failed:', error);
        return NextResponse.json(
            { error: error.message || 'Power prompt generation failed' },
            { status: 500 },
        );
    }
}
