import express from 'express';
import { config, isWhatsAppConfigured } from './config.js';
import { handlePubSubPush } from './gmail/handler.js';
import { setupWatch, renewWatch } from './gmail/watcher.js';
import { handleVerification, handleIncomingMessages, validateSignature } from './whatsapp/handler.js';
import { runSessionCompiler } from './whatsapp/session-compiler.js';

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

// ── WhatsApp webhook routes (conditionally registered) ──

if (isWhatsAppConfigured()) {
    /**
     * GET /whatsapp/webhook — Meta Cloud API verification challenge.
     */
    app.get('/whatsapp/webhook', (req, res) => {
        handleVerification(req, res, config.whatsapp.verifyToken!);
    });

    /**
     * POST /whatsapp/webhook — incoming WhatsApp messages.
     * Validates HMAC signature, then processes the payload.
     */
    app.post('/whatsapp/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
        try {
            // Validate signature if app secret is configured
            if (config.whatsapp.appSecret) {
                const signature = req.headers['x-hub-signature-256'] as string | undefined;
                const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));

                if (!validateSignature(rawBody, signature, config.whatsapp.appSecret)) {
                    console.warn('[whatsapp] Invalid webhook signature — rejecting');
                    res.status(401).json({ error: 'Invalid signature' });
                    return;
                }
            }

            // Parse body (may already be parsed or may be raw Buffer)
            const body = Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString()) : req.body;
            const { processed, skipped } = await handleIncomingMessages(body);

            console.log(`[whatsapp] Processed ${processed} message(s), skipped ${skipped}`);
            res.status(200).json({ processed, skipped });
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error(`[whatsapp] Webhook error: ${errorMsg}`);
            // Return 200 to prevent Meta from retrying
            res.status(200).json({ processed: false, error: errorMsg });
        }
    });

    console.log('[server] WhatsApp webhook registered: GET/POST /whatsapp/webhook');
} else {
    console.log('[server] WhatsApp not configured — webhook routes skipped');
}

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

    // Start WhatsApp session compiler interval (if configured)
    if (isWhatsAppConfigured()) {
        const intervalMs = config.whatsapp.sessionCompileIntervalMinutes * 60 * 1000;
        const idleTimeout = config.whatsapp.sessionIdleTimeoutMinutes;

        setInterval(() => {
            runSessionCompiler(idleTimeout).catch((err) => {
                console.error('[whatsapp:compiler] Session compilation failed:', err);
            });
        }, intervalMs);

        console.log(`[server] WhatsApp session compiler active — interval: ${config.whatsapp.sessionCompileIntervalMinutes}m, idle timeout: ${idleTimeout}m`);
    }
}

start();

