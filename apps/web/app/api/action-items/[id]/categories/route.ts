import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '../../../../../lib/supabase';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * PUT /api/action-items/:id/categories — Replace all categories for an action item.
 *
 * Body: {
 *   category_ids: string[],     // existing category IDs to assign
 *   new_categories?: string[]   // new category names to create then assign
 * }
 *
 * Strategy: delete all existing junction rows, insert new ones.
 * New categories are created inline (with auto-slug and color).
 */
export async function PUT(req: NextRequest, { params }: RouteContext) {
    try {
        const { id } = await params;
        const supabase = getServerSupabase();
        const body = await req.json();

        let categoryIds: string[] = body.category_ids ?? [];
        const newCategoryNames: string[] = body.new_categories ?? [];

        // Verify the action item exists
        const { data: item, error: itemError } = await supabase
            .from('action_items')
            .select('id, title')
            .eq('id', id)
            .single();

        if (itemError || !item) {
            return NextResponse.json({ error: 'Action item not found' }, { status: 404 });
        }

        // Create any new categories inline
        for (const name of newCategoryNames) {
            const trimmed = name.trim();
            if (!trimmed) continue;

            const slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

            const { data: created, error: createError } = await supabase
                .from('categories')
                .upsert({ name: trimmed, slug, created_by: 'manual' }, { onConflict: 'name' })
                .select('id')
                .single();

            if (created) {
                categoryIds.push(created.id);
            }
        }

        // Deduplicate IDs
        categoryIds = [...new Set(categoryIds)];

        // Delete existing junction rows for this item
        await supabase
            .from('action_item_categories')
            .delete()
            .eq('action_item_id', id);

        // Insert new junction rows
        if (categoryIds.length > 0) {
            const rows = categoryIds.map(catId => ({
                action_item_id: id,
                category_id: catId,
            }));

            const { error: insertError } = await supabase
                .from('action_item_categories')
                .insert(rows);

            if (insertError) {
                return NextResponse.json({ error: insertError.message }, { status: 500 });
            }
        }

        // Fetch the updated categories for this item
        const { data: updatedCategories } = await supabase
            .from('action_item_categories')
            .select('category:categories(*)')
            .eq('action_item_id', id);

        const categories = (updatedCategories ?? []).map((row: any) => row.category);

        // Log the update
        await supabase.from('activity_log').insert({
            event_type: 'categories_updated',
            entity_type: 'action_item',
            entity_id: id,
            actor: 'Lutfiya',
            summary: `Categories updated for: ${item.title}`,
            metadata: { category_count: categories.length, category_ids: categoryIds },
        });

        return NextResponse.json({ categories });
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
