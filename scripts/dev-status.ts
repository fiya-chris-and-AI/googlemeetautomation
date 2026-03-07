#!/usr/bin/env tsx
/**
 * Dev Status — Quick CLI to check current DB state.
 *
 * Usage:
 *   npx tsx scripts/dev-status.ts
 *
 * Output:
 *   === MeetScript Dev Status ===
 *   Transcripts:      3
 *   Chunks:          36
 *   Action Items:     8  (7 ai, 1 human)
 *   Decisions:        2
 *   Processing Log:   3  (3 success, 0 error)
 *   Last Import:      2025-12-16T20:09:18Z — "Chris/Lutfiya"
 */

import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

// ── Load .env from monorepo root ─────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '.env') });

// ── Supabase client ──────────────────────────────────────────────────

function getSupabase() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
        throw new Error(
            'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env',
        );
    }

    return createClient(url, key);
}

// ── Count helpers ────────────────────────────────────────────────────

async function countRows(
    supabase: ReturnType<typeof getSupabase>,
    table: string,
    filter?: Record<string, string>,
): Promise<number> {
    let query = supabase.from(table).select('*', { count: 'exact', head: true });

    if (filter) {
        for (const [key, value] of Object.entries(filter)) {
            query = query.eq(key, value);
        }
    }

    const { count, error } = await query;

    if (error) {
        console.error(`  ⚠️  Could not count ${table}: ${error.message}`);
        return -1;
    }

    return count ?? 0;
}

// ── Main ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    const supabase = getSupabase();

    console.log('\n=== MeetScript Dev Status ===\n');

    // Transcripts
    const transcripts = await countRows(supabase, 'transcripts');
    console.log(`  Transcripts:      ${transcripts}`);

    // Chunks
    const chunks = await countRows(supabase, 'transcript_chunks');
    console.log(`  Chunks:           ${chunks}`);

    // Action items with breakdown
    const totalItems = await countRows(supabase, 'action_items');
    const aiItems = await countRows(supabase, 'action_items', { created_by: 'ai' });
    const manualItems = totalItems - aiItems;
    console.log(
        `  Action Items:     ${totalItems}` +
        (totalItems > 0 ? `  (${aiItems} ai, ${manualItems} human)` : ''),
    );

    // Decisions
    const decisions = await countRows(supabase, 'decisions');
    console.log(`  Decisions:        ${decisions}`);

    // Processing log with breakdown
    const totalLogs = await countRows(supabase, 'processing_log');
    const successLogs = await countRows(supabase, 'processing_log', { status: 'success' });
    const errorLogs = await countRows(supabase, 'processing_log', { status: 'error' });
    console.log(
        `  Processing Log:   ${totalLogs}` +
        (totalLogs > 0 ? `  (${successLogs} success, ${errorLogs} error)` : ''),
    );

    // Last import
    const { data: lastTranscript, error: lastErr } = await supabase
        .from('transcripts')
        .select('meeting_title, processed_at')
        .order('processed_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (lastErr) {
        console.log(`  Last Import:      ⚠️ ${lastErr.message}`);
    } else if (lastTranscript) {
        console.log(
            `  Last Import:      ${lastTranscript.processed_at} — "${lastTranscript.meeting_title}"`,
        );
    } else {
        console.log(`  Last Import:      (none)`);
    }

    console.log('');
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
