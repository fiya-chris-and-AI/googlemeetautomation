import { NextResponse } from 'next/server';
import { getServerSupabase } from '../../../lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const supabase = getServerSupabase();

        const [transcriptRes, actionItemRes] = await Promise.all([
            supabase
                .from('transcripts')
                .select('*')
                .order('meeting_date', { ascending: false })
                .limit(100),
            supabase
                .from('action_items')
                .select('transcript_id')
                .eq('created_by', 'ai')
                .not('transcript_id', 'is', null),
        ]);

        if (transcriptRes.error) {
            return NextResponse.json({ error: transcriptRes.error.message }, { status: 500 });
        }

        // Build lookup: transcript_id → AI-extracted item count
        const countMap = new Map<string, number>();
        if (!actionItemRes.error && Array.isArray(actionItemRes.data)) {
            for (const row of actionItemRes.data) {
                const tid = row.transcript_id as string;
                countMap.set(tid, (countMap.get(tid) ?? 0) + 1);
            }
        }

        const transcripts = (transcriptRes.data ?? []).map((row) => ({
            transcript_id: row.id,
            meeting_title: row.meeting_title,
            meeting_date: row.meeting_date,
            participants: row.participants,
            raw_transcript: row.raw_transcript,
            source_email_id: row.source_email_id,
            extraction_method: row.extraction_method,
            word_count: row.word_count,
            processed_at: row.processed_at,
            ai_extracted_count: countMap.get(row.id) ?? 0,
        }));

        return NextResponse.json(transcripts);
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
