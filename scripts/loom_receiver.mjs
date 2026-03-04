/**
 * Local HTTP server that receives transcript data from the browser
 * and writes it to disk as formatted .txt files.
 *
 * POST /save-transcript — expects JSON body with transcript data
 * POST /save-metadata — expects JSON body with video metadata
 * GET  /status        — returns progress
 */
import { createServer } from 'node:http';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const OUTPUT_DIR = join(process.cwd(), 'loom_transcripts_chris_lutfiya');
const PORT = 9877;

if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

// Track progress
const progress = { saved: 0, failed: 0, errors: [] };

/** Convert seconds to [HH:MM:SS] */
function formatTimestamp(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `[${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}]`;
}

/** Sanitize title for filename */
function sanitizeTitle(title) {
    return title
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .toLowerCase()
        .substring(0, 80);
}

/** Format transcript from Loom phrases JSON to pipeline .txt */
function formatTranscript({ videoId, title, date, duration, phrases }) {
    const durationStr = duration ? formatTimestamp(duration / 1000) : 'Unknown';
    const dateStr = date || 'Unknown';
    const now = new Date().toISOString();

    let body = '';
    for (const phrase of phrases) {
        const ts = formatTimestamp(phrase.ts || 0);
        const text = (phrase.value || '').trim();
        if (text) {
            body += `${ts} Speaker:\n${text}\n\n`;
        }
    }

    return `==========================================================
LOOM TRANSCRIPT
Title:    ${title}
Video ID: ${videoId}
URL:      https://www.loom.com/share/${videoId}
Date:     ${dateStr}
Duration: ${durationStr}
Folder:   Chris/Lutfiya
Source:   Loom Workspace → Sciencexperts.ai Pipeline
Extracted: ${now}
==========================================================

${body.trim()}

==========================================================
END OF TRANSCRIPT
`;
}

/** Derive filename from date and title */
function deriveFilename(title, date, videoId) {
    if (date && date !== 'Unknown') {
        const d = new Date(date);
        if (!isNaN(d)) {
            const ymd = d.toISOString().split('T')[0];
            return `${ymd}_${sanitizeTitle(title)}.txt`;
        }
    }
    // Try parsing date from title (e.g., "2026_01_26 08_39 CST")
    const titleDateMatch = title.match(/(\d{4})_(\d{2})_(\d{2})/);
    if (titleDateMatch) {
        const ymd = `${titleDateMatch[1]}-${titleDateMatch[2]}-${titleDateMatch[3]}`;
        return `${ymd}_${sanitizeTitle(title)}.txt`;
    }
    return `loom_${videoId}.txt`;
}

const server = createServer((req, res) => {
    // CORS headers for browser requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.method === 'GET' && req.url === '/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(progress));
        return;
    }

    if (req.method === 'POST' && req.url === '/save-transcript') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const { videoId, title, date, duration, phrases } = data;

                if (!videoId || !phrases) {
                    throw new Error('Missing videoId or phrases');
                }

                const formatted = formatTranscript(data);
                const filename = deriveFilename(title || 'Untitled', date, videoId);
                const filepath = join(OUTPUT_DIR, filename);
                writeFileSync(filepath, formatted, 'utf-8');

                progress.saved++;
                console.log(`✓ Saved: ${filename} (${phrases.length} phrases)`);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, filename }));
            } catch (e) {
                progress.failed++;
                progress.errors.push(e.message);
                console.error(`✗ Error: ${e.message}`);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: e.message }));
            }
        });
        return;
    }

    if (req.method === 'POST' && req.url === '/save-metadata') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const filepath = join(OUTPUT_DIR, '_video_metadata.json');
                writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
                console.log(`✓ Saved metadata for ${data.length || 0} videos`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: e.message }));
            }
        });
        return;
    }

    res.writeHead(404);
    res.end('Not found');
});

server.listen(PORT, () => {
    console.log(`🎬 Loom transcript receiver listening on http://localhost:${PORT}`);
    console.log(`   Output directory: ${OUTPUT_DIR}`);
});
