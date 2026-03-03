import type { gmail_v1 } from 'googleapis';
import type { ExtractionMethod } from '@meet-pipeline/shared';
import { extractInlineTranscript } from './extraction/inline.js';
import { extractDocId, fetchGoogleDocText } from './extraction/google-doc.js';
import { downloadAttachment, parseVtt, parseSbv } from './extraction/attachment.js';
import { normalizeTranscript } from './extraction/normalize.js';
import { chunkTranscript } from './chunking/chunker.js';
import { generateEmbeddings } from './embedding/embedder.js';
import { isDuplicate, insertTranscript, insertChunks, logProcessing } from './db/queries.js';

/**
 * Full processing pipeline for a single Gmail message.
 *
 * Steps:
 * 1. Dedup check — skip if we've already processed this email
 * 2. Detect extraction method (attachment → doc link → inline)
 * 3. Extract raw text
 * 4. Normalize into MeetingTranscript
 * 5. Store in database
 * 6. Chunk text and generate embeddings
 * 7. Store chunks
 * 8. Log success
 */
export async function processEmail(
    messageId: string,
    subject: string,
    message: gmail_v1.Schema$Message
): Promise<void> {
    // Step 1: Dedup
    if (await isDuplicate(messageId)) {
        console.log(`[pipeline] Skipping duplicate: ${messageId}`);
        await logProcessing({
            sourceEmailId: messageId,
            emailSubject: subject,
            status: 'skipped',
            errorMessage: 'Duplicate email — already processed',
        });
        return;
    }

    try {
        // Step 2 & 3: Detect method and extract text
        const { text, method } = await extractTranscriptText(messageId, message);

        if (!text || text.trim().length === 0) {
            throw new Error('Extracted transcript text is empty');
        }

        console.log(`[pipeline] Extracted ${text.length} chars via "${method}" from ${messageId}`);

        // Step 4: Normalize
        const transcript = normalizeTranscript({
            emailId: messageId,
            subject,
            internalDate: message.internalDate,
            rawText: text,
            extractionMethod: method,
        });

        // Step 5: Store transcript
        await insertTranscript(transcript);
        console.log(`[pipeline] Stored transcript: ${transcript.transcript_id}`);

        // Step 6: Chunk and embed
        const chunks = chunkTranscript(text);
        console.log(`[pipeline] Created ${chunks.length} chunks`);

        const chunkTexts = chunks.map((c) => c.text);
        const embeddings = await generateEmbeddings(chunkTexts);
        console.log(`[pipeline] Generated ${embeddings.length} embeddings`);

        // Step 7: Store chunks with embeddings
        const chunkRecords = chunks.map((c, i) => ({
            id: `${transcript.transcript_id}_chunk_${c.index}`,
            transcript_id: transcript.transcript_id,
            meeting_title: transcript.meeting_title,
            meeting_date: transcript.meeting_date,
            participants: transcript.participants,
            chunk_index: c.index,
            total_chunks: c.totalChunks,
            text: c.text,
            embedding: embeddings[i],
            token_estimate: c.tokenEstimate,
            created_at: new Date().toISOString(),
        }));

        await insertChunks(chunkRecords);
        console.log(`[pipeline] Stored ${chunkRecords.length} chunks in database`);

        // Step 8: Log success
        await logProcessing({
            sourceEmailId: messageId,
            emailSubject: subject,
            status: 'success',
            extractionMethod: method,
        });

        console.log(`[pipeline] ✓ Successfully processed: ${transcript.meeting_title}`);
    } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`[pipeline] ✗ Failed to process ${messageId}: ${errorMsg}`);

        await logProcessing({
            sourceEmailId: messageId,
            emailSubject: subject,
            status: 'error',
            errorMessage: errorMsg,
        });

        throw err; // Re-throw so the caller knows it failed
    }
}

// ── Internal helpers ──

/**
 * Determine the extraction method and pull raw text.
 * Priority: attachment → Google Doc link → inline body.
 */
async function extractTranscriptText(
    messageId: string,
    message: gmail_v1.Schema$Message
): Promise<{ text: string; method: ExtractionMethod }> {
    // Check for attachments first
    const parts = message.payload?.parts ?? [];
    for (const part of parts) {
        const filename = part.filename ?? '';
        const attachmentId = part.body?.attachmentId;

        if (attachmentId && /\.(txt|vtt|sbv)$/i.test(filename)) {
            const raw = await downloadAttachment(messageId, attachmentId);
            let text = raw;

            if (filename.endsWith('.vtt')) {
                text = parseVtt(raw);
            } else if (filename.endsWith('.sbv')) {
                text = parseSbv(raw);
            }

            return { text, method: 'attachment' };
        }
    }

    // Check for Google Doc links in the body
    const bodyHtml = getBodyHtml(message);
    if (bodyHtml) {
        const docId = extractDocId(bodyHtml);
        if (docId) {
            const text = await fetchGoogleDocText(docId);
            return { text, method: 'google_doc' };
        }
    }

    // Fall back to inline HTML extraction
    if (bodyHtml) {
        const text = extractInlineTranscript(bodyHtml);
        return { text, method: 'inline' };
    }

    throw new Error('Could not find transcript content in email');
}

/**
 * Extract the HTML body from a Gmail message's complex MIME structure.
 */
function getBodyHtml(message: gmail_v1.Schema$Message): string | null {
    // Try the top-level body first
    const topBody = message.payload?.body?.data;
    if (topBody) {
        return Buffer.from(topBody, 'base64url').toString('utf-8');
    }

    // Search through MIME parts for text/html
    const parts = message.payload?.parts ?? [];
    for (const part of parts) {
        if (part.mimeType === 'text/html' && part.body?.data) {
            return Buffer.from(part.body.data, 'base64url').toString('utf-8');
        }

        // Check nested parts (multipart/alternative, etc.)
        const nested = part.parts ?? [];
        for (const sub of nested) {
            if (sub.mimeType === 'text/html' && sub.body?.data) {
                return Buffer.from(sub.body.data, 'base64url').toString('utf-8');
            }
        }
    }

    return null;
}
