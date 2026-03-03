import { createClient } from '@supabase/supabase-js';

/**
 * Supabase client for server-side use (API routes, server components).
 * Uses the service role key for full access.
 *
 * Next.js 14 patches global `fetch` to cache responses by default.
 * We override fetch here to use `cache: 'no-store'` so Supabase
 * queries always hit the database instead of returning stale data.
 */
export function getServerSupabase() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
        throw new Error('Missing Supabase server environment variables');
    }

    return createClient(url, key, {
        global: {
            fetch: (input, init) =>
                fetch(input, { ...init, cache: 'no-store' } as RequestInit),
        },
    });
}

/**
 * Supabase client for client-side use (browser components).
 * Uses the anon key — respects RLS policies.
 */
export function getBrowserSupabase() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    return createClient(url, key);
}
