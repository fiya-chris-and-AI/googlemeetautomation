import { NextResponse } from 'next/server';
import type { gmail_v1 } from 'googleapis';
import type { ExtractionMethod } from '@meet-pipeline/shared';
import { processUpload, parseVtt, parseSbv } from '../../../lib/upload-pipeline';
import { getServerSupabase } from '../../../lib/supabase';
import {
    searchTranscriptEmails,
    fetchFullMessage,
    downloadAttachment,
    fetchGoogleDocText,
    isTranscriptEmail,
    extractMeetingTitle,
    extractDocId,
    getBodyHtml,
    stripHtml,
    getHeader,
} from '../../../lib/gmail';

export const dynamic = 'force-dynamic';
export const maxDuration = 120; // Allow up to 2 minutes for bulk processing

// ── Types ──────────────────────────────────────────────────────────

interface SyncDetail {
    subject: string;
    status: 'skipped' | 'processed' | 'error';
    error?: string;
}

interface SyncResult {
    found: number;
    alreadyProcessed: number;
    newlyProcessed: number;
    errors: number;
    details: SyncDetail[];
    query?: string;
    error?: string;
}

// ── Main Handler ───────────────────────────────────────────────────

export async function POST(): Promise<NextResponse<SyncResult>> {
    const supabase = getServerSupabase();

    try {
        // Step 1: Search Gmail for Gemini Notes emails (last 30 days, max 50)
        const { messages, query } = await searchTranscriptEmails(50, 30);

        const result: SyncResult = {
            found: messages.length,
            alreadyProcessed: 0,
            newlyProcessed: 0,
            errors: 0,
            details: [],
            query,
        };

        if (messages.length === 0) {
            return NextResponse.json(result);
        }

        // Step 2: Collect message IDs for dedup check
        const messageIds = messages.map((m) => m.id!).filter(Boolean);

        // Batch dedup: fetch all existing source_email_ids in one query
        const { data: existingRows } = await supabase
            .from('transcripts')
            .select('source_email_id')
            .in('source_email_id', messageIds);

        const existingIds = new Set(
            (existingRows ?? []).map((r: { source_email_id: string }) => r.source_email_id)
        );

        // Step 3: Process new messages in batches of 5
        const CONCURRENCY = 5;
        const toProcess: gmail_v1.Schema$Message[] = [];
        const skippedDetails: SyncDetail[] = [];

        // Separate already-processed from new
        for (const msg of messages) {
            const msgId = msg.id!;
            if (existingIds.has(msgId)) {
                result.alreadyProcessed++;
                skippedDetails.push({ subject: msgId, status: 'skipped' });
            } else {
                toProcess.push(msg);
            }
        }

        result.details.push(...skippedDetails);

        // Process in concurrent batches
        for (let i = 0; i < toProcess.length; i += CONCURRENCY) {
            const batch = toProcess.slice(i, i + CONCURRENCY);
            const settled = await Promise.allSettled(
                batch.map((msg) => processSingleEmail(msg.id!))
            );

            for (const outcome of settled) {
                if (outcome.status === 'fulfilled') {
                    result.details.push(outcome.value);
                    if (outcome.value.status === 'processed') {
                        result.newlyProcessed++;
                    } else if (outcome.value.status === 'error') {
                        result.errors++;
                    }
                } else {
                    result.errors++;
                    result.details.push({
                        subject: 'unknown',
                        status: 'error',
                        error: outcome.reason instanceof Error
                            ? outcome.reason.message
                            : String(outcome.reason),
                    });
                }
            }
        }

        return NextResponse.json(result);
    } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`[sync] Top-level error: ${errorMsg}`);

        return NextResponse.json(
            {
                found: 0,
                alreadyProcessed: 0,
                newlyProcessed: 0,
                errors: 1,
                details: [],
                error: errorMsg,
            },
            { status: 200 } // Return 200 so the frontend can parse the error
        );
    }
}

// ── Per-Email Processing ───────────────────────────────────────────

async function processSingleEmail(messageId: string): Promise<SyncDetail> {
    const message = await fetchFullMessage(messageId);

    const from = getHeader(message, 'From');
    const subject = getHeader(message, 'Subject');

    // Verify it matches our filter (belt-and-suspenders with the Gmail query)
    if (!isTranscriptEmail(from, subject)) {
        return { subject, status: 'skipped' };
    }

    try {
        // Extract transcript text using the same priority as the worker
        const { text, method } = await extractTranscriptText(messageId, message);

        if (!text || text.trim().length === 0) {
            throw new Error('Extracted transcript text is empty');
        }

        // Extract title from subject, date from internalDate
        const title = extractMeetingTitle(subject);
        const date = message.internalDate
            ? new Date(parseInt(message.internalDate, 10))
            : new Date();

        // Feed into the existing upload pipeline (handles chunking, embedding, storage)
        await processUpload({
            text,
            title,
            date,
            extractionMethod: method,
            sourceEmailId: messageId,
        });

        console.log(`[sync] ✓ Processed: ${title}`);
        return { subject, status: 'processed' };
    } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`[sync] ✗ Failed ${messageId}: ${errorMsg}`);
        return { subject, status: 'error', error: errorMsg };
    }
}

// ── Text Extraction (mirrors worker priority: attachment → doc → inline) ─

async function extractTranscriptText(
    messageId: string,
    message: gmail_v1.Schema$Message
): Promise<{ text: string; method: ExtractionMethod }> {
    // 1. Check for .txt / .vtt / .sbv attachments
    const parts = message.payload?.parts ?? [];
    for (const part of parts) {
        const filename = part.filename ?? '';
        const attachmentId = part.body?.attachmentId;

        if (attachmentId && /\.(txt|vtt|sbv)$/i.test(filename)) {
            const raw = await downloadAttachment(messageId, attachmentId);
            let text = raw;

            if (filename.endsWith('.vtt')) text = parseVtt(raw);
            else if (filename.endsWith('.sbv')) text = parseSbv(raw);

            return { text, method: 'attachment' };
        }
    }

    // 2. Check for Google Doc link in body HTML
    const bodyHtml = getBodyHtml(message);
    if (bodyHtml) {
        const docId = extractDocId(bodyHtml);
        if (docId) {
            const text = await fetchGoogleDocText(docId);
            return { text, method: 'google_doc' };
        }
    }

    // 3. Fall back to inline HTML extraction (regex-based, no cheerio)
    if (bodyHtml) {
        const text = stripHtml(bodyHtml);
        return { text, method: 'inline' };
    }

    throw new Error('Could not find transcript content in email');
}
