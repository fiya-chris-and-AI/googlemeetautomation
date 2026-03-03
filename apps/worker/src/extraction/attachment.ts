import { getGmailClient } from '../gmail/client.js';

// Re-export pure parsers so existing imports from './attachment' still work
export { parseVtt, parseSbv } from './parsers.js';

/**
 * Download an attachment from a Gmail message.
 * Returns the decoded text content.
 */
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
    // Gmail uses URL-safe base64
    return Buffer.from(base64Data, 'base64url').toString('utf-8');
}

