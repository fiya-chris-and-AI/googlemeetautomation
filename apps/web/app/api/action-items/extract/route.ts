import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '../../../../lib/supabase';
import { normalizeAssignee, callGemini, stripMarkdownFences, EXTRACTION_SYSTEM_PROMPT } from '@meet-pipeline/shared';

export const dynamic = 'force-dynamic';

/**
 * POST /api/action-items/extract — Use AI to extract action items from a transcript.
 *
 * Body: { transcript_id: string }
 *
 * Flow:
 * 1. Fetch the transcript from the database
 * 2. Send the transcript text to Claude with an extraction prompt
 * 3. Parse the structured JSON response
 * 4. Normalize assignees, then bulk-insert the action items and log each creation
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

        // 2. Call Gemini to extract action items
        const geminiKey = process.env.GEMINI_API_KEY;
        if (!geminiKey) {
            return NextResponse.json(
                { error: 'GEMINI_API_KEY is not configured' },
                { status: 503 }
            );
        }

        const participants = transcript.participants ?? [];
        const userMessage = `Meeting: ${transcript.meeting_title}\nParticipants: ${participants.join(', ')}\n\nTranscript:\n${transcript.raw_transcript}`;

        const rawText = await callGemini(
            EXTRACTION_SYSTEM_PROMPT,
            userMessage,
            geminiKey,
            { maxOutputTokens: 4096 },
        );

        // 3. Parse the response
        let extracted: Array<{
            title: string;
            description?: string | null;
            assigned_to?: string | null;
            priority?: string;
            due_date?: string | null;
            source_text?: string;
            group_label?: string | null;
            effort?: string;
        }>;

        try {
            const cleaned = stripMarkdownFences(rawText);
            extracted = JSON.parse(cleaned || '[]');
            if (!Array.isArray(extracted)) extracted = [];
        } catch {
            return NextResponse.json(
                { error: 'AI returned invalid JSON', raw: rawText },
                { status: 502 }
            );
        }

        if (extracted.length === 0) {
            return NextResponse.json({ items: [], count: 0 });
        }

        // 4. Normalize assignees and build insertion rows.
        //    If normalization yields two names (joint assignment), duplicate the item.
        const rows: Record<string, unknown>[] = [];

        for (const item of extracted) {
            const assignees = normalizeAssignee(item.assigned_to);
            const names = assignees.length > 0 ? assignees : [null];

            for (const name of names) {
                rows.push({
                    transcript_id,
                    title: item.title,
                    description: item.description ?? null,
                    assigned_to: name,
                    status: 'open',
                    priority: item.priority ?? 'medium',
                    due_date: item.due_date ?? null,
                    source_text: item.source_text ?? null,
                    created_by: 'ai',
                    group_label: item.group_label ?? null,
                    effort: item.effort ?? null,
                });
            }
        }

        const { data: inserted, error: insertError } = await supabase
            .from('action_items')
            .insert(rows)
            .select();

        if (insertError) {
            return NextResponse.json({ error: insertError.message }, { status: 500 });
        }

        // Log each creation
        const activityRows = (inserted ?? []).map((item) => ({
            event_type: 'action_item_created',
            entity_type: 'action_item',
            entity_id: item.id,
            actor: 'system',
            summary: `AI extracted action item: ${item.title}`,
            metadata: {
                transcript_id,
                priority: item.priority,
                assigned_to: item.assigned_to,
            },
        }));

        if (activityRows.length > 0) {
            await supabase.from('activity_log').insert(activityRows);
        }

        return NextResponse.json({ items: inserted ?? [], count: (inserted ?? []).length }, { status: 201 });
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error('Extract action items error:', msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
