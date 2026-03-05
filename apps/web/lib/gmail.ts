import { google } from 'googleapis';
import type { gmail_v1 } from 'googleapis';

// ── OAuth Clients ──────────────────────────────────────────────────

/** Create an OAuth2 client using server-only env vars. */
function getOAuth2Client() {
    const oauth2 = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    return oauth2;
}

export function getGmailClient() {
    return google.gmail({ version: 'v1', auth: getOAuth2Client() });
}

export function getDriveClient() {
    return google.drive({ version: 'v3', auth: getOAuth2Client() });
}

// ── Email Filters (mirrors apps/worker/src/gmail/filters.ts) ───────

const TRANSCRIPT_SENDERS: string[] = [
    'gemini-notes@google.com',
    'meetings-noreply@google.com',
];

const TRANSCRIPT_SUBJECT_PATTERNS: RegExp[] = [
    // gemini-notes@google.com patterns
    /^Notes: /i,
    /^Notes from /i,
    /^Transcript for /i,
    /^Meeting transcript/i,

    // meetings-noreply@google.com patterns
    // TODO: confirm exact subject patterns from real emails
    /^Meeting notes:?\s/i,
    /^Meeting summary:?\s/i,
    /^Post-call notes:?\s/i,
];

/** Determines whether an email is a Google Meet transcript. */
export function isTranscriptEmail(from: string, subject: string): boolean {
    const fromLower = from.toLowerCase();
    const senderMatch = TRANSCRIPT_SENDERS.some((s) => fromLower.includes(s));
    const subjectMatch = TRANSCRIPT_SUBJECT_PATTERNS.some((p) => p.test(subject));
    return senderMatch && subjectMatch;
}

// ── Title Extraction (mirrors apps/worker/src/extraction/normalize.ts) ──

const SUBJECT_PATTERNS: RegExp[] = [
    // gemini-notes@google.com patterns
    /^Notes:\s*"?(.+?)"?\s*$/i,
    /^Notes from\s+"?(.+?)"?\s*$/i,
    /^Transcript for\s+"?(.+?)"?\s*$/i,
    /^Meeting transcript:?\s*"?(.+?)"?\s*$/i,

    // meetings-noreply@google.com patterns
    // TODO: confirm exact subject patterns from real emails
    /^Meeting notes:?\s*"?(.+?)"?\s*$/i,
    /^Meeting summary:?\s*"?(.+?)"?\s*$/i,
    /^Post-call notes:?\s*"?(.+?)"?\s*$/i,
];

/** Extract a clean meeting title from the email subject line. */
export function extractMeetingTitle(subject: string): string {
    for (const pattern of SUBJECT_PATTERNS) {
        const match = pattern.exec(subject);
        if (match?.[1]) return match[1].trim();
    }
    return subject.trim();
}

// ── Gmail API Helpers ──────────────────────────────────────────────

/** Search Gmail for recent transcript emails from all accepted senders. */
export async function searchTranscriptEmails(
    maxResults = 50,
    newerThanDays = 30
): Promise<gmail_v1.Schema$Message[]> {
    const gmail = getGmailClient();
    // Gmail OR syntax: {from:a from:b} matches messages from either sender
    const fromClause = TRANSCRIPT_SENDERS.map((s) => `from:${s}`).join(' ');
    const query = `{${fromClause}} newer_than:${newerThanDays}d`;

    const res = await gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults,
    });

    return res.data.messages ?? [];
}

/** Fetch a full Gmail message by ID. */
export async function fetchFullMessage(
    messageId: string
): Promise<gmail_v1.Schema$Message> {
    const gmail = getGmailClient();
    const res = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
    });
    return res.data;
}

/** Download and decode an email attachment as UTF-8 text. */
export async function downloadAttachment(
    messageId: string,
    attachmentId: string
): Promise<string> {
    const gmail = getGmailClient();
    const res = await gmail.users.messages.attachments.get({
        userId: 'me',
        messageId,
        id: attachmentId,
    });

    const base64Data = res.data.data ?? '';
    return Buffer.from(base64Data, 'base64url').toString('utf-8');
}

// ── Google Doc Extraction (mirrors apps/worker/src/extraction/google-doc.ts) ──

const DOC_ID_REGEX = /\/document\/d\/([a-zA-Z0-9_-]+)\//;

/** Extract a Google Doc ID from HTML text containing a Docs URL. */
export function extractDocId(text: string): string | null {
    const match = DOC_ID_REGEX.exec(text);
    return match?.[1] ?? null;
}

/** Export a Google Doc as plain text via the Drive API. */
export async function fetchGoogleDocText(docId: string): Promise<string> {
    const drive = getDriveClient();
    const res = await drive.files.export({
        fileId: docId,
        mimeType: 'text/plain',
    });

    if (typeof res.data === 'string') return res.data;

    // Handle stream case (rare with default config)
    const chunks: Buffer[] = [];
    const stream = res.data as NodeJS.ReadableStream;
    for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk as Uint8Array));
    }
    return Buffer.concat(chunks).toString('utf-8');
}

// ── HTML Body Extraction (mirrors worker getBodyHtml + inline extraction) ──

/**
 * Extract the HTML body from a Gmail message's MIME structure.
 * Searches top-level body, then parts, then nested sub-parts.
 */
export function getBodyHtml(message: gmail_v1.Schema$Message): string | null {
    // Try top-level body first
    const topBody = message.payload?.body?.data;
    if (topBody) {
        return Buffer.from(topBody, 'base64url').toString('utf-8');
    }

    // Search MIME parts for text/html
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

/**
 * Regex-based HTML → plain text conversion.
 * Replaces cheerio (not in the web app) with a simple approach
 * that works well for Gemini Notes emails' simple HTML structure.
 */
export function stripHtml(html: string): string {
    let text = html;

    // Remove script and style blocks entirely
    text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<style[\s\S]*?<\/style>/gi, '');

    // Replace block-level elements and <br> with newlines
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<\/(?:p|div|li|tr|h[1-6])>/gi, '\n');

    // Strip all remaining HTML tags
    text = text.replace(/<[^>]+>/g, '');

    // Decode common HTML entities
    text = text.replace(/&nbsp;/gi, ' ');
    text = text.replace(/&amp;/gi, '&');
    text = text.replace(/&lt;/gi, '<');
    text = text.replace(/&gt;/gi, '>');
    text = text.replace(/&quot;/gi, '"');
    text = text.replace(/&#39;/gi, "'");

    // Collapse whitespace on each line, remove blank lines
    const lines = text
        .split('\n')
        .map((line) => line.replace(/\s+/g, ' ').trim())
        .filter((line) => line.length > 0);

    return lines.join('\n');
}

/** Extract header value from a Gmail message by header name. */
export function getHeader(
    message: gmail_v1.Schema$Message,
    name: string
): string {
    const headers = message.payload?.headers ?? [];
    const header = headers.find(
        (h) => h.name?.toLowerCase() === name.toLowerCase()
    );
    return header?.value ?? '';
}
