/**
 * WhatsApp Export Parser — accepts WhatsApp's native `.txt` export format,
 * parses it into messages, groups them into sessions, compiles a transcript,
 * and pushes it through the standard transcript pipeline.
 *
 * POST /api/upload/whatsapp-export
 * Content-Type: multipart/form-data
 * Body: { file: File (.txt), title?: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { processUpload } from '../../../../lib/upload-pipeline';
import { autoExtractActionItems } from '../../../../lib/auto-extract';
import { autoExtractDecisions } from '../../../../lib/auto-extract-decisions';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

// ── WhatsApp export line patterns ───────────────────────────────────

// Format: [MM/DD/YY, HH:MM:SS] Sender Name: message text
// Also handles: [DD/MM/YY, HH:MM:SS], [M/D/YY, H:MM:SS AM/PM], etc.
const LINE_PATTERN = /^\[?(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)\]?\s*[-–]\s*(.+?):\s*(.+)$/i;

// System messages to skip (WhatsApp service notices)
const SYSTEM_MESSAGES = [
    'Messages and calls are end-to-end encrypted',
    'created group',
    'added you',
    'changed the subject',
    'changed the group icon',
    'changed this group',
    'left',
    'removed',
    'joined using this group',
    'security code changed',
];

interface ParsedMessage {
    timestamp: Date;
    sender: string;
    text: string;
}

// ── Parsing logic ───────────────────────────────────────────────────

/**
 * Parse a WhatsApp export `.txt` file into an array of messages.
 * Handles multi-line messages by accumulating lines that don't match
 * the timestamp pattern into the previous message.
 */
function parseWhatsAppExport(rawText: string): ParsedMessage[] {
    const lines = rawText.split('\n');
    const messages: ParsedMessage[] = [];

    for (const line of lines) {
        const match = LINE_PATTERN.exec(line.trim());
        if (match) {
            const [, date, time, sender, text] = match;

            // Skip system messages
            if (SYSTEM_MESSAGES.some((sys) => text.toLowerCase().includes(sys.toLowerCase()))) {
                continue;
            }

            // Skip media-only messages with no text
            if (text === '<Media omitted>' || text === 'image omitted') {
                continue;
            }

            // Parse the date — try multiple formats
            const timestamp = parseFlexibleDate(date, time);
            if (!timestamp) continue;

            messages.push({ timestamp, sender: sender.trim(), text: text.trim() });
        } else if (messages.length > 0 && line.trim()) {
            // Multi-line message — append to previous message's text
            messages[messages.length - 1].text += '\n' + line.trim();
        }
    }

    return messages;
}

/**
 * Parse flexible date/time formats from WhatsApp exports.
 * Handles US (MM/DD/YY) and EU (DD/MM/YY) date formats.
 */
function parseFlexibleDate(dateStr: string, timeStr: string): Date | null {
    try {
        const combined = `${dateStr} ${timeStr}`;
        const parsed = new Date(combined);
        if (!isNaN(parsed.getTime())) return parsed;

        // Try manual parsing: MM/DD/YY or DD/MM/YY
        const parts = dateStr.split('/').map(Number);
        if (parts.length === 3) {
            const [a, b, c] = parts;
            const year = c < 100 ? 2000 + c : c;
            // Heuristic: if first number > 12, it's DD/MM/YY
            const month = a > 12 ? b : a;
            const day = a > 12 ? a : b;
            const timeParts = timeStr.replace(/\s*[AP]M/i, '').split(':').map(Number);
            let hours = timeParts[0] ?? 0;
            if (/PM/i.test(timeStr) && hours < 12) hours += 12;
            if (/AM/i.test(timeStr) && hours === 12) hours = 0;
            const minutes = timeParts[1] ?? 0;
            const seconds = timeParts[2] ?? 0;

            return new Date(year, month - 1, day, hours, minutes, seconds);
        }
    } catch {
        // Fall through
    }
    return null;
}

/**
 * Compile parsed messages into a formatted transcript string.
 */
function compileTranscript(messages: ParsedMessage[], groupName: string): string {
    const participants = [...new Set(messages.map((m) => m.sender))].sort();
    const firstDate = messages[0]?.timestamp;

    const lines: string[] = [
        `WhatsApp Group: ${groupName}`,
        `Date: ${firstDate?.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) ?? 'Unknown'}`,
        `Participants: ${participants.join(', ')}`,
        `Messages: ${messages.length}`,
        '',
    ];

    for (const msg of messages) {
        const time = msg.timestamp.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        });
        lines.push(`[${time}] ${msg.sender}: ${msg.text}`);
    }

    return lines.join('\n');
}

// ── API route handler ───────────────────────────────────────────────

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('file');
        const titleOverride = formData.get('title') as string | null;

        if (!file || !(file instanceof File)) {
            return NextResponse.json({ error: 'File is required' }, { status: 400 });
        }

        const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
        if (ext !== '.txt') {
            return NextResponse.json(
                { error: 'Only .txt WhatsApp exports are supported' },
                { status: 400 },
            );
        }

        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json({ error: 'File exceeds 10 MB limit' }, { status: 400 });
        }

        const rawText = await file.text();
        const messages = parseWhatsAppExport(rawText);

        if (messages.length === 0) {
            return NextResponse.json(
                { error: 'Could not parse any messages from this file. Is it a valid WhatsApp export?' },
                { status: 400 },
            );
        }

        // Derive group name from filename or user override
        const groupName = titleOverride?.trim()
            || file.name.replace(/\.txt$/i, '').replace(/WhatsApp Chat with /i, '').trim()
            || 'WhatsApp Import';

        const compiledText = compileTranscript(messages, groupName);
        const wordCount = compiledText.split(/\s+/).filter(Boolean).length;

        const title = `WhatsApp: ${groupName}`;
        const date = messages[0]?.timestamp ?? new Date();

        const transcript = await processUpload({
            text: compiledText,
            title,
            date,
            extractionMethod: 'whatsapp',
        });

        // Fire-and-forget: auto-extract action items AND decisions
        autoExtractActionItems(transcript.transcript_id).catch(() => { });
        autoExtractDecisions(transcript.transcript_id).catch(() => { });

        return NextResponse.json(
            {
                transcript,
                messageCount: messages.length,
                participants: [...new Set(messages.map((m) => m.sender))],
            },
            { status: 201 },
        );
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[whatsapp-export] Import failed:', message);
        return NextResponse.json(
            { error: `Failed to import WhatsApp export: ${message}` },
            { status: 500 },
        );
    }
}
