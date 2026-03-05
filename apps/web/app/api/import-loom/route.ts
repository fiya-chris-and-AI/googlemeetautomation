import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '../../../lib/supabase';
import { processUpload, generateTranscriptId } from '../../../lib/upload-pipeline';
import { autoExtractActionItems } from '../../../lib/auto-extract';

export const dynamic = 'force-dynamic';

/**
 * POST /api/import-loom
 *
 * Imports a single Loom transcript with deduplication.
 * Checks if a transcript with the same canonical ID already exists
 * before inserting. Supports `?dryRun=true` to preview without writing.
 *
 * Body: { text, title, date?, videoId }
 */
export async function POST(request: NextRequest) {
    try {
        const dryRun = request.nextUrl.searchParams.get('dryRun') === 'true';

        const body = await request.json();
        const { text, title, date: dateStr, videoId } = body as {
            text?: string;
            title?: string;
            date?: string;
            videoId?: string;
        };

        if (!text?.trim()) {
            return NextResponse.json({ error: 'Transcript text is required' }, { status: 400 });
        }
        if (!title?.trim()) {
            return NextResponse.json({ error: 'Title is required' }, { status: 400 });
        }

        // Build a unique meeting title by appending a short video ID suffix
        // when multiple Loom videos share the same generic title (e.g., "Chris/Lutfiya").
        // This ensures processUpload generates a unique transcript_id internally.
        const meetingTitle = videoId
            ? `${title.trim()} (${videoId.substring(0, 8)})`
            : title.trim();

        const meetingDate = dateStr ? new Date(dateStr) : new Date();
        const transcriptId = generateTranscriptId(meetingTitle, meetingDate);

        // ── Dedup check ─────────────────────────────────────────
        const supabase = getServerSupabase();
        const { data: existing } = await supabase
            .from('transcripts')
            .select('id, meeting_title')
            .eq('id', transcriptId)
            .maybeSingle();

        if (existing) {
            return NextResponse.json({
                skipped: true,
                reason: 'duplicate',
                transcript_id: transcriptId,
                existing_title: existing.meeting_title,
            });
        }

        // ── Dry-run: report what would happen without writing ───
        if (dryRun) {
            const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
            return NextResponse.json({
                skipped: false,
                dryRun: true,
                transcript_id: transcriptId,
                title: meetingTitle,
                date: meetingDate.toISOString(),
                word_count: wordCount,
            });
        }

        // ── Real import ─────────────────────────────────────────
        const sourceEmailId = videoId ? `loom_${videoId}` : undefined;

        const transcript = await processUpload({
            text: text.trim(),
            title: meetingTitle,
            date: meetingDate,
            extractionMethod: 'loom_import',
            sourceEmailId,
        });

        // Fire-and-forget: auto-extract action items in the background
        autoExtractActionItems(transcript.transcript_id).catch(() => { });

        return NextResponse.json({ skipped: false, transcript }, { status: 201 });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[import-loom] Processing failed:', message);
        return NextResponse.json(
            { error: `Failed to import Loom transcript: ${message}` },
            { status: 500 }
        );
    }
}
