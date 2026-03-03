import { getGmailClient } from './client.js';
import { config } from '../config.js';

/**
 * Register a Gmail push notification watch via Pub/Sub.
 * Must be called at startup and renewed every 7 days.
 * Only watches the INBOX — this is the only label where
 * transcript emails arrive.
 */
export async function setupWatch(): Promise<{ historyId: string; expiration: string }> {
    const gmail = getGmailClient();

    const res = await gmail.users.watch({
        userId: 'me',
        requestBody: {
            topicName: config.google.pubsubTopic,
            labelIds: ['INBOX'],
        },
    });

    const historyId = res.data.historyId ?? '';
    const expiration = res.data.expiration ?? '';

    console.log(`[gmail:watch] Watch registered. historyId=${historyId}, expires=${expiration}`);
    return { historyId, expiration };
}

/**
 * Renew the watch — call this on a 6-day interval to ensure
 * we never miss notifications due to expiry.
 */
export async function renewWatch(): Promise<void> {
    await setupWatch();
    console.log('[gmail:watch] Watch renewed successfully.');
}
