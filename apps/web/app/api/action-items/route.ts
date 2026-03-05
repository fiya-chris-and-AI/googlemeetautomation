import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '../../../lib/supabase';
import type { ActionItem } from '@meet-pipeline/shared';
import { normalizeAssignee } from '@meet-pipeline/shared';

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
 *   limit        — max rows (default: 1000, max: 5000)
 */
export async function GET(req: NextRequest) {
    try {
        const supabase = getServerSupabase();
        const { searchParams } = req.nextUrl;

        const sortCol = SORT_COLUMNS[searchParams.get('sort') ?? ''] ?? 'created_at';
        const ascending = searchParams.get('order') === 'asc';
        const limit = Math.min(
            parseInt(searchParams.get('limit') ?? '1000', 10) || 1000,
            5000,
        );

        let query = supabase
            .from('action_items')
            .select('*')
            .order(sortCol, { ascending })
            .limit(limit);

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

        const effort = searchParams.get('effort');
        if (effort) query = query.eq('effort', effort);

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

        // Normalize assignee — may yield 0, 1, or 2 canonical names
        const assignees = normalizeAssignee(body.assigned_to);
        const names = assignees.length > 0 ? assignees : [null];

        const rows = names.map((name) => ({
            title: body.title!.trim(),
            description: body.description ?? null,
            transcript_id: body.transcript_id ?? null,
            assigned_to: name,
            status: body.status ?? 'open',
            priority: body.priority ?? 'medium',
            effort: body.effort ?? null,
            due_date: body.due_date ?? null,
            source_text: body.source_text ?? null,
            created_by: body.created_by ?? 'manual',
            group_label: body.group_label ?? null,
        }));

        const { data, error } = await supabase
            .from('action_items')
            .insert(rows)
            .select();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const inserted = data ?? [];

        // Log each creation in activity_log
        for (const item of inserted) {
            await supabase.from('activity_log').insert({
                event_type: 'action_item_created',
                entity_type: 'action_item',
                entity_id: item.id,
                actor: body.created_by === 'ai' ? 'system' : 'Lutfiya',
                summary: `Action item created: ${item.title}`,
                metadata: { priority: item.priority, assigned_to: item.assigned_to },
            });
        }

        // Return first item for single-assignee case (backward compat), full array otherwise
        return NextResponse.json(inserted.length === 1 ? inserted[0] : inserted, { status: 201 });
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
