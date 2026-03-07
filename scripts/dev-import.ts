#!/usr/bin/env tsx
/**
 * Dev Import — Import 1–N Loom transcripts for testing/development.
 *
 * Usage:
 *   npx tsx scripts/dev-import.ts <file1.txt> [file2.txt]         # Import specific files
 *   npx tsx scripts/dev-import.ts --pick 3                        # Random 3 from loom dir
 *   npx tsx scripts/dev-import.ts --dry-run <file>                # Preview without writing
 *   npx tsx scripts/dev-import.ts --skip-extraction <file>        # Skip Claude extraction
 *
 * Requires: apps/web running on port 3000 (calls /api/import-loom)
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const TRANSCRIPT_DIR = join(PROJECT_ROOT, 'loom_transcripts_chris_lutfiya');
const API_BASE = 'http://localhost:3000';
const DELAY_MS = 2000;

// ── CLI argument parsing ─────────────────────────────────────────────

function parseArgs() {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    const skipExtraction = args.includes('--skip-extraction');

    // Parse --pick N
    const pickIdx = args.indexOf('--pick');
    const pickCount = pickIdx !== -1 ? parseInt(args[pickIdx + 1], 10) : 0;

    // Collect file paths (any arg not starting with --)
    const files = args.filter(
        (a, i) => !a.startsWith('--') && (i === 0 || args[i - 1] !== '--pick'),
    );

    return { dryRun, skipExtraction, pickCount, files };
}

// ── Loom transcript header parser ────────────────────────────────────
// (Copied from the archived import-loom-transcripts.mjs — pure functions)

interface ParsedTranscript {
    title?: string;
    videoId?: string;
    date?: string;
    duration?: string;
    body: string;
    fullText: string;
}

function parseTranscriptFile(filepath: string): ParsedTranscript {
    const content = readFileSync(filepath, 'utf-8');
    const lines = content.split('\n');

    const header: Partial<Pick<ParsedTranscript, 'title' | 'videoId' | 'date' | 'duration'>> = {};
    for (const line of lines) {
        const m = (key: string) => {
            const match = line.match(new RegExp(`^${key}:\\s+(.+)`));
            return match ? match[1].trim() : null;
        };
        if (m('Title')) header.title = m('Title')!;
        if (m('Video ID')) header.videoId = m('Video ID')!;
        if (m('Date')) header.date = m('Date')!;
        if (m('Duration')) header.duration = m('Duration')!;
        // Stop after the second separator (end of header)
        if (line.startsWith('=========') && header.title) break;
    }

    // Extract the body between the two separator lines
    const parts = content.split('==========================================================');
    const body = parts.length >= 3 ? parts[2].trim() : '';

    return { ...header, body, fullText: content };
}

function resolveDate(header: ParsedTranscript): string | null {
    // Priority 1: explicit date from header
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

    return null;
}

// ── Pick random files from the loom directory ────────────────────────

function pickRandomFiles(count: number): string[] {
    const allFiles = readdirSync(TRANSCRIPT_DIR)
        .filter((f) => f.endsWith('.txt'))
        .sort();

    if (count >= allFiles.length) return allFiles.map((f) => join(TRANSCRIPT_DIR, f));

    // Fisher-Yates shuffle, take first N
    const shuffled = [...allFiles];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled.slice(0, count).map((f) => join(TRANSCRIPT_DIR, f));
}

// ── Resolve file path relative to project root or TRANSCRIPT_DIR ─────

function resolveFilePath(input: string): string {
    // If already absolute, use as-is
    if (input.startsWith('/')) return input;

    // If it looks like just a filename (no path separators), look in the loom dir
    if (!input.includes('/')) {
        const inLoomDir = join(TRANSCRIPT_DIR, input);
        try {
            readFileSync(inLoomDir);
            return inLoomDir;
        } catch {
            // Fall through to resolve from project root
        }
    }

    return join(PROJECT_ROOT, input);
}

// ── Extract action items + decisions for a transcript ────────────────

async function extractForTranscript(transcriptId: string): Promise<{
    actionItems: number;
    decisions: number;
}> {
    let actionItems = 0;
    let decisions = 0;

    try {
        const aiResp = await fetch(`${API_BASE}/api/action-items/extract`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transcript_id: transcriptId }),
        });
        const aiData = await aiResp.json();
        actionItems = aiData.count ?? aiData.items?.length ?? 0;
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`    ⚠️  Action item extraction failed: ${msg}`);
    }

    try {
        const dResp = await fetch(`${API_BASE}/api/decisions/extract`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transcript_id: transcriptId }),
        });
        const dData = await dResp.json();
        decisions = dData.count ?? dData.decisions?.length ?? 0;
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`    ⚠️  Decision extraction failed: ${msg}`);
    }

    return { actionItems, decisions };
}

// ── Import a single file ─────────────────────────────────────────────

async function importFile(
    filepath: string,
    index: number,
    total: number,
    opts: { dryRun: boolean; skipExtraction: boolean },
): Promise<'imported' | 'skipped' | 'failed'> {
    const progress = `[${index + 1}/${total}]`;
    const filename = basename(filepath);

    try {
        const parsed = parseTranscriptFile(filepath);

        if (!parsed.body || parsed.body.length < 10) {
            console.log(`${progress} ⚠️  ${filename} — skipping (empty/too short)`);
            return 'skipped';
        }

        const date = resolveDate(parsed);
        const url = `${API_BASE}/api/import-loom${opts.dryRun ? '?dryRun=true' : ''}`;

        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: parsed.body,
                title: parsed.title || filename.replace('.txt', ''),
                date,
                videoId: parsed.videoId,
            }),
        });

        const data = await resp.json();
        const wordCount = parsed.body.split(/\s+/).filter(Boolean).length;

        if (data.error) {
            console.log(`${progress} ❌ ${filename} — ${data.error}`);
            return 'failed';
        }

        if (data.skipped) {
            console.log(
                `${progress} ⏭️  ${filename} — duplicate (${data.transcript_id})`,
            );
            return 'skipped';
        }

        if (data.dryRun) {
            console.log(
                `${progress} 🔍 ${filename} — would import as "${data.transcript_id}" (${wordCount} words)`,
            );
            return 'imported';
        }

        // Successfully imported — extract action items + decisions
        const transcriptId = data.transcript?.id ?? data.transcript?.transcript_id;
        const chunkCount = data.transcript?.chunk_count ?? '?';

        if (!opts.skipExtraction && transcriptId) {
            const { actionItems, decisions } = await extractForTranscript(transcriptId);
            console.log(
                `${progress} ✓ imported "${parsed.title}" (${wordCount} words, ${chunkCount} chunks, ${actionItems} action items, ${decisions} decisions)`,
            );
        } else {
            console.log(
                `${progress} ✓ imported "${parsed.title}" (${wordCount} words, ${chunkCount} chunks)`,
            );
        }

        return 'imported';
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`${progress} ❌ ${filename} — ${msg}`);
        return 'failed';
    }
}

// ── Main ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    const { dryRun, skipExtraction, pickCount, files } = parseArgs();

    // Resolve the list of files to import
    let filePaths: string[];

    if (pickCount > 0) {
        filePaths = pickRandomFiles(pickCount);
        console.log(`\n🎲 Randomly picked ${filePaths.length} file(s) from ${TRANSCRIPT_DIR}\n`);
    } else if (files.length > 0) {
        filePaths = files.map(resolveFilePath);
    } else {
        console.log(`
Usage:
  npx tsx scripts/dev-import.ts <file1.txt> [file2.txt]
  npx tsx scripts/dev-import.ts --pick 3
  npx tsx scripts/dev-import.ts --dry-run <file>
  npx tsx scripts/dev-import.ts --skip-extraction <file>
`);
        process.exit(1);
    }

    console.log(`📥 Dev Import${dryRun ? ' (DRY RUN)' : ''}${skipExtraction ? ' (skip extraction)' : ''}`);
    console.log(`   Files:  ${filePaths.length}`);
    console.log(`   Target: ${API_BASE}/api/import-loom\n`);

    const results = { imported: 0, skipped: 0, failed: 0 };

    for (let i = 0; i < filePaths.length; i++) {
        const result = await importFile(filePaths[i], i, filePaths.length, {
            dryRun,
            skipExtraction,
        });

        results[result]++;

        // Delay between imports to respect rate limits
        if (i < filePaths.length - 1 && !dryRun) {
            await new Promise((r) => setTimeout(r, DELAY_MS));
        }
    }

    // Summary
    console.log(`\n--- Summary ---`);
    console.log(`${dryRun ? 'Would import' : 'Imported'}:  ${results.imported}`);
    console.log(`Skipped:     ${results.skipped}`);
    console.log(`Failed:      ${results.failed}\n`);
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
