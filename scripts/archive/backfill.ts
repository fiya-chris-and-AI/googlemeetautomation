/**
 * Backfill script — scan existing Gmail inbox for transcript emails
 * and run them through the processing pipeline.
 *
 * Usage:
 *   npx tsx scripts/backfill.ts              # process all matching emails
 *   npx tsx scripts/backfill.ts --limit 5    # process at most 5 emails
 *   npx tsx scripts/backfill.ts --dry-run    # list matches without processing
 */

import { getGmailClient } from '../apps/worker/src/gmail/client.js';
import { isTranscriptEmail } from '../apps/worker/src/gmail/filters.js';
import { processEmail } from '../apps/worker/src/pipeline.js';

// ── CLI argument parsing ──

const args = process.argv.slice(2);

function getFlag(name: string): boolean {
    return args.includes(`--${name}`);
}

function getFlagValue(name: string): string | undefined {
    const idx = args.indexOf(`--${name}`);
    return idx !== -1 ? args[idx + 1] : undefined;
}

const DRY_RUN = getFlag('dry-run');
const LIMIT = parseInt(getFlagValue('limit') ?? '0', 10) || Infinity;

// ── Main ──

async function backfill(): Promise<void> {
    const gmail = getGmailClient();

    console.log('[backfill] Searching inbox for transcript emails...');
    if (DRY_RUN) console.log('[backfill] DRY RUN — no emails will be processed');

    // Use Gmail search to narrow down candidates before filtering.
    // This avoids fetching every email in the inbox.
    const SEARCH_QUERY = 'from:gemini-notes@google.com';

    let pageToken: string | undefined;
    let matchCount = 0;
    let processedCount = 0;
    let errorCount = 0;

    do {
        const listRes = await gmail.users.messages.list({
            userId: 'me',
            q: SEARCH_QUERY,
            maxResults: 100,
            pageToken,
        });

        const messages = listRes.data.messages ?? [];

        if (messages.length === 0 && !pageToken) {
            console.log('[backfill] No emails found matching search query.');
            return;
        }

        for (const msg of messages) {
            if (processedCount >= LIMIT) {
                console.log(`[backfill] Reached limit of ${LIMIT}, stopping.`);
                return;
            }

            const messageId = msg.id;
            if (!messageId) continue;

            // Fetch full message to check filters
            const msgRes = await gmail.users.messages.get({
                userId: 'me',
                id: messageId,
                format: 'full',
            });

            const headers = msgRes.data.payload?.headers ?? [];
            const from = headers.find((h) => h.name?.toLowerCase() === 'from')?.value ?? '';
            const subject = headers.find((h) => h.name?.toLowerCase() === 'subject')?.value ?? '';

            if (!isTranscriptEmail(from, subject)) {
                continue;
            }

            matchCount++;
            console.log(`[backfill] #${matchCount} Found: "${subject}" (id=${messageId})`);

            if (DRY_RUN) continue;

            // Process sequentially to avoid Gmail/Supabase rate limits
            try {
                await processEmail(messageId, subject, msgRes.data);
                processedCount++;
                console.log(`[backfill] ✓ Processed: "${subject}"`);
            } catch (err) {
                errorCount++;
                const errorMsg = err instanceof Error ? err.message : String(err);
                console.error(`[backfill] ✗ Failed: "${subject}" — ${errorMsg}`);
                // Continue processing remaining emails
            }
        }

        pageToken = listRes.data.nextPageToken ?? undefined;
    } while (pageToken);

    // ── Summary ──
    console.log('\n[backfill] ── Done ──');
    console.log(`[backfill] Found:     ${matchCount} transcript email(s)`);
    if (!DRY_RUN) {
        console.log(`[backfill] Processed: ${processedCount}`);
        console.log(`[backfill] Errors:    ${errorCount}`);
        console.log(`[backfill] Skipped:   ${matchCount - processedCount - errorCount} (duplicates)`);
    }
}

backfill().catch((err) => {
    console.error('[backfill] Fatal error:', err);
    process.exit(1);
});
