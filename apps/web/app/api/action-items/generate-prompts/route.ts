import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '../../../../lib/supabase';
import { generatePromptsForBatch } from '@meet-pipeline/shared';

export const dynamic = 'force-dynamic';

/**
 * POST /api/action-items/generate-prompts — Batch-generate prompts for action items.
 *
 * Body: { transcript_id: string } — generates prompts for all action items from this transcript
 *   OR: { action_item_ids: string[] } — generates prompts for specific items
 *
 * Typically called as fire-and-forget after extraction completes.
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const transcriptId: string | undefined = body.transcript_id;
        const actionItemIds: string[] | undefined = body.action_item_ids;

        const geminiKey = process.env.GEMINI_API_KEY;
        if (!geminiKey) {
            return NextResponse.json({ error: 'GEMINI_API_KEY is not configured' }, { status: 503 });
        }

        const supabase = getServerSupabase();

        // 1. Fetch the action items that need prompts
        let query = supabase
            .from('action_items')
            .select('*')
            .is('generated_prompt', null); // Only items without prompts

        if (transcriptId) {
            query = query.eq('transcript_id', transcriptId);
        } else if (actionItemIds?.length) {
            query = query.in('id', actionItemIds);
        } else {
            return NextResponse.json({ error: 'transcript_id or action_item_ids required' }, { status: 400 });
        }

        const { data: items, error: itemsError } = await query;
        if (itemsError || !items?.length) {
            return NextResponse.json({ items_processed: 0, message: 'No items need prompts' });
        }

        // 2. Get transcript context
        const txId = transcriptId ?? items[0].transcript_id;
        let transcriptContext = {
            meeting_title: 'Unknown Meeting',
            meeting_date: null as string | null,
            participants: [] as string[],
            raw_transcript: '',
        };

        if (txId) {
            const { data: transcript } = await supabase
                .from('transcripts')
                .select('meeting_title, meeting_date, participants, raw_transcript')
                .eq('id', txId)
                .single();

            if (transcript) {
                transcriptContext = {
                    meeting_title: transcript.meeting_title,
                    meeting_date: transcript.meeting_date,
                    participants: transcript.participants ?? [],
                    raw_transcript: transcript.raw_transcript ?? '',
                };
            }
        }

        // 3. Get related decisions
        const relatedDecisions: string[] = [];
        if (txId) {
            const { data: decisions } = await supabase
                .from('decisions')
                .select('decision_text')
                .eq('transcript_id', txId)
                .limit(10);
            if (decisions) {
                relatedDecisions.push(...decisions.map((d: { decision_text: string }) => d.decision_text));
            }
        }

        // 4. Generate prompts in batch
        const promptItems = items.map(item => ({
            id: item.id,
            title: item.title,
            description: item.description,
            assigned_to: item.assigned_to,
            priority: item.priority,
            effort: item.effort,
            due_date: item.due_date,
            source_text: item.source_text,
            group_label: item.group_label,
            created_by: item.created_by,
        }));

        const results = await generatePromptsForBatch(
            promptItems,
            transcriptContext,
            relatedDecisions,
            geminiKey,
        );

        // 5. Store all generated prompts
        const now = new Date().toISOString();
        let successCount = 0;

        for (const [itemId, generated] of results) {
            const { error: updateError } = await supabase
                .from('action_items')
                .update({
                    generated_prompt: generated.prompt,
                    prompt_model: generated.model,
                    prompt_generated_at: now,
                    prompt_version: generated.version,
                    updated_at: now,
                })
                .eq('id', itemId);

            if (!updateError) successCount++;
        }

        // 6. Log the batch generation
        await supabase.from('activity_log').insert({
            event_type: 'prompts_batch_generated',
            entity_type: 'action_item',
            entity_id: txId,
            actor: 'system',
            summary: `Batch prompt generation: ${successCount}/${items.length} prompts created`,
            metadata: { transcript_id: txId, total: items.length, success: successCount },
        });

        return NextResponse.json({
            items_processed: items.length,
            prompts_generated: successCount,
            transcript_id: txId,
        }, { status: 201 });
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error('Batch prompt generation error:', msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
