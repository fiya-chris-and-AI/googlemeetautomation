import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '../../../../lib/supabase';
import { normalizeAssignee } from '@meet-pipeline/shared';

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

        // 2. Call Claude to extract action items
        const anthropicKey = process.env.ANTHROPIC_API_KEY;
        if (!anthropicKey) {
            return NextResponse.json(
                { error: 'ANTHROPIC_API_KEY is not configured' },
                { status: 503 }
            );
        }

        const systemPrompt = `You extract action items from meeting transcripts.
Return a JSON array of objects with these fields:
- title (string, required): A concise description of the action item
- description (string | null): Additional context if needed
- assigned_to (string | null): The person responsible. MUST be exactly one of: "Lutfiya Miller", "Chris Müller", or null. Never use alternate spellings like "Chris-Steven Müller", "Chris Muller", or "Chris Mueller". If the task is assigned to BOTH people, emit two separate action items — one for each person. Never use composite values like "Both" or "Lutfiya Miller and Chris Müller".
- priority ("low" | "medium" | "high" | "urgent"): Infer from context and urgency cues
- due_date (string | null): ISO date if a deadline is mentioned, otherwise null
- source_text (string): The exact excerpt from the transcript that implies this action item
- group_label (string | null): A short label (1-3 words, title-cased) for the project, tool, or topic this item relates to. Use null if it doesn't clearly belong to a group. If multiple items relate to the same topic, give them the same label.
- effort ("quick_fix" | "moderate" | "significant"): Estimate the effort required to complete this task:
  • "quick_fix" — Can likely be done in under 30 minutes (e.g. sending an email, a quick decision, looking something up)
  • "moderate" — Likely takes 30 minutes to a few hours (e.g. writing a short document, setting up a tool, a focused work session)
  • "significant" — Likely takes multiple hours or spans multiple days (e.g. building a feature, conducting research, coordinating across people)
  Base this on the nature of the task described in the transcript, not on its urgency or priority.

Only return action items that are clearly implied by the transcript — do not fabricate tasks.
If there are no action items, return an empty array.
Return ONLY valid JSON, no markdown fences or extra text.`;

        const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': anthropicKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 4096,
                system: systemPrompt,
                messages: [
                    {
                        role: 'user',
                        content: `Meeting: ${transcript.meeting_title}\nParticipants: ${transcript.participants.join(', ')}\n\nTranscript:\n${transcript.raw_transcript}`,
                    },
                ],
            }),
        });

        const anthropicData = await anthropicRes.json();
        const rawText: string = anthropicData.content?.[0]?.text ?? '[]';

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
            extracted = JSON.parse(rawText);
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
