import { NextResponse } from 'next/server';
import { getServerSupabase } from '../../../../lib/supabase';

// Prevent Next.js from caching this route
export const dynamic = 'force-dynamic';

/**
 * GET /api/transcripts/[id] — Fetch a single transcript by ID.
 */
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = getServerSupabase();

        const { data, error } = await supabase
            .from('transcripts')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !data) {
            return NextResponse.json({ error: 'Transcript not found' }, { status: 404 });
        }

        const transcript = {
            transcript_id: data.id,
            meeting_title: data.meeting_title,
            meeting_date: data.meeting_date,
            participants: data.participants,
            raw_transcript: data.raw_transcript,
            source_email_id: data.source_email_id,
            extraction_method: data.extraction_method,
            word_count: data.word_count,
            processed_at: data.processed_at,
        };

        return NextResponse.json(transcript);
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
