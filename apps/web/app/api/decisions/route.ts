import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '../../../lib/supabase';
import type { Decision } from '@meet-pipeline/shared';

export const dynamic = 'force-dynamic';

/**
 * GET /api/decisions — List decisions with filtering and sorting.
 *
 * Query params:
 *   domain      — exact match (e.g. "architecture")
 *   status      — exact match or comma-separated (default: "active")
 *   confidence  — exact match
 *   sort        — decided_at | created_at (default: decided_at)
 *   order       — asc | desc (default: desc)
 *   limit       — max rows (default: 100, max: 500)
 *   search      — text search in decision_text
 */
export async function GET(req: NextRequest) {
    try {
        const supabase = getServerSupabase();
        const { searchParams } = req.nextUrl;

        const sortCol = ['decided_at', 'created_at'].includes(searchParams.get('sort') ?? '')
            ? searchParams.get('sort')!
            : 'decided_at';
        const ascending = searchParams.get('order') === 'asc';
        const limit = Math.min(parseInt(searchParams.get('limit') ?? '100', 10) || 100, 500);

        let query = supabase
            .from('decisions')
            .select('*, transcripts(meeting_title)')
            .order(sortCol, { ascending })
            .limit(limit);

        const status = searchParams.get('status') ?? 'active';
        if (status !== 'all') {
            const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
            query = statuses.length === 1
                ? query.eq('status', statuses[0])
                : query.in('status', statuses);
        }

        const domain = searchParams.get('domain');
        if (domain) query = query.eq('domain', domain);

        const confidence = searchParams.get('confidence');
        if (confidence) query = query.eq('confidence', confidence);

        const search = searchParams.get('search');
        if (search) query = query.or(`decision_text.ilike.%${search}%,topic.ilike.%${search}%`);

        const { data, error } = await query;

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Flatten the joined meeting_title onto each decision
        const decisions = (data ?? []).map((d: any) => ({
            ...d,
            meeting_title: d.transcripts?.meeting_title ?? null,
            transcripts: undefined,
        }));

        return NextResponse.json(decisions);
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

/**
 * POST /api/decisions — Create a decision manually.
 */
export async function POST(req: NextRequest) {
    try {
        const supabase = getServerSupabase();
        const body = (await req.json()) as Partial<Decision>;

        if (!body.decision_text?.trim()) {
            return NextResponse.json({ error: 'decision_text is required' }, { status: 400 });
        }

        // Generate embedding for the decision text
        const OpenAI = (await import('openai')).default;
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
        const embeddingRes = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: body.decision_text.trim(),
        });
        const embedding = embeddingRes.data[0].embedding;

        const row = {
            topic: body.topic ?? null,
            decision_text: body.decision_text.trim(),
            context: body.context ?? null,
            domain: body.domain ?? 'general',
            confidence: body.confidence ?? 'high',
            participants: body.participants ?? [],
            decided_at: body.decided_at ?? new Date().toISOString(),
            source_text: body.source_text ?? null,
            transcript_id: body.transcript_id ?? null,
            embedding,
            status: 'active',
            created_by: 'manual',
        };

        const { data, error } = await supabase.from('decisions').insert(row).select().single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Log creation
        await supabase.from('activity_log').insert({
            event_type: 'decision_created',
            entity_type: 'decision',
            entity_id: data.id,
            actor: 'Lutfiya',
            summary: `Decision recorded: ${data.decision_text.slice(0, 80)}...`,
            metadata: { domain: data.domain, confidence: data.confidence, created_by: 'manual' },
        });

        return NextResponse.json(data, { status: 201 });
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
