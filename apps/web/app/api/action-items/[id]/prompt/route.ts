import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '../../../../../lib/supabase';
import { generateActionItemPrompt } from '@meet-pipeline/shared';
import type { ActionItemForPrompt, PromptContext } from '@meet-pipeline/shared';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/action-items/:id/prompt — Get the generated prompt for an action item.
 * Returns the prompt text and metadata, or 404 if not yet generated.
 */
export async function GET(_req: NextRequest, { params }: RouteContext) {
    const { id } = await params;
    const supabase = getServerSupabase();

    const { data, error } = await supabase
        .from('action_items')
        .select('id, title, generated_prompt, prompt_model, prompt_generated_at, prompt_version, prompt_feedback')
        .eq('id', id)
        .single();

    if (error || !data) {
        return NextResponse.json({ error: 'Action item not found' }, { status: 404 });
    }

    if (!data.generated_prompt) {
        return NextResponse.json({ error: 'No prompt generated yet', id: data.id }, { status: 404 });
    }

    return NextResponse.json({
        id: data.id,
        title: data.title,
        prompt: data.generated_prompt,
        model: data.prompt_model,
        generated_at: data.prompt_generated_at,
        version: data.prompt_version,
        feedback: data.prompt_feedback,
    });
}

/**
 * POST /api/action-items/:id/prompt — Generate or regenerate the prompt.
 *
 * Gathers full context (transcript, decisions, siblings) and calls Gemini
 * to produce a high-quality implementation prompt.
 *
 * Body (optional): { force?: boolean } — regenerate even if a prompt exists.
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const force = body.force === true;

    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
        return NextResponse.json({ error: 'GEMINI_API_KEY is not configured' }, { status: 503 });
    }

    const supabase = getServerSupabase();

    // 1. Fetch the action item
    const { data: item, error: itemError } = await supabase
        .from('action_items')
        .select('*')
        .eq('id', id)
        .single();

    if (itemError || !item) {
        return NextResponse.json({ error: 'Action item not found' }, { status: 404 });
    }

    // Skip if already generated and not forcing
    if (item.generated_prompt && !force) {
        return NextResponse.json({
            id: item.id,
            prompt: item.generated_prompt,
            model: item.prompt_model,
            generated_at: item.prompt_generated_at,
            version: item.prompt_version,
            feedback: item.prompt_feedback,
            skipped: true,
        });
    }

    // 2. Gather context — transcript, decisions, sibling items
    let meetingTitle: string | null = null;
    let meetingDate: string | null = null;
    let participants: string[] = [];
    let rawTranscript: string | null = null;

    if (item.transcript_id) {
        const { data: transcript } = await supabase
            .from('transcripts')
            .select('meeting_title, meeting_date, participants, raw_transcript')
            .eq('id', item.transcript_id)
            .single();

        if (transcript) {
            meetingTitle = transcript.meeting_title;
            meetingDate = transcript.meeting_date;
            participants = transcript.participants ?? [];
            rawTranscript = transcript.raw_transcript;
        }
    }

    // Related decisions from same meeting
    const relatedDecisions: string[] = [];
    if (item.transcript_id) {
        const { data: decisions } = await supabase
            .from('decisions')
            .select('decision_text')
            .eq('transcript_id', item.transcript_id)
            .limit(10);

        if (decisions) {
            relatedDecisions.push(...decisions.map((d: { decision_text: string }) => d.decision_text));
        }
    }

    // Sibling action items from same meeting
    const siblingItems: string[] = [];
    if (item.transcript_id) {
        const { data: siblings } = await supabase
            .from('action_items')
            .select('title')
            .eq('transcript_id', item.transcript_id)
            .neq('id', id)
            .limit(20);

        if (siblings) {
            siblingItems.push(...siblings.map((s: { title: string }) => s.title));
        }
    }

    // Build surrounding transcript context
    let surroundingTranscript: string | null = null;
    if (item.source_text && rawTranscript) {
        const searchStr = item.source_text.slice(0, 50);
        const idx = rawTranscript.indexOf(searchStr);
        if (idx >= 0) {
            const start = Math.max(0, idx - 500);
            const end = Math.min(rawTranscript.length, idx + item.source_text.length + 500);
            surroundingTranscript = rawTranscript.slice(start, end);
        }
    }

    // Feedback history — collect from this item's previous versions
    const feedbackHistory: { version: number; feedback: string }[] = [];
    if (item.prompt_feedback && item.prompt_version) {
        feedbackHistory.push({ version: item.prompt_version, feedback: item.prompt_feedback });
    }

    // 3. Generate the prompt
    const actionItemForPrompt: ActionItemForPrompt = {
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
    };

    const context: PromptContext = {
        meeting_title: meetingTitle,
        meeting_date: meetingDate,
        participants,
        surrounding_transcript: surroundingTranscript,
        related_decisions: relatedDecisions,
        sibling_action_items: siblingItems,
        feedback_history: feedbackHistory,
    };

    const generated = await generateActionItemPrompt(
        actionItemForPrompt,
        context,
        geminiKey,
        item.prompt_version ?? 0,
    );

    // 4. Store the generated prompt
    const now = new Date().toISOString();
    const { error: updateError } = await supabase
        .from('action_items')
        .update({
            generated_prompt: generated.prompt,
            prompt_model: generated.model,
            prompt_generated_at: now,
            prompt_version: generated.version,
            prompt_feedback: null, // Reset feedback on regeneration
            updated_at: now,
        })
        .eq('id', id);

    if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // 5. Log the generation
    await supabase.from('activity_log').insert({
        event_type: 'prompt_generated',
        entity_type: 'action_item',
        entity_id: id,
        actor: 'system',
        summary: `Prompt generated (v${generated.version}) for: ${item.title}`,
        metadata: { model: generated.model, version: generated.version, force },
    });

    return NextResponse.json({
        id: item.id,
        prompt: generated.prompt,
        model: generated.model,
        generated_at: now,
        version: generated.version,
        feedback: null,
    }, { status: 201 });
}

/**
 * PATCH /api/action-items/:id/prompt — Submit feedback on a generated prompt.
 *
 * Body: { feedback: 'useful' | 'not_useful' }
 *
 * This feedback is used for self-improvement: when the prompt is regenerated,
 * previous feedback is passed to the AI so it can adjust specificity.
 */
export async function PATCH(req: NextRequest, { params }: RouteContext) {
    const { id } = await params;
    const { feedback } = await req.json();

    if (!feedback || !['useful', 'not_useful'].includes(feedback)) {
        return NextResponse.json({ error: 'feedback must be "useful" or "not_useful"' }, { status: 400 });
    }

    const supabase = getServerSupabase();
    const now = new Date().toISOString();

    const { data, error } = await supabase
        .from('action_items')
        .update({ prompt_feedback: feedback, updated_at: now })
        .eq('id', id)
        .select('id, prompt_feedback, prompt_version')
        .single();

    if (error || !data) {
        return NextResponse.json({ error: 'Action item not found' }, { status: 404 });
    }

    await supabase.from('activity_log').insert({
        event_type: 'prompt_feedback',
        entity_type: 'action_item',
        entity_id: id,
        actor: 'Lutfiya',
        summary: `Prompt feedback: ${feedback} (v${data.prompt_version})`,
        metadata: { feedback, version: data.prompt_version },
    });

    return NextResponse.json(data);
}
