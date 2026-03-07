import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/archive — Vercel Cron or external cron hits this endpoint.
 * Triggers the archive_expired_items() RPC.
 * Protected with a CRON_SECRET env var.
 */
export async function GET(req: NextRequest) {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Delegate to the archive run endpoint
    const res = await fetch(new URL('/api/archive', req.url).toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
    });

    const data = await res.json();
    return NextResponse.json(data);
}
