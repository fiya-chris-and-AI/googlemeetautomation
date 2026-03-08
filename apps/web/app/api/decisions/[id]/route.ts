import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '../../../../lib/supabase';

export const dynamic = 'force-dynamic';

/** GET /api/decisions/[id] — Fetch a single decision. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
    try {
        const supabase = getServerSupabase();
        const { data, error } = await supabase
            .from('decisions')
            .select('*, transcripts(meeting_title)')
            .eq('id', params.id)
            .single();

        if (error || !data) {
            return NextResponse.json({ error: 'Decision not found' }, { status: 404 });
        }

        return NextResponse.json({
            ...data,
            meeting_title: (data as any).transcripts?.meeting_title ?? null,
            transcripts: undefined,
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

/** PATCH /api/decisions/[id] — Update a decision. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
    try {
        const supabase = getServerSupabase();
        const body = await req.json();

        const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

        if (body.decision_text !== undefined) update.decision_text = body.decision_text;
        if (body.context !== undefined) update.context = body.context;
        if (body.domain !== undefined) update.domain = body.domain;
        if (body.confidence !== undefined) update.confidence = body.confidence;
        if (body.status !== undefined) update.status = body.status;
        if (body.superseded_by !== undefined) update.superseded_by = body.superseded_by;
        if (body.assigned_to !== undefined) update.assigned_to = body.assigned_to;

        // Handle lock/unlock fields
        if (body.is_locked !== undefined) {
            update.is_locked = body.is_locked;
            if (body.is_locked) {
                update.locked_by = body.locked_by ?? 'Lutfiya Miller';
                update.locked_at = new Date().toISOString();
            } else {
                update.locked_by = null;
                update.locked_at = null;
            }
        }

        // Re-embed if decision_text changed
        if (body.decision_text) {
            const OpenAI = (await import('openai')).default;
            const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
            const embeddingRes = await openai.embeddings.create({
                model: 'text-embedding-3-small',
                input: body.decision_text.trim(),
            });
            update.embedding = embeddingRes.data[0].embedding;
        }

        const { data, error } = await supabase
            .from('decisions')
            .update(update)
            .eq('id', params.id)
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Log the update
        await supabase.from('activity_log').insert({
            event_type: 'decision_updated',
            entity_type: 'decision',
            entity_id: params.id,
            actor: 'Lutfiya',
            summary: `Decision updated: ${data.decision_text.slice(0, 80)}...`,
            metadata: { fields_updated: Object.keys(update).filter(k => k !== 'updated_at') },
        });

        return NextResponse.json(data);
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
