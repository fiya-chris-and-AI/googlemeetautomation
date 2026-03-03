import { getDriveClient } from '../gmail/client.js';

/**
 * Regex to extract a Google Doc ID from a URL.
 * Matches patterns like `/document/d/ABC123_-xy/`
 */
const DOC_ID_REGEX = /\/document\/d\/([a-zA-Z0-9_-]+)\//;

/**
 * Looks for a Google Docs link in text and extracts the document ID.
 * Returns null if no link is found.
 */
export function extractDocId(text: string): string | null {
    const match = DOC_ID_REGEX.exec(text);
    return match?.[1] ?? null;
}

/**
 * Exports a Google Doc as plain text via the Drive API.
 * The Docs API has a different export format — Drive's
 * `files.export` with `text/plain` is the simplest approach.
 */
export async function fetchGoogleDocText(docId: string): Promise<string> {
    const drive = getDriveClient();

    const res = await drive.files.export({
        fileId: docId,
        mimeType: 'text/plain',
    });

    // res.data can be a string or a Readable stream depending on config
    if (typeof res.data === 'string') {
        return res.data;
    }

    // Handle stream case (shouldn't happen with default config, but safe)
    const chunks: Buffer[] = [];
    const stream = res.data as NodeJS.ReadableStream;
    for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk as Uint8Array));
    }
    return Buffer.concat(chunks).toString('utf-8');
}
