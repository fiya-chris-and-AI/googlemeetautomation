import { getGmailClient } from './client.js';
import { isTranscriptEmail } from './filters.js';
import { processEmail } from '../pipeline.js';

/**
 * Decodes a Pub/Sub push notification body.
 * Gmail encodes the payload as base64 JSON containing
 * `emailAddress` and `historyId`.
 */
interface PubSubNotification {
    emailAddress: string;
    historyId: string;
}

/**
 * Handle a Pub/Sub push notification from Gmail.
 *
 * Flow:
 * 1. Decode the base64 Pub/Sub message
 * 2. Use history.list to find new messages since the last known historyId
 * 3. For each new message, check if it's a transcript email
 * 4. Route matching emails to the processing pipeline
 */
export async function handlePubSubPush(
    messageData: string,
    lastHistoryId: string
): Promise<string> {
    // Decode the Pub/Sub message
    const decoded = Buffer.from(messageData, 'base64').toString('utf-8');
    const notification: PubSubNotification = JSON.parse(decoded);

    console.log(`[gmail:handler] Notification for ${notification.emailAddress}, historyId=${notification.historyId}`);

    const gmail = getGmailClient();

    // Fetch message history since we last checked
    const historyRes = await gmail.users.history.list({
        userId: 'me',
        startHistoryId: lastHistoryId,
        historyTypes: ['messageAdded'],
        labelId: 'INBOX',
    });

    const histories = historyRes.data.history ?? [];
    let processedCount = 0;

    for (const history of histories) {
        const addedMessages = history.messagesAdded ?? [];

        for (const added of addedMessages) {
            const messageId = added.message?.id;
            if (!messageId) continue;

            // Fetch the full message
            const msgRes = await gmail.users.messages.get({
                userId: 'me',
                id: messageId,
                format: 'full',
            });

            const headers = msgRes.data.payload?.headers ?? [];
            const from = headers.find((h) => h.name?.toLowerCase() === 'from')?.value ?? '';
            const subject = headers.find((h) => h.name?.toLowerCase() === 'subject')?.value ?? '';

            if (!isTranscriptEmail(from, subject)) {
                console.log(`[gmail:handler] Skipping non-transcript email: "${subject}"`);
                continue;
            }

            console.log(`[gmail:handler] Found transcript email: "${subject}" (id=${messageId})`);

            try {
                await processEmail(messageId, subject, msgRes.data);
                processedCount++;
            } catch (err) {
                const errorMsg = err instanceof Error ? err.message : String(err);
                console.error(`[gmail:handler] Failed to process ${messageId}: ${errorMsg}`);
            }
        }
    }

    // Return the latest historyId so the caller can persist it
    return notification.historyId;
}
