/**
 * WhatsApp webhook — Next.js API route (deployed on Vercel).
 *
 * GET  /api/whatsapp/webhook — Meta Cloud API verification challenge
 * POST /api/whatsapp/webhook — incoming messages from Meta
 *
 * This mirrors the Express handler in apps/worker but runs inside
 * the Next.js app so it's accessible via Vercel without deploying
 * a separate worker service.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getServerSupabase } from '../../../../lib/supabase';

// ── Config helpers ──────────────────────────────────────────────────

function getWhatsAppConfig() {
    return {
        verifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? null,
        appSecret: process.env.WHATSAPP_APP_SECRET ?? null,
        accessToken: process.env.WHATSAPP_ACCESS_TOKEN ?? null,
        phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? null,
    };
}

function isConfigured(): boolean {
    const c = getWhatsAppConfig();
    return !!(c.verifyToken && c.appSecret);
}

// ── HMAC signature validation ───────────────────────────────────────

function validateSignature(
    rawBody: string,
    signatureHeader: string | null,
    appSecret: string,
): boolean {
    if (!signatureHeader) return false;

    const expected = `sha256=${crypto
        .createHmac('sha256', appSecret)
        .update(rawBody, 'utf-8')
        .digest('hex')}`;

    try {
        return crypto.timingSafeEqual(
            Buffer.from(expected),
            Buffer.from(signatureHeader),
        );
    } catch {
        return false; // Length mismatch
    }
}

// ── Message storage (inlined to avoid worker dependency) ────────────

interface MessageToSave {
    id: string;
    group_id: string;
    group_name: string;
    sender_phone: string;
    sender_name: string;
    message_type: string;
    message_text: string | null;
    quoted_message_id: string | null;
    media_caption: string | null;
    timestamp: string;
    raw_payload: Record<string, unknown>;
}

async function saveMessage(msg: MessageToSave): Promise<boolean> {
    const supabase = getServerSupabase();
    const { error } = await supabase
        .from('whatsapp_messages')
        .upsert(
            {
                id: msg.id,
                group_id: msg.group_id,
                group_name: msg.group_name,
                sender_phone: msg.sender_phone,
                sender_name: msg.sender_name,
                message_type: msg.message_type,
                message_text: msg.message_text,
                quoted_message_id: msg.quoted_message_id,
                media_caption: msg.media_caption,
                timestamp: msg.timestamp,
                raw_payload: msg.raw_payload,
                processed: false,
            },
            { onConflict: 'id', ignoreDuplicates: true },
        );

    if (error) {
        console.error(`[whatsapp:webhook] Failed to save message ${msg.id}:`, error.message);
        return false;
    }
    return true;
}

// ── Message text extraction ─────────────────────────────────────────

function extractMessageText(msg: {
    type: string;
    text?: { body: string };
    image?: { caption?: string };
    document?: { caption?: string; filename: string };
    reaction?: { emoji: string };
}): string | null {
    switch (msg.type) {
        case 'text': return msg.text?.body ?? null;
        case 'image': return msg.image?.caption ?? null;
        case 'document': return msg.document?.caption ?? `[Document: ${msg.document?.filename}]`;
        case 'reaction': return msg.reaction?.emoji ?? null;
        default: return null;
    }
}

function categorizeMessageType(msg: {
    type: string;
    context?: { id: string };
}): string {
    if (msg.context?.id && msg.type !== 'reaction') return 'reply';
    switch (msg.type) {
        case 'text': return 'text';
        case 'image': return 'image';
        case 'document': return 'document';
        case 'reaction': return 'reaction';
        default: return 'text';
    }
}

// ── GET: Verification challenge ─────────────────────────────────────

export async function GET(request: NextRequest) {
    if (!isConfigured()) {
        return NextResponse.json(
            { error: 'WhatsApp not configured' },
            { status: 503 },
        );
    }

    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');

    const config = getWhatsAppConfig();

    if (mode === 'subscribe' && token === config.verifyToken) {
        console.log('[whatsapp:webhook] Verification successful');
        // Meta expects the challenge as plain text, not JSON
        return new Response(challenge, { status: 200 });
    }

    console.warn('[whatsapp:webhook] Verification failed — token mismatch');
    return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

// ── POST: Incoming messages ─────────────────────────────────────────

export async function POST(request: NextRequest) {
    if (!isConfigured()) {
        return NextResponse.json(
            { error: 'WhatsApp not configured' },
            { status: 503 },
        );
    }

    const config = getWhatsAppConfig();

    try {
        // Read the raw body for signature validation
        const rawBody = await request.text();

        // Validate HMAC signature
        if (config.appSecret) {
            const signatureHeader = request.headers.get('x-hub-signature-256');
            if (!validateSignature(rawBody, signatureHeader, config.appSecret)) {
                console.warn('[whatsapp:webhook] Invalid signature — rejecting');
                return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
            }
        }

        // Parse the body
        const body = JSON.parse(rawBody);

        if (body.object !== 'whatsapp_business_account') {
            return NextResponse.json({ processed: 0, skipped: 0 });
        }

        let processed = 0;
        let skipped = 0;

        for (const entry of body.entry ?? []) {
            for (const change of entry.changes ?? []) {
                if (change.field !== 'messages') continue;

                const { contacts, messages } = change.value ?? {};
                if (!messages?.length) continue;

                // Build wa_id → profile name lookup
                const contactMap = new Map<string, string>();
                for (const c of contacts ?? []) {
                    contactMap.set(c.wa_id, c.profile.name);
                }

                for (const msg of messages) {
                    const senderName = contactMap.get(msg.from) ?? msg.from;
                    const messageText = extractMessageText(msg);
                    const messageType = categorizeMessageType(msg);

                    if (!messageText && messageType !== 'reaction') {
                        skipped++;
                        continue;
                    }

                    const saved = await saveMessage({
                        id: msg.id,
                        group_id: entry.id,
                        group_name: entry.id,
                        sender_phone: msg.from,
                        sender_name: senderName,
                        message_type: messageType,
                        message_text: messageText,
                        quoted_message_id: msg.context?.id ?? null,
                        media_caption: msg.image?.caption ?? msg.document?.caption ?? null,
                        timestamp: new Date(parseInt(msg.timestamp, 10) * 1000).toISOString(),
                        raw_payload: msg,
                    });

                    if (saved) processed++;
                    else skipped++;
                }
            }
        }

        console.log(`[whatsapp:webhook] Processed ${processed}, skipped ${skipped}`);
        return NextResponse.json({ processed, skipped });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[whatsapp:webhook] Error: ${message}`);
        // Return 200 to prevent Meta from retrying endlessly
        return NextResponse.json({ processed: false, error: message }, { status: 200 });
    }
}
