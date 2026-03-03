import express from 'express';
import { config } from './config.js';
import { handlePubSubPush } from './gmail/handler.js';
import { setupWatch, renewWatch } from './gmail/watcher.js';

const app = express();
app.use(express.json());

// Track the last processed historyId for incremental syncs
let lastHistoryId = '';

/**
 * Health check endpoint — used by Cloud Run and load balancers.
 */
app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * Pub/Sub push endpoint — Gmail sends notifications here.
 *
 * The request body is the standard Cloud Pub/Sub push format:
 * { message: { data: "base64-encoded", messageId: "..." }, subscription: "..." }
 */
app.post('/pubsub', async (req, res) => {
    try {
        const messageData = req.body?.message?.data;

        if (!messageData) {
            console.warn('[server] Received Pub/Sub push with no message data');
            res.status(400).json({ error: 'Missing message data' });
            return;
        }

        console.log('[server] Received Pub/Sub notification');

        const newHistoryId = await handlePubSubPush(messageData, lastHistoryId);

        // Store updated historyId for next call
        if (newHistoryId) {
            lastHistoryId = newHistoryId;
        }

        // Always return 200 so Pub/Sub doesn't retry
        res.status(200).json({ processed: true });
    } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`[server] Pub/Sub handler error: ${errorMsg}`);
        // Still return 200 to prevent infinite retries
        res.status(200).json({ processed: false, error: errorMsg });
    }
});

// ── Start server ──

async function start(): Promise<void> {
    // Start the Express server first — dashboard API routes should work
    // even if Gmail watch isn't configured yet
    app.listen(config.port, () => {
        console.log(`[server] Worker listening on port ${config.port}`);
        console.log(`[server] Pub/Sub endpoint: POST /pubsub`);
        console.log(`[server] Health check: GET /health`);
    });

    // Attempt Gmail watch setup (non-fatal — Pub/Sub topic may not exist yet)
    try {
        const watchResult = await setupWatch();
        lastHistoryId = watchResult.historyId;
        console.log(`[server] Gmail watch active, historyId: ${lastHistoryId}`);

        // Schedule watch renewal every 6 days (watch expires after 7)
        const SIX_DAYS_MS = 6 * 24 * 60 * 60 * 1000;
        setInterval(() => {
            renewWatch().catch((err) => {
                console.error('[server] Watch renewal failed:', err);
            });
        }, SIX_DAYS_MS);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[server] Gmail watch setup skipped: ${msg}`);
        console.warn('[server] The server is running but won\'t receive Gmail notifications.');
        console.warn('[server] Create the Pub/Sub topic and restart to enable Gmail watching.');
    }
}

start();
