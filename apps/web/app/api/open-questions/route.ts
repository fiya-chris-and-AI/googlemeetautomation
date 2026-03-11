import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '../../../lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * GET /api/open-questions — List open questions with filtering and sorting.
 *
 * Query params:
 *   status      — exact match or comma-separated (default: "open")
 *   topic       — exact match
 *   sort        — created_at (default: created_at)
 *   order       — asc | desc (default: desc)
 *   limit       — max rows (default: 1000, max: 5000)
 *   search      — text search in question_text
 */
export async function GET(req: NextRequest) {
    try {
        const supabase = getServerSupabase();
        const { searchParams } = req.nextUrl;

        const sortCol = ['created_at', 'updated_at'].includes(searchParams.get('sort') ?? '')
            ? searchParams.get('sort')!
            : 'created_at';
        const ascending = searchParams.get('order') === 'asc';
        const limit = Math.min(parseInt(searchParams.get('limit') ?? '1000', 10) || 1000, 5000);

        let query = supabase
            .from('open_questions')
            .select('*, transcripts(meeting_title)')
            .order(sortCol, { ascending })
            .limit(limit);

        const status = searchParams.get('status') ?? 'open';
        if (status !== 'all') {
            const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
            query = statuses.length === 1
                ? query.eq('status', statuses[0])
                : query.in('status', statuses);
        }

        const topic = searchParams.get('topic');
        if (topic) query = query.eq('topic', topic);

        const raisedBy = searchParams.get('raised_by');
        if (raisedBy) query = query.eq('raised_by', raisedBy);

        const search = searchParams.get('search');
        if (search) query = query.or(`question_text.ilike.%${search}%,context.ilike.%${search}%`);

        const { data, error } = await query;

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Flatten the joined meeting_title onto each question
        const withTitles = (data ?? []).map((q: any) => ({
            ...q,
            meeting_title: q.transcripts?.meeting_title ?? null,
            transcripts: undefined,
        }));

        return NextResponse.json(withTitles);
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
