import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '../../../lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * GET /api/archive — List archived action items and decisions.
 * Query params:
 *   type    — 'action_items' | 'decisions' | 'all' (default: 'all')
 *   limit   — max rows per type (default: 100)
 *   search  — text search
 */
export async function GET(req: NextRequest) {
    const supabase = getServerSupabase();
    const { searchParams } = req.nextUrl;
    const type = searchParams.get('type') ?? 'all';
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '100', 10) || 100, 500);
    const search = searchParams.get('search');

    const result: { action_items: any[]; decisions: any[] } = { action_items: [], decisions: [] };

    if (type === 'all' || type === 'action_items') {
        let q = supabase
            .from('action_items')
            .select('*')
            .not('archived_at', 'is', null)
            .order('archived_at', { ascending: false })
            .limit(limit);
        if (search) q = q.ilike('title', `%${search}%`);
        const { data } = await q;
        result.action_items = data ?? [];
    }

    if (type === 'all' || type === 'decisions') {
        let q = supabase
            .from('decisions')
            .select('*, transcripts(meeting_title)')
            .not('archived_at', 'is', null)
            .order('archived_at', { ascending: false })
            .limit(limit);
        if (search) q = q.or(`decision_text.ilike.%${search}%,topic.ilike.%${search}%`);
        const { data } = await q;
        result.decisions = (data ?? []).map((d: any) => ({
            ...d,
            meeting_title: d.transcripts?.meeting_title ?? null,
            transcripts: undefined,
        }));
    }

    return NextResponse.json(result);
}

/**
 * POST /api/archive — Trigger the archive_expired_items() function.
 * Called by cron job or manually. Returns count of archived items.
 */
export async function POST() {
    const supabase = getServerSupabase();
    const { data, error } = await supabase.rpc('archive_expired_items');

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Log the archival run
    await supabase.from('activity_log').insert({
        event_type: 'auto_archive_run',
        entity_type: 'system',
        entity_id: null,
        actor: 'system',
        summary: `Auto-archive: ${data.action_items_archived} action items, ${data.decisions_archived} decisions archived`,
        metadata: data,
    });

    return NextResponse.json(data);
}
