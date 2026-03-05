#!/usr/bin/env node
/**
 * Backfill action items for all existing transcripts.
 *
 * Calls POST /api/action-items/extract-all which processes
 * all unprocessed transcripts sequentially with deduplication.
 *
 * Usage:
 *   node scripts/backfill-action-items.mjs
 */

const API_BASE = 'http://localhost:3000';

async function main() {
    console.log('\n🔍 Backfilling action items from all unprocessed transcripts...');
    console.log(`   Target: ${API_BASE}/api/action-items/extract-all`);
    console.log('   This may take several minutes (Claude processes each transcript).\n');

    const start = Date.now();

    const resp = await fetch(`${API_BASE}/api/action-items/extract-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
    });

    const data = await resp.json();
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    if (data.error) {
        console.error(`❌ Error: ${data.error}`);
        process.exit(1);
    }

    console.log(`--- Results (${elapsed}s) ---`);
    console.log(`Transcripts processed:       ${data.transcripts_processed}`);
    console.log(`Transcripts skipped:         ${data.transcripts_skipped}`);
    console.log(`Transcripts empty (no items): ${data.transcripts_empty}`);
    console.log(`Transcripts failed:          ${data.transcripts_failed}`);
    console.log(`Action items extracted:      ${data.items_extracted}`);
    console.log(`Items flagged as duplicate:  ${data.items_flagged_duplicate}`);
    console.log('');
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
