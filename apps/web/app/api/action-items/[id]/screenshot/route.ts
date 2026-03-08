import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '../../../../../lib/supabase';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const BUCKET_NAME = 'action-item-screenshots';

/**
 * POST /api/action-items/:id/screenshot — Upload or replace a screenshot.
 *
 * Expects multipart/form-data with a single `file` field.
 * Validates type (PNG/JPG/WebP) and size (≤5 MB).
 * Uploads to Supabase Storage and updates the action_items row.
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
    try {
        const { id } = await params;
        const supabase = getServerSupabase();

        // Verify item exists
        const { data: item, error: itemError } = await supabase
            .from('action_items')
            .select('id, title, screenshot_path')
            .eq('id', id)
            .single();

        if (itemError || !item) {
            return NextResponse.json({ error: 'Action item not found' }, { status: 404 });
        }

        const formData = await req.formData();
        const file = formData.get('file') as File | null;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        // Validate MIME type
        if (!ALLOWED_TYPES.includes(file.type)) {
            return NextResponse.json(
                { error: `File type not allowed. Use: ${ALLOWED_TYPES.join(', ')}` },
                { status: 400 },
            );
        }

        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json(
                { error: `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024} MB` },
                { status: 400 },
            );
        }

        // Delete existing screenshot if present
        if (item.screenshot_path) {
            await supabase.storage.from(BUCKET_NAME).remove([item.screenshot_path]);
        }

        // Build storage path: action-items/<id>/<timestamp>.<ext>
        const ext = file.name.split('.').pop() ?? 'png';
        const storagePath = `${id}/${Date.now()}.${ext}`;

        // Upload to Supabase Storage
        const buffer = Buffer.from(await file.arrayBuffer());
        const { error: uploadError } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(storagePath, buffer, {
                contentType: file.type,
                upsert: true,
            });

        if (uploadError) {
            return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 });
        }

        // Get public/signed URL
        const { data: urlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(storagePath);
        const screenshotUrl = urlData?.publicUrl ?? null;

        // Generate alt text placeholder (can be enhanced with Gemini vision later)
        const altText = `Screenshot attached to action item: ${item.title}`;

        // Update action_items row
        const { data: updated, error: updateError } = await supabase
            .from('action_items')
            .update({
                screenshot_path: storagePath,
                screenshot_url: screenshotUrl,
                screenshot_alt: altText,
                screenshot_size: file.size,
            })
            .eq('id', id)
            .select()
            .single();

        if (updateError) {
            return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        // Log the upload
        await supabase.from('activity_log').insert({
            event_type: 'screenshot_uploaded',
            entity_type: 'action_item',
            entity_id: id,
            actor: 'Lutfiya',
            summary: `Screenshot uploaded for: ${item.title}`,
            metadata: { file_size: file.size, file_type: file.type },
        });

        return NextResponse.json({
            screenshot_url: screenshotUrl,
            screenshot_path: storagePath,
            screenshot_alt: altText,
            screenshot_size: file.size,
        }, { status: 201 });
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

/**
 * DELETE /api/action-items/:id/screenshot — Remove screenshot.
 *
 * Removes from Storage and clears DB columns.
 */
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
    try {
        const { id } = await params;
        const supabase = getServerSupabase();

        const { data: item, error: itemError } = await supabase
            .from('action_items')
            .select('id, title, screenshot_path')
            .eq('id', id)
            .single();

        if (itemError || !item) {
            return NextResponse.json({ error: 'Action item not found' }, { status: 404 });
        }

        if (!item.screenshot_path) {
            return NextResponse.json({ error: 'No screenshot to delete' }, { status: 404 });
        }

        // Delete from Storage
        await supabase.storage.from(BUCKET_NAME).remove([item.screenshot_path]);

        // Clear DB columns
        await supabase
            .from('action_items')
            .update({
                screenshot_path: null,
                screenshot_url: null,
                screenshot_alt: null,
                screenshot_size: null,
            })
            .eq('id', id);

        // Log the removal
        await supabase.from('activity_log').insert({
            event_type: 'screenshot_removed',
            entity_type: 'action_item',
            entity_id: id,
            actor: 'Lutfiya',
            summary: `Screenshot removed from: ${item.title}`,
        });

        return NextResponse.json({ success: true });
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
