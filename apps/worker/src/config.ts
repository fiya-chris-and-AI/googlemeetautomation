/**
 * Centralized configuration loaded from environment variables.
 * Throws immediately on missing required values so failures are
 * caught at startup, not buried in a silent runtime path.
 */

import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load .env from the monorepo root (two levels up from apps/worker/src/)
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '..', '..', '.env') });


interface Config {
    google: {
        clientId: string;
        clientSecret: string;
        refreshToken: string;
        pubsubTopic: string;
        userEmail: string;
    };
    supabase: {
        url: string;
        serviceRoleKey: string;
    };
    openai: {
        apiKey: string;
    };
    port: number;
}

/** Reads a required env var, throws with a clear message if missing. */
function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

/**
 * Build and validate all config at import time.
 * Workers that can't reach their dependencies should fail fast.
 */
export const config: Config = {
    google: {
        clientId: requireEnv('GOOGLE_CLIENT_ID'),
        clientSecret: requireEnv('GOOGLE_CLIENT_SECRET'),
        refreshToken: requireEnv('GOOGLE_REFRESH_TOKEN'),
        pubsubTopic: requireEnv('GMAIL_PUBSUB_TOPIC'),
        userEmail: requireEnv('GMAIL_USER_EMAIL'),
    },
    supabase: {
        url: requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
        serviceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    },
    openai: {
        apiKey: requireEnv('OPENAI_API_KEY'),
    },
    port: parseInt(process.env['WORKER_PORT'] ?? '3001', 10),
};
