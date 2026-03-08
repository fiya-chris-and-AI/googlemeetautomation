import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '../../../../../lib/supabase';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * PATCH /api/action-items/unified-prompt/:id — Submit feedback on a unified prompt.
 *
 * Body: { feedback: 'useful' | 'not_useful' }
 */
export async function PATCH(req: NextRequest, { params }: RouteContext) {
    try {
        const { id } = await params;
        const supabase = getServerSupabase();
        const body = await req.json();

        const feedback = body.feedback;
        if (!feedback || !['useful', 'not_useful'].includes(feedback)) {
            return NextResponse.json(
                { error: 'feedback must be "useful" or "not_useful"' },
                { status: 400 },
            );
        }

        const { data, error } = await supabase
            .from('unified_prompts')
            .update({ feedback })
            .eq('id', id)
            .select('id, feedback')
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        if (!data) {
            return NextResponse.json({ error: 'Unified prompt not found' }, { status: 404 });
        }

        return NextResponse.json(data);
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
