import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '../../../../lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * POST /api/archive/restore — Restore an archived item.
 * Body: { entity_type: 'action_item' | 'decision', id: string, actor: string }
 * Auto-locks on restore to prevent immediate re-archival.
 */
export async function POST(req: NextRequest) {
    const { entity_type, id, actor } = await req.json();

    if (!['action_item', 'decision'].includes(entity_type)) {
        return NextResponse.json({ error: 'entity_type must be action_item or decision' }, { status: 400 });
    }
    if (!actor || !['Lutfiya Miller', 'Chris Müller'].includes(actor)) {
        return NextResponse.json({ error: 'Valid actor required' }, { status: 400 });
    }

    const supabase = getServerSupabase();
    const now = new Date().toISOString();

    const table = entity_type === 'action_item' ? 'action_items' : 'decisions';
    const restoreStatus = entity_type === 'action_item' ? 'open' : 'active';

    const { data, error } = await supabase
        .from(table)
        .update({
            archived_at: null,
            status: restoreStatus,
            is_locked: true,           // Auto-lock on restore so it doesn't immediately re-archive
            locked_by: actor,
            locked_at: now,
            updated_at: now,
        })
        .eq('id', id)
        .select()
        .single();

    if (error || !data) {
        return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    await supabase.from('activity_log').insert({
        event_type: `${entity_type}_restored`,
        entity_type,
        entity_id: id,
        actor,
        summary: `Restored from archive and locked: ${(data as any).title ?? (data as any).decision_text?.slice(0, 80)}`,
        metadata: { restored_by: actor },
    });

    return NextResponse.json(data);
}
