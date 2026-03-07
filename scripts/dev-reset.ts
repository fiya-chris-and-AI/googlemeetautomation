#!/usr/bin/env tsx
/**
 * Dev Reset — Truncate all data tables for a clean dev/testing environment.
 *
 * Usage:
 *   npx tsx scripts/dev-reset.ts              # Dry-run (prints counts only)
 *   npx tsx scripts/dev-reset.ts --confirm    # Actually deletes all rows
 *
 * Deletion order respects FK constraints (children before parents):
 *   activity_log → decisions → action_items → transcript_chunks → processing_log → transcripts
 */

import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

// ── Load .env from monorepo root ─────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '.env') });

// ── Supabase client (service-role, same pattern as worker) ───────────

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

// ── Tables in deletion order (children first) ────────────────────────

const TABLES = [
    'activity_log',
    'decisions',
    'action_items',
    'transcript_chunks',
    'processing_log',
    'transcripts',
] as const;

type TableName = (typeof TABLES)[number];

// ── Helpers ──────────────────────────────────────────────────────────

async function getRowCount(
    supabase: ReturnType<typeof getSupabase>,
    table: TableName,
): Promise<number> {
    const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });

    if (error) {
        console.error(`  ⚠️  Could not count ${table}: ${error.message}`);
        return -1;
    }

    return count ?? 0;
}

async function deleteAll(
    supabase: ReturnType<typeof getSupabase>,
    table: TableName,
): Promise<number> {
    // Supabase requires a filter for delete — use a truthy condition on 'id'
    // to match all rows. Some tables use 'id', all have at least one column.
    const { count, error } = await supabase
        .from(table)
        .delete({ count: 'exact' })
        .gte('id', '00000000-0000-0000-0000-000000000000');

    if (error) {
        throw new Error(`Failed to delete from ${table}: ${error.message}`);
    }

    return count ?? 0;
}

// ── Main ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    const confirm = process.argv.includes('--confirm');
    const supabase = getSupabase();

    console.log(`\n🔄 MeetScript Dev Reset${confirm ? '' : ' (DRY RUN)'}`);
    console.log('─'.repeat(50));

    // Phase 1: Collect current row counts
    const counts: Record<string, number> = {};

    for (const table of TABLES) {
        counts[table] = await getRowCount(supabase, table);
        const pad = table.padEnd(20);
        console.log(`  ${pad} ${counts[table]} rows`);
    }

    console.log('─'.repeat(50));

    if (!confirm) {
        console.log('  ℹ️  This was a dry run. No data was deleted.');
        console.log('  ➡️  Run with --confirm to delete all rows.\n');
        return;
    }

    // Phase 2: Delete in order
    console.log('\n🗑️  Deleting all rows...\n');

    const deleted: Record<string, number> = {};

    for (const table of TABLES) {
        try {
            deleted[table] = await deleteAll(supabase, table);
            console.log(`  ✓ ${table.padEnd(20)} ${deleted[table]} rows deleted`);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`  ✗ ${table.padEnd(20)} ${msg}`);
            deleted[table] = 0;
        }
    }

    // Phase 3: Summary
    console.log('\n' + '─'.repeat(50));
    console.log(
        `  Dev reset complete. Deleted ` +
        `${deleted.transcripts ?? 0} transcripts, ` +
        `${deleted.transcript_chunks ?? 0} chunks, ` +
        `${deleted.action_items ?? 0} action items, ` +
        `${deleted.decisions ?? 0} decisions.`,
    );
    console.log('');
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
