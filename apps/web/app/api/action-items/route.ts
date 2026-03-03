import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '../../../lib/supabase';
import type { ActionItem } from '@meet-pipeline/shared';

export const dynamic = 'force-dynamic';

/** Valid columns for sorting action items. */
const SORT_COLUMNS: Record<string, string> = {
    created_at: 'created_at',
    due_date: 'due_date',
    priority: 'priority',
};

/**
 * GET /api/action-items — List action items with filtering and sorting.
 *
 * Query params:
 *   status       — comma-separated list (e.g. "open,in_progress")
 *   assigned_to  — exact match
 *   transcript_id — exact match
 *   priority     — exact match
 *   sort         — created_at | due_date | priority (default: created_at)
 *   order        — asc | desc (default: desc)
 */
export async function GET(req: NextRequest) {
    try {
        const supabase = getServerSupabase();
        const { searchParams } = req.nextUrl;

        const sortCol = SORT_COLUMNS[searchParams.get('sort') ?? ''] ?? 'created_at';
        const ascending = searchParams.get('order') === 'asc';

        let query = supabase
            .from('action_items')
            .select('*')
            .order(sortCol, { ascending })
            .limit(100);

        // Comma-separated status filter → Supabase .in()
        const status = searchParams.get('status');
        if (status) {
            const statuses = status.split(',').map((s) => s.trim()).filter(Boolean);
            query = statuses.length === 1
                ? query.eq('status', statuses[0])
                : query.in('status', statuses);
        }

        const assignedTo = searchParams.get('assigned_to');
        if (assignedTo) query = query.eq('assigned_to', assignedTo);

        const transcriptId = searchParams.get('transcript_id');
        if (transcriptId) query = query.eq('transcript_id', transcriptId);

        const priority = searchParams.get('priority');
        if (priority) query = query.eq('priority', priority);

        const { data, error } = await query;

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data ?? []);
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

/**
 * POST /api/action-items — Create a new action item.
 */
export async function POST(req: NextRequest) {
    try {
        const supabase = getServerSupabase();
        const body = (await req.json()) as Partial<ActionItem>;

        if (!body.title?.trim()) {
            return NextResponse.json({ error: 'title is required' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('action_items')
            .insert({
                title: body.title.trim(),
                description: body.description ?? null,
                transcript_id: body.transcript_id ?? null,
                assigned_to: body.assigned_to ?? null,
                status: body.status ?? 'open',
                priority: body.priority ?? 'medium',
                due_date: body.due_date ?? null,
                source_text: body.source_text ?? null,
                created_by: body.created_by ?? 'manual',
                group_label: body.group_label ?? null,
            })
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Log the creation in activity_log
        await supabase.from('activity_log').insert({
            event_type: 'action_item_created',
            entity_type: 'action_item',
            entity_id: data.id,
            actor: body.created_by === 'ai' ? 'system' : 'Lutfiya',
            summary: `Action item created: ${data.title}`,
            metadata: { priority: data.priority, assigned_to: data.assigned_to },
        });

        return NextResponse.json(data, { status: 201 });
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
