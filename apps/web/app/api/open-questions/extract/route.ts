import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '../../../../lib/supabase';
import {
    extractOpenQuestionsFromTranscript,
    buildOpenQuestionInsertionRows,
} from '@meet-pipeline/shared';
import type { TranscriptForOpenQuestionExtraction } from '@meet-pipeline/shared';

export const dynamic = 'force-dynamic';

/**
 * POST /api/open-questions/extract — Use AI to extract open questions from a transcript.
 *
 * Body: { transcript_id: string }
 *
 * Flow:
 * 1. Fetch the transcript from the database
 * 2. Guard against re-extraction
 * 3. Call Gemini to extract open questions
 * 4. Bulk-insert and log each creation
 */
export async function POST(req: NextRequest) {
    try {
        const { transcript_id } = (await req.json()) as { transcript_id?: string };

        if (!transcript_id?.trim()) {
            return NextResponse.json({ error: 'transcript_id is required' }, { status: 400 });
        }

        const supabase = getServerSupabase();

        // 1. Fetch the transcript
        const { data: transcript, error: txError } = await supabase
            .from('transcripts')
            .select('id, meeting_title, raw_transcript, participants')
            .eq('id', transcript_id)
            .single();

        if (txError || !transcript) {
            return NextResponse.json({ error: 'Transcript not found' }, { status: 404 });
        }

        // Guard: skip if this transcript already has open questions
        const { count: existingCount } = await supabase
            .from('open_questions')
            .select('id', { count: 'exact', head: true })
            .eq('transcript_id', transcript_id);

        if ((existingCount ?? 0) > 0) {
            const { data: existing } = await supabase
                .from('open_questions')
                .select('*')
                .eq('transcript_id', transcript_id);

            return NextResponse.json({
                questions: existing ?? [],
                count: existingCount ?? 0,
                skipped: true,
                message: `Transcript already has ${existingCount} open questions — skipping re-extraction`,
            });
        }

        // 2. Call Gemini to extract open questions
        const geminiKey = process.env.GEMINI_API_KEY;
        if (!geminiKey) {
            return NextResponse.json(
                { error: 'GEMINI_API_KEY is not configured' },
                { status: 503 },
            );
        }

        const extracted = await extractOpenQuestionsFromTranscript(
            transcript as TranscriptForOpenQuestionExtraction,
            geminiKey,
        );

        if (extracted.length === 0) {
            return NextResponse.json({ questions: [], count: 0 });
        }

        // 3. Build rows and insert
        const rows = buildOpenQuestionInsertionRows(extracted, transcript_id);

        const { data: inserted, error: insertError } = await supabase
            .from('open_questions')
            .insert(rows)
            .select();

        if (insertError) {
            return NextResponse.json({ error: insertError.message }, { status: 500 });
        }

        // 4. Log each creation
        const activityRows = (inserted ?? []).map((item: any) => ({
            event_type: 'open_question_extracted',
            entity_type: 'open_question',
            entity_id: item.id,
            actor: 'system',
            summary: `AI extracted open question: ${item.question_text.slice(0, 80)}...`,
            metadata: {
                transcript_id,
                topic: item.topic,
            },
        }));

        if (activityRows.length > 0) {
            await supabase.from('activity_log').insert(activityRows);
        }

        return NextResponse.json(
            { questions: inserted ?? [], count: (inserted ?? []).length },
            { status: 201 },
        );
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error('Extract open questions error:', msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
