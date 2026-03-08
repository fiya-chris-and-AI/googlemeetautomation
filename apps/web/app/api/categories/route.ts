import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '../../../lib/supabase';
import type { Category } from '@meet-pipeline/shared';

export const dynamic = 'force-dynamic';

/**
 * GET /api/categories — List all categories sorted by popularity.
 */
export async function GET() {
    try {
        const supabase = getServerSupabase();

        const { data, error } = await supabase
            .from('categories')
            .select('*')
            .order('usage_count', { ascending: false });

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data ?? []);
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

/** Auto-generate a URL-safe slug from a category name. */
function toSlug(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/** Rotating palette for auto-assigning colors to new categories. */
const COLOR_PALETTE = [
    '#8b5cf6', '#6366f1', '#3b82f6', '#06b6d4',
    '#14b8a6', '#22c55e', '#eab308', '#f97316',
    '#ef4444', '#ec4899', '#a855f7', '#64748b',
];

/**
 * POST /api/categories — Create a new category.
 *
 * Body: { name: string, color?: string }
 */
export async function POST(req: NextRequest) {
    try {
        const supabase = getServerSupabase();
        const body = await req.json();

        const name = body.name?.trim();
        if (!name) {
            return NextResponse.json({ error: 'name is required' }, { status: 400 });
        }

        const slug = toSlug(name);

        // Pick a color from the palette if none provided
        let color = body.color ?? null;
        if (!color) {
            // Get existing colors to avoid duplicates
            const { data: existing } = await supabase
                .from('categories')
                .select('color');
            const usedColors = new Set((existing ?? []).map((c: { color: string | null }) => c.color));
            color = COLOR_PALETTE.find(c => !usedColors.has(c)) ?? COLOR_PALETTE[0];
        }

        const { data, error } = await supabase
            .from('categories')
            .insert({ name, slug, color, created_by: 'manual' })
            .select()
            .single();

        if (error) {
            // Handle unique constraint violation (duplicate name)
            if (error.code === '23505') {
                return NextResponse.json({ error: `Category "${name}" already exists` }, { status: 409 });
            }
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Log the creation
        await supabase.from('activity_log').insert({
            event_type: 'category_created',
            entity_type: 'category',
            entity_id: data.id,
            actor: 'Lutfiya',
            summary: `Category created: ${name}`,
            metadata: { slug, color },
        });

        return NextResponse.json(data, { status: 201 });
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
