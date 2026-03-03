import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config.js';

let client: SupabaseClient | null = null;

/**
 * Returns a singleton Supabase client using the service-role key.
 * The service-role key bypasses RLS — this is intentional for the
 * server-side worker that needs full read/write access.
 */
export function getSupabaseClient(): SupabaseClient {
    if (!client) {
        client = createClient(config.supabase.url, config.supabase.serviceRoleKey);
    }
    return client;
}
