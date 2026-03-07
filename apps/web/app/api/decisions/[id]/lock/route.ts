import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '../../../../../lib/supabase';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/decisions/:id/lock — Lock a decision.
 * Body: { actor: 'Lutfiya Miller' | 'Chris Müller' }
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
    const { id } = await params;
    const { actor } = await req.json();

    if (!actor || !['Lutfiya Miller', 'Chris Müller'].includes(actor)) {
        return NextResponse.json({ error: 'Valid actor required' }, { status: 400 });
    }

    const supabase = getServerSupabase();
    const now = new Date().toISOString();

    const { data, error } = await supabase
        .from('decisions')
        .update({ is_locked: true, locked_by: actor, locked_at: now, updated_at: now })
        .eq('id', id)
        .is('archived_at', null)          // Cannot lock already-archived items
        .select()
        .single();

    if (error || !data) {
        return NextResponse.json({ error: 'Decision not found or already archived' }, { status: 404 });
    }

    await supabase.from('activity_log').insert({
        event_type: 'decision_locked',
        entity_type: 'decision',
        entity_id: id,
        actor,
        summary: `Decision locked: ${data.decision_text.slice(0, 80)}`,
        metadata: { locked_by: actor },
    });

    return NextResponse.json(data);
}

/**
 * DELETE /api/decisions/:id/lock — Unlock a decision.
 * Body: { actor: 'Lutfiya Miller' | 'Chris Müller' }
 * Unlocking resets the 24h TTL by updating updated_at.
 */
export async function DELETE(req: NextRequest, { params }: RouteContext) {
    const { id } = await params;
    const { actor } = await req.json();

    if (!actor || !['Lutfiya Miller', 'Chris Müller'].includes(actor)) {
        return NextResponse.json({ error: 'Valid actor required' }, { status: 400 });
    }

    const supabase = getServerSupabase();
    const now = new Date().toISOString();

    // Unlock and reset TTL anchor (updated_at = now)
    const { data, error } = await supabase
        .from('decisions')
        .update({ is_locked: false, locked_by: null, locked_at: null, updated_at: now })
        .eq('id', id)
        .select()
        .single();

    if (error || !data) {
        return NextResponse.json({ error: 'Decision not found' }, { status: 404 });
    }

    await supabase.from('activity_log').insert({
        event_type: 'decision_unlocked',
        entity_type: 'decision',
        entity_id: id,
        actor,
        summary: `Decision unlocked (24h TTL restarted): ${data.decision_text.slice(0, 80)}`,
        metadata: { unlocked_by: actor },
    });

    return NextResponse.json(data);
}
