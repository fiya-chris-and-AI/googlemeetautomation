import { NextResponse } from 'next/server';
import { getServerSupabase } from '../../../../lib/supabase';

// Prevent Next.js from caching this route
export const dynamic = 'force-dynamic';

/**
 * GET /api/transcripts/[id] — Fetch a single transcript by ID.
 */
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = getServerSupabase();

        const { data, error } = await supabase
            .from('transcripts')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !data) {
            return NextResponse.json({ error: 'Transcript not found' }, { status: 404 });
        }

        const transcript = {
            transcript_id: data.id,
            meeting_title: data.meeting_title,
            meeting_date: data.meeting_date,
            participants: data.participants,
            raw_transcript: data.raw_transcript,
            source_email_id: data.source_email_id,
            extraction_method: data.extraction_method,
            word_count: data.word_count,
            processed_at: data.processed_at,
        };

        return NextResponse.json(transcript);
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

/**
 * PATCH /api/transcripts/[id] — Update transcript metadata (title, date).
 * Cascades changes to transcript_chunks and logs the edit.
 */
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = (await request.json()) as {
            meeting_title?: string;
            meeting_date?: string;
        };

        // Build the update payload — only include fields that were provided
        const updates: Record<string, string> = {};
        if (body.meeting_title !== undefined) updates.meeting_title = body.meeting_title.trim();
        if (body.meeting_date !== undefined) updates.meeting_date = body.meeting_date;

        if (Object.keys(updates).length === 0) {
            return NextResponse.json(
                { error: 'No fields to update. Provide meeting_title or meeting_date.' },
                { status: 400 }
            );
        }

        const supabase = getServerSupabase();

        // Fetch existing row for the activity log summary
        const { data: existing, error: fetchErr } = await supabase
            .from('transcripts')
            .select('id, meeting_title, meeting_date')
            .eq('id', id)
            .single();

        if (fetchErr || !existing) {
            return NextResponse.json({ error: 'Transcript not found' }, { status: 404 });
        }

        // Update the transcript
        const { error: updateErr } = await supabase
            .from('transcripts')
            .update(updates)
            .eq('id', id);

        if (updateErr) {
            return NextResponse.json({ error: updateErr.message }, { status: 500 });
        }

        // Cascade to transcript_chunks (they duplicate meeting_title & meeting_date)
        const chunkUpdates: Record<string, string> = {};
        if (updates.meeting_title) chunkUpdates.meeting_title = updates.meeting_title;
        if (updates.meeting_date) chunkUpdates.meeting_date = updates.meeting_date;

        if (Object.keys(chunkUpdates).length > 0) {
            await supabase
                .from('transcript_chunks')
                .update(chunkUpdates)
                .eq('transcript_id', id);
        }

        // Build a human-readable summary of what changed
        const changes: string[] = [];
        if (updates.meeting_title && updates.meeting_title !== existing.meeting_title) {
            changes.push(`title → "${updates.meeting_title}"`);
        }
        if (updates.meeting_date && updates.meeting_date !== existing.meeting_date) {
            changes.push(`date → ${updates.meeting_date}`);
        }

        if (changes.length > 0) {
            await supabase.from('activity_log').insert({
                event_type: 'transcript.updated',
                entity_type: 'transcript',
                entity_id: id,
                summary: `Updated transcript: ${changes.join(', ')}`,
                actor: 'user',
            });
        }

        return NextResponse.json({ success: true, updated: updates });
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
/**
 * DELETE /api/transcripts/[id] — Delete a transcript and its related data.
 * Removes associated action_items, transcript_chunks, and logs the deletion.
 */
export async function DELETE(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = getServerSupabase();

        // Verify the transcript exists first (and grab title for the activity log)
        const { data: existing, error: fetchErr } = await supabase
            .from('transcripts')
            .select('id, meeting_title')
            .eq('id', id)
            .single();

        if (fetchErr || !existing) {
            return NextResponse.json({ error: 'Transcript not found' }, { status: 404 });
        }

        // Delete related action items
        await supabase.from('action_items').delete().eq('transcript_id', id);

        // Delete related embedding chunks
        await supabase.from('transcript_chunks').delete().eq('transcript_id', id);

        // Delete the transcript itself
        const { error: deleteErr } = await supabase
            .from('transcripts')
            .delete()
            .eq('id', id);

        if (deleteErr) {
            return NextResponse.json({ error: deleteErr.message }, { status: 500 });
        }

        // Log the deletion
        await supabase.from('activity_log').insert({
            event_type: 'transcript.deleted',
            entity_type: 'transcript',
            entity_id: id,
            summary: `Deleted transcript: ${existing.meeting_title}`,
            actor: 'user',
        });

        return NextResponse.json({ success: true });
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
