import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '../../../../lib/supabase';
import type { ActionItem } from '@meet-pipeline/shared';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/action-items/:id — Fetch a single action item.
 */
export async function GET(
    _req: NextRequest,
    { params }: RouteContext
) {
    try {
        const { id } = await params;
        const supabase = getServerSupabase();

        const { data, error } = await supabase
            .from('action_items')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !data) {
            return NextResponse.json({ error: 'Action item not found' }, { status: 404 });
        }

        return NextResponse.json(data);
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

/**
 * PATCH /api/action-items/:id — Update an action item (status, priority, etc.).
 */
export async function PATCH(
    req: NextRequest,
    { params }: RouteContext
) {
    try {
        const { id } = await params;
        const supabase = getServerSupabase();
        const body = (await req.json()) as Partial<ActionItem>;

        // Build the update payload — only include fields that were sent
        const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

        if (body.title !== undefined) update.title = body.title;
        if (body.description !== undefined) update.description = body.description;
        if (body.assigned_to !== undefined) update.assigned_to = body.assigned_to;
        if (body.priority !== undefined) update.priority = body.priority;
        if (body.due_date !== undefined) update.due_date = body.due_date;
        if (body.group_label !== undefined) update.group_label = body.group_label || null;
        if (body.status !== undefined) {
            update.status = body.status;
            // Auto-set completed_at when marking done
            if (body.status === 'done') {
                update.completed_at = new Date().toISOString();
            } else {
                update.completed_at = null;
            }
        }

        const { data, error } = await supabase
            .from('action_items')
            .update(update)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        if (!data) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }

        // Log the update
        await supabase.from('activity_log').insert({
            event_type: 'action_item_updated',
            entity_type: 'action_item',
            entity_id: id,
            actor: 'Lutfiya',
            summary: `Action item updated: ${data.title}`,
            metadata: { changes: Object.keys(update).filter((k) => k !== 'updated_at') },
        });

        return NextResponse.json(data);
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

/**
 * DELETE /api/action-items/:id — Soft-delete by setting status to 'dismissed'.
 */
export async function DELETE(
    _req: NextRequest,
    { params }: RouteContext
) {
    try {
        const { id } = await params;
        const supabase = getServerSupabase();

        const { data, error } = await supabase
            .from('action_items')
            .update({ status: 'dismissed', updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();

        if (error || !data) {
            return NextResponse.json({ error: 'Action item not found' }, { status: 404 });
        }

        // Log the dismissal
        await supabase.from('activity_log').insert({
            event_type: 'action_item_updated',
            entity_type: 'action_item',
            entity_id: id,
            actor: 'Lutfiya',
            summary: `Action item dismissed: ${data.title}`,
            metadata: { previous_status: 'unknown', new_status: 'dismissed' },
        });

        return NextResponse.json(data);
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
