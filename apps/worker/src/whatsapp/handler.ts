/**
 * WhatsApp webhook handler — processes Meta Cloud API webhook events.
 *
 * GET  /whatsapp/webhook — verification challenge (hub.mode + hub.verify_token)
 * POST /whatsapp/webhook — incoming messages (text, media, reactions, replies)
 *
 * Each handler is a pure function accepting request data and config,
 * keeping Express coupling in index.ts.
 */

import type { Request, Response } from 'express';
import crypto from 'crypto';
import { saveMessage } from './store.js';

// ── Types for Meta webhook payloads ─────────────────────────────────

interface WhatsAppWebhookEntry {
    id: string;
    changes: Array<{
        value: {
            messaging_product: string;
            metadata: { display_phone_number: string; phone_number_id: string };
            contacts?: Array<{ profile: { name: string }; wa_id: string }>;
            messages?: Array<{
                from: string;
                id: string;
                timestamp: string;
                type: string;
                text?: { body: string };
                image?: { caption?: string; id: string };
                document?: { caption?: string; filename: string; id: string };
                reaction?: { message_id: string; emoji: string };
                context?: { from: string; id: string; quoted?: boolean };
            }>;
        };
        field: string;
    }>;
}

interface WhatsAppConfig {
    verifyToken: string;
    appSecret: string;
}

// ── Webhook verification (GET) ──────────────────────────────────────

/**
 * Handle the Meta Cloud API webhook verification challenge.
 * Returns the challenge string if the verify_token matches config.
 */
export function handleVerification(req: Request, res: Response, verifyToken: string): void {
    const mode = req.query['hub.mode'] as string | undefined;
    const token = req.query['hub.verify_token'] as string | undefined;
    const challenge = req.query['hub.challenge'] as string | undefined;

    if (mode === 'subscribe' && token === verifyToken) {
        console.log('[whatsapp] Webhook verification successful');
        res.status(200).send(challenge);
    } else {
        console.warn('[whatsapp] Webhook verification failed — token mismatch');
        res.status(403).json({ error: 'Verification failed' });
    }
}

// ── Signature validation ────────────────────────────────────────────

/**
 * Validate the X-Hub-Signature-256 HMAC header from Meta.
 * Returns true if the signature matches, false otherwise.
 */
export function validateSignature(
    rawBody: Buffer,
    signatureHeader: string | undefined,
    appSecret: string,
): boolean {
    if (!signatureHeader) return false;

    const expectedSig = crypto
        .createHmac('sha256', appSecret)
        .update(rawBody)
        .digest('hex');

    const expected = `sha256=${expectedSig}`;
    return crypto.timingSafeEqual(
        Buffer.from(expected),
        Buffer.from(signatureHeader),
    );
}

// ── Incoming message processing (POST) ──────────────────────────────

/**
 * Parse and store incoming WhatsApp messages from the webhook payload.
 *
 * Extracts group info, sender name, message text (or caption),
 * and reply context from the Meta webhook format.
 * Deduplicates by wamid via the store layer.
 */
export async function handleIncomingMessages(
    body: { object?: string; entry?: WhatsAppWebhookEntry[] },
): Promise<{ processed: number; skipped: number }> {
    if (body.object !== 'whatsapp_business_account') {
        return { processed: 0, skipped: 0 };
    }

    let processed = 0;
    let skipped = 0;

    for (const entry of body.entry ?? []) {
        for (const change of entry.changes) {
            if (change.field !== 'messages') continue;

            const { contacts, messages } = change.value;
            if (!messages?.length) continue;

            // Build a lookup from wa_id → profile name
            const contactMap = new Map<string, string>();
            for (const c of contacts ?? []) {
                contactMap.set(c.wa_id, c.profile.name);
            }

            for (const msg of messages) {
                const senderName = contactMap.get(msg.from) ?? msg.from;
                const messageText = extractMessageText(msg);
                const messageType = categorizeMessageType(msg);

                // Skip messages with no extractable text content
                if (!messageText && messageType !== 'reaction') {
                    skipped++;
                    continue;
                }

                const saved = await saveMessage({
                    id: msg.id,
                    group_id: entry.id,
                    group_name: entry.id, // Will be resolved from metadata or config
                    sender_phone: msg.from,
                    sender_name: senderName,
                    message_type: messageType,
                    message_text: messageText,
                    quoted_message_id: msg.context?.id ?? null,
                    media_caption: msg.image?.caption ?? msg.document?.caption ?? null,
                    timestamp: new Date(parseInt(msg.timestamp, 10) * 1000).toISOString(),
                    raw_payload: msg as unknown as Record<string, unknown>,
                });

                if (saved) {
                    processed++;
                } else {
                    skipped++; // Duplicate
                }
            }
        }
    }

    return { processed, skipped };
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Extract the primary text content from a message, regardless of type. */
function extractMessageText(msg: {
    type: string;
    text?: { body: string };
    image?: { caption?: string };
    document?: { caption?: string; filename: string };
    reaction?: { emoji: string; message_id: string };
}): string | null {
    switch (msg.type) {
        case 'text':
            return msg.text?.body ?? null;
        case 'image':
            return msg.image?.caption ?? null;
        case 'document':
            return msg.document?.caption ?? `[Document: ${msg.document?.filename}]`;
        case 'reaction':
            return msg.reaction ? `${msg.reaction.emoji}` : null;
        default:
            return null;
    }
}

/** Map Meta's message type to our stored message_type enum. */
function categorizeMessageType(msg: {
    type: string;
    context?: { id: string };
}): 'text' | 'image' | 'document' | 'reaction' | 'reply' {
    // A message with context is a reply, regardless of its media type
    if (msg.context?.id && msg.type !== 'reaction') return 'reply';

    switch (msg.type) {
        case 'text': return 'text';
        case 'image': return 'image';
        case 'document': return 'document';
        case 'reaction': return 'reaction';
        default: return 'text';
    }
}
