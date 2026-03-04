#!/usr/bin/env node
/**
 * Batch import Loom transcripts into the pipeline.
 *
 * Usage:
 *   node scripts/import-loom-transcripts.mjs              # Full import
 *   node scripts/import-loom-transcripts.mjs --dry-run    # Preview only
 *
 * Reads all .txt files from loom_transcripts_chris_lutfiya/,
 * parses their headers, and POSTs each to /api/import-loom.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const TRANSCRIPT_DIR = join(PROJECT_ROOT, 'loom_transcripts_chris_lutfiya');
const API_BASE = 'http://localhost:3000';
const DELAY_MS = 2000; // pause between requests (embedding generation is slow)

const dryRun = process.argv.includes('--dry-run');

// ── Parse transcript header ──────────────────────────────────────────

function parseTranscriptFile(filepath) {
    const content = readFileSync(filepath, 'utf-8');
    const lines = content.split('\n');

    const header = {};
    for (const line of lines) {
        const m = (key) => {
            const match = line.match(new RegExp(`^${key}:\\s+(.+)`));
            return match ? match[1].trim() : null;
        };
        if (m('Title')) header.title = m('Title');
        if (m('Video ID')) header.videoId = m('Video ID');
        if (m('Date')) header.date = m('Date');
        if (m('Duration')) header.duration = m('Duration');
        // Stop after the second separator (end of header)
        if (line.startsWith('=========') && header.title) break;
    }

    // Extract the body between the two separator lines
    const parts = content.split('==========================================================');
    // parts[0] = empty, parts[1] = header, parts[2] = body, parts[3] = "END OF TRANSCRIPT"
    const body = parts.length >= 3 ? parts[2].trim() : '';

    return { ...header, body, fullText: content };
}

// ── Resolve the meeting date ─────────────────────────────────────────

function resolveDate(header) {
    // Priority 1: explicit date from header (if not "Unknown")
    if (header.date && header.date !== 'Unknown') {
        const d = new Date(header.date);
        if (!isNaN(d.getTime())) return d.toISOString();
    }

    // Priority 2: date from title (e.g. "2026_01_26 08_39 CST")
    const titleMatch = header.title?.match(/(\d{4})_(\d{2})_(\d{2})\s*(\d{2})_(\d{2})/);
    if (titleMatch) {
        const [, y, mo, d, h, mi] = titleMatch;
        return new Date(`${y}-${mo}-${d}T${h}:${mi}:00`).toISOString();
    }

    // Priority 3: date from filename-style title
    const filenameMatch = header.title?.match(/(\d{4})[_-](\d{2})[_-](\d{2})/);
    if (filenameMatch) {
        const [, y, mo, d] = filenameMatch;
        return new Date(`${y}-${mo}-${d}T12:00:00`).toISOString();
    }

    return null; // will default to today
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
    const files = readdirSync(TRANSCRIPT_DIR)
        .filter(f => f.endsWith('.txt'))
        .sort();

    console.log(`\n🎬 Loom Transcript Import${dryRun ? ' (DRY RUN)' : ''}`);
    console.log(`   Source: ${TRANSCRIPT_DIR}`);
    console.log(`   Files:  ${files.length}`);
    console.log(`   Target: ${API_BASE}/api/import-loom`);
    console.log('');

    const results = { imported: 0, skipped: 0, failed: 0, errors: [] };

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const filepath = join(TRANSCRIPT_DIR, file);
        const progress = `[${i + 1}/${files.length}]`;

        try {
            const parsed = parseTranscriptFile(filepath);

            if (!parsed.body || parsed.body.length < 10) {
                console.log(`${progress} ⚠️  ${file} — skipping (empty/too short)`);
                results.skipped++;
                continue;
            }

            const date = resolveDate(parsed);
            const url = `${API_BASE}/api/import-loom${dryRun ? '?dryRun=true' : ''}`;

            const resp = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: parsed.body,
                    title: parsed.title || file.replace('.txt', ''),
                    date,
                    videoId: parsed.videoId,
                }),
            });

            const data = await resp.json();

            if (data.error) {
                console.log(`${progress} ❌ ${file} — ${data.error}`);
                results.failed++;
                results.errors.push({ file, error: data.error });
            } else if (data.skipped) {
                console.log(`${progress} ⏭️  ${file} — duplicate (${data.transcript_id})`);
                results.skipped++;
            } else if (data.dryRun) {
                console.log(`${progress} 🔍 ${file} — would import as "${data.transcript_id}" (${data.word_count} words)`);
                results.imported++;
            } else {
                console.log(`${progress} ✅ ${file} — imported as "${data.transcript?.transcript_id}" (${data.transcript?.word_count} words)`);
                results.imported++;
            }
        } catch (e) {
            console.log(`${progress} ❌ ${file} — ${e.message}`);
            results.failed++;
            results.errors.push({ file, error: e.message });
        }

        // Delay between requests to avoid overwhelming the embedding API
        if (i < files.length - 1 && !dryRun) {
            await new Promise(r => setTimeout(r, DELAY_MS));
        }
    }

    console.log(`\n--- Summary ---`);
    console.log(`${dryRun ? 'Would import' : 'Imported'}:  ${results.imported}`);
    console.log(`Skipped:     ${results.skipped}`);
    console.log(`Failed:      ${results.failed}`);

    if (results.errors.length > 0) {
        console.log(`\nErrors:`);
        results.errors.forEach(e => console.log(`  - ${e.file}: ${e.error}`));
    }

    console.log('');
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
