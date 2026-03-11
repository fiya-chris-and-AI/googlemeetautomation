import { NextResponse } from 'next/server';
import { getServerSupabase } from '../../../lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const supabase = getServerSupabase();

        const [transcriptRes, actionItemRes, decisionRes, openQuestionRes] = await Promise.all([
            supabase
                .from('transcripts')
                .select('*')
                .order('meeting_date', { ascending: false })
                .limit(100),
            supabase
                .from('action_items')
                .select('transcript_id, title')
                .eq('created_by', 'ai')
                .not('transcript_id', 'is', null),
            supabase
                .from('decisions')
                .select('transcript_id, topic, decision_text')
                .eq('created_by', 'ai')
                .not('transcript_id', 'is', null),
            supabase
                .from('open_questions')
                .select('transcript_id, question_text, topic')
                .not('transcript_id', 'is', null),
        ]);

        if (transcriptRes.error) {
            return NextResponse.json({ error: transcriptRes.error.message }, { status: 500 });
        }

        // Build lookup: transcript_id → { count, titles (top 3) }
        const actionMap = new Map<string, { count: number; titles: string[] }>();
        if (!actionItemRes.error && Array.isArray(actionItemRes.data)) {
            for (const row of actionItemRes.data) {
                const tid = row.transcript_id as string;
                const entry = actionMap.get(tid) ?? { count: 0, titles: [] };
                entry.count++;
                if (entry.titles.length < 3) {
                    entry.titles.push(row.title as string);
                }
                actionMap.set(tid, entry);
            }
        }

        const decisionMap = new Map<string, { count: number; titles: string[] }>();
        if (!decisionRes.error && Array.isArray(decisionRes.data)) {
            for (const row of decisionRes.data) {
                const tid = row.transcript_id as string;
                const entry = decisionMap.get(tid) ?? { count: 0, titles: [] };
                entry.count++;
                if (entry.titles.length < 3) {
                    // Prefer short topic pill label; fall back to decision_text
                    const label = (row.topic as string | null) ?? (row.decision_text as string);
                    entry.titles.push(label);
                }
                decisionMap.set(tid, entry);
            }
        }

        const openQuestionMap = new Map<string, { count: number; titles: string[] }>();
        if (!openQuestionRes.error && Array.isArray(openQuestionRes.data)) {
            for (const row of openQuestionRes.data) {
                const tid = row.transcript_id as string;
                const entry = openQuestionMap.get(tid) ?? { count: 0, titles: [] };
                entry.count++;
                if (entry.titles.length < 3) {
                    const label = (row.topic as string | null) ?? (row.question_text as string);
                    entry.titles.push(label);
                }
                openQuestionMap.set(tid, entry);
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
            action_item_count: actionMap.get(row.id)?.count ?? 0,
            action_item_titles: actionMap.get(row.id)?.titles ?? [],
            decision_count: decisionMap.get(row.id)?.count ?? 0,
            decision_titles: decisionMap.get(row.id)?.titles ?? [],
            open_question_count: openQuestionMap.get(row.id)?.count ?? 0,
            open_question_titles: openQuestionMap.get(row.id)?.titles ?? [],
        }));

        return NextResponse.json(transcripts);
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
