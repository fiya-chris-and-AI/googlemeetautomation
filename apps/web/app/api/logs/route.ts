import { NextResponse } from 'next/server';
import { getServerSupabase } from '../../../lib/supabase';

// Prevent Next.js from caching this route
export const dynamic = 'force-dynamic';

/**
 * GET /api/logs — Fetch all processing log entries, newest first.
 */
export async function GET() {
    try {
        const supabase = getServerSupabase();

        const { data, error } = await supabase
            .from('processing_log')
            .select('*')
            .order('processed_at', { ascending: false })
            .limit(200);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data ?? []);
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
