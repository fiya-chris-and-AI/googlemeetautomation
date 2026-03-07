import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getServerSupabase } from '../../../../lib/supabase';
import {
    extractDecisionsFromTranscript,
    buildDecisionInsertionRows,
} from '@meet-pipeline/shared';
import type { TranscriptForDecisionExtraction } from '@meet-pipeline/shared';

export const dynamic = 'force-dynamic';

/**
 * POST /api/decisions/extract — Use AI to extract decisions from a single transcript.
 *
 * Body: { transcript_id: string }
 *
 * Flow:
 * 1. Fetch the transcript from the database
 * 2. Send the transcript text to Claude with the decision extraction prompt
 * 3. Parse the structured JSON response
 * 4. Generate embeddings for each decision_text
 * 5. Bulk-insert the decisions and log each creation
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
            .select('id, meeting_title, meeting_date, raw_transcript, participants')
            .eq('id', transcript_id)
            .single();

        if (txError || !transcript) {
            return NextResponse.json({ error: 'Transcript not found' }, { status: 404 });
        }

        // 2. Call Gemini to extract decisions
        const geminiKey = process.env.GEMINI_API_KEY;
        if (!geminiKey) {
            return NextResponse.json(
                { error: 'GEMINI_API_KEY is not configured' },
                { status: 503 },
            );
        }

        const extracted = await extractDecisionsFromTranscript(
            transcript as TranscriptForDecisionExtraction,
            geminiKey,
        );

        if (extracted.length === 0) {
            return NextResponse.json({ decisions: [], count: 0 });
        }

        // 3. Build insertion rows
        const rows = buildDecisionInsertionRows(extracted, {
            id: transcript.id,
            meeting_date: transcript.meeting_date,
            participants: transcript.participants,
        });

        // 4. Generate embeddings for each decision_text
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
        const texts = rows.map(r => r.decision_text as string);
        const embeddingRes = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: texts,
        });
        for (let i = 0; i < rows.length; i++) {
            rows[i].embedding = embeddingRes.data[i].embedding;
        }

        // 5. Bulk-insert
        const { data: inserted, error: insertError } = await supabase
            .from('decisions')
            .insert(rows)
            .select();

        if (insertError) {
            return NextResponse.json({ error: insertError.message }, { status: 500 });
        }

        // Log each creation
        const activityRows = (inserted ?? []).map((item: any) => ({
            event_type: 'decision_extracted',
            entity_type: 'decision',
            entity_id: item.id,
            actor: 'system',
            summary: `AI extracted decision: ${item.decision_text.slice(0, 80)}...`,
            metadata: {
                transcript_id,
                domain: item.domain,
                confidence: item.confidence,
            },
        }));

        if (activityRows.length > 0) {
            await supabase.from('activity_log').insert(activityRows);
        }

        return NextResponse.json(
            { decisions: inserted ?? [], count: (inserted ?? []).length },
            { status: 201 },
        );
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error('Extract decisions error:', msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
