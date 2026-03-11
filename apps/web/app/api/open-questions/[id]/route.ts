import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '../../../../lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/open-questions/[id] — Update an open question's status or other fields.
 */
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await params;
        const body = await req.json();
        const supabase = getServerSupabase();

        // Only allow specific field updates
        const allowedFields = ['status', 'resolution', 'is_locked', 'topic', 'raised_by'];
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

        for (const field of allowedFields) {
            if (field in body) {
                updates[field] = body[field];
            }
        }

        const { data, error } = await supabase
            .from('open_questions')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data);
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
