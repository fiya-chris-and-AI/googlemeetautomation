import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '../../../../../lib/supabase';
import { callGemini } from '@meet-pipeline/shared';
import { autoExtractActionItems } from '../../../../../lib/auto-extract';
import { autoExtractDecisions } from '../../../../../lib/auto-extract-decisions';

export const dynamic = 'force-dynamic';

/**
 * GET /api/transcripts/[id]/summarize
 *
 * Generate a structured meeting brief directly from the full transcript.
 * Caches the result in the `meeting_summary` column on the transcripts table.
 *
 * Query params:
 *   force — if 'true', bypass cache and regenerate the summary.
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await params;
        const force = req.nextUrl.searchParams.get('force') === 'true';
        const geminiKey = process.env.GEMINI_API_KEY;
        if (!geminiKey) {
            return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 503 });
        }

        const supabase = getServerSupabase();
        const { data: transcript, error } = await supabase
            .from('transcripts')
            .select('meeting_title, meeting_date, raw_transcript, word_count, meeting_summary')
            .eq('id', id)
            .single();

        if (error || !transcript) {
            return NextResponse.json({ error: 'Transcript not found' }, { status: 404 });
        }

        // ── Cache hit — return immediately ──
        if (transcript.meeting_summary && !force) {
            return NextResponse.json({ summary: transcript.meeting_summary, cached: true });
        }

        // ── Cache miss or force regeneration — call Gemini ──
        const raw = transcript.raw_transcript;
        let content: string;
        if (raw.length > 12000) {
            const head = raw.slice(0, 8000);
            const tail = raw.slice(-2000);
            content = `${head}\n\n[... middle of transcript omitted for brevity ...]\n\n${tail}`;
        } else {
            content = raw;
        }

        const systemPrompt = `You are an executive assistant summarizing meetings for two co-founders: Dr. Lutfiya Miller (scientist/toxicologist) and Chris Müller (software developer). They are building ScienceExperts.ai together.

Analyze the meeting transcript and produce a structured brief in markdown format:

## Overview
2-3 sentences: What was this meeting about? What was the overall purpose?

## Key Topics
For each major topic discussed, provide:
- **Topic Name** — 1-2 sentence summary of what was discussed and any conclusions

## Decisions Made
Bullet list of any concrete decisions reached during the meeting. If none, write "No explicit decisions captured."

## Action Items Identified
Bullet list of tasks or follow-ups mentioned. For each, note who it's for (Lutfiya, Chris, or both) if clear from context. If none, write "No action items identified."

## Open Questions
Any unresolved questions or topics that need follow-up. If none, omit this section.

Guidelines:
- Be specific and concrete — reference actual tools, features, or topics by name
- Keep it concise — the entire summary should be readable in under 60 seconds
- Use plain, professional language
- If the transcript is informal or contains filler words, extract the substance and ignore the noise
- The Loom transcripts may say "Speaker:" without identifying who — just summarize the content without attributing to a specific person unless it's clear from context`;

        const userMessage = `Meeting: ${transcript.meeting_title}\nDate: ${new Date(transcript.meeting_date).toLocaleDateString()}\nWord count: ${transcript.word_count}\n\nTranscript:\n${content}`;

        let summary: string;
        try {
            summary = await callGemini(systemPrompt, userMessage, geminiKey, {
                maxOutputTokens: 2048,
            });
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Summary generation failed';
            console.error(`[summarize] Gemini error:`, msg);
            const isRateLimit = msg.includes('429');
            return NextResponse.json(
                { error: isRateLimit ? 'Rate limit exceeded — please try again in a minute' : 'Summary generation failed' },
                { status: isRateLimit ? 429 : 502 },
            );
        }

        if (!summary) {
            summary = 'Unable to generate summary.';
        }

        // ── Persist to database ──
        await supabase
            .from('transcripts')
            .update({ meeting_summary: summary })
            .eq('id', id);

        // Fire-and-forget: auto-extract decisions and action items if not already done.
        try {
            const { count: decisionCount } = await supabase
                .from('decisions')
                .select('id', { count: 'exact', head: true })
                .eq('transcript_id', id);

            const { count: actionItemCount } = await supabase
                .from('action_items')
                .select('id', { count: 'exact', head: true })
                .eq('transcript_id', id);

            const { count: decisionAttemptCount } = await supabase
                .from('activity_log')
                .select('id', { count: 'exact', head: true })
                .eq('event_type', 'decision_extraction_attempted')
                .eq('entity_id', id);

            const { count: actionAttemptCount } = await supabase
                .from('activity_log')
                .select('id', { count: 'exact', head: true })
                .eq('event_type', 'bulk_extraction_attempted')
                .eq('entity_id', id);

            const needsActionItems = (actionItemCount ?? 0) === 0 && (actionAttemptCount ?? 0) === 0;
            const needsDecisions = (decisionCount ?? 0) === 0 && (decisionAttemptCount ?? 0) === 0;

            if (needsActionItems) {
                autoExtractActionItems(id).catch(() => { });
            }
            if (needsDecisions) {
                autoExtractDecisions(id).catch(() => { });
            }
        } catch {
            // Never let extraction checks delay the summary response
        }

        return NextResponse.json({ summary, cached: false });
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
