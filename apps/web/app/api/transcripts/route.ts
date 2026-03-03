import { NextResponse } from 'next/server';
import { getServerSupabase } from '../../../lib/supabase';

// Prevent Next.js from caching this route — data changes on every backfill/push
export const dynamic = 'force-dynamic';

/**
 * GET /api/transcripts — List all transcripts, newest first.
 */
export async function GET() {
    try {
        const supabase = getServerSupabase();

        const { data, error } = await supabase
            .from('transcripts')
            .select('*')
            .order('meeting_date', { ascending: false })
            .limit(100);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Map DB rows to the canonical MeetingTranscript shape
        const transcripts = (data ?? []).map((row) => ({
            transcript_id: row.id,
            meeting_title: row.meeting_title,
            meeting_date: row.meeting_date,
            participants: row.participants,
            raw_transcript: row.raw_transcript,
            source_email_id: row.source_email_id,
            extraction_method: row.extraction_method,
            word_count: row.word_count,
            processed_at: row.processed_at,
        }));

        return NextResponse.json(transcripts);
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
