/**
 * Pure text parsers for VTT and SBV subtitle formats.
 * Separated from attachment.ts to avoid importing Gmail API dependencies,
 * which makes these functions unit-testable without env vars.
 */

/**
 * Strip VTT (WebVTT) formatting cues and timecodes.
 * Preserves speaker names and spoken text.
 *
 * VTT format example:
 *   WEBVTT
 *
 *   00:00:01.000 --> 00:00:05.000
 *   <v Speaker Name>Hello everyone
 *
 * Result: "Speaker Name: Hello everyone"
 */
export function parseVtt(raw: string): string {
    const lines = raw.split('\n');
    const result: string[] = [];

    for (const line of lines) {
        const trimmed = line.trim();

        // Skip the WEBVTT header, blank lines, and NOTE blocks
        if (trimmed === 'WEBVTT' || trimmed === '' || trimmed.startsWith('NOTE')) {
            continue;
        }

        // Skip timecode lines (e.g., "00:00:01.000 --> 00:00:05.000")
        if (/^\d{2}:\d{2}/.test(trimmed) && trimmed.includes('-->')) {
            continue;
        }

        // Skip numeric cue identifiers
        if (/^\d+$/.test(trimmed)) {
            continue;
        }

        // Extract speaker from <v SpeakerName> tags
        const speakerMatch = /<v\s+([^>]+)>(.*)/.exec(trimmed);
        if (speakerMatch) {
            const speaker = speakerMatch[1].trim();
            const text = speakerMatch[2].replace(/<\/v>/g, '').trim();
            result.push(`${speaker}: ${text}`);
        } else {
            // Plain text line — strip any remaining HTML-like tags
            const cleaned = trimmed.replace(/<[^>]+>/g, '').trim();
            if (cleaned) {
                result.push(cleaned);
            }
        }
    }

    return result.join('\n');
}

/**
 * Strip SBV (SubViewer) formatting.
 * SBV has timecodes like "0:00:01.000,0:00:05.000" followed by text.
 */
export function parseSbv(raw: string): string {
    const lines = raw.split('\n');
    const result: string[] = [];

    for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed === '') continue;

        // Skip timecode lines (e.g., "0:00:01.000,0:00:05.000")
        if (/^\d+:\d{2}:\d{2}\.\d{3},\d+:\d{2}:\d{2}\.\d{3}$/.test(trimmed)) {
            continue;
        }

        result.push(trimmed);
    }

    return result.join('\n');
}

/**
 * Regex to extract a Google Doc ID from a URL.
 * Matches patterns like `/document/d/ABC123_-xy/`
 */
const DOC_ID_REGEX = /\/document\/d\/([a-zA-Z0-9_-]+)\//;

/**
 * Looks for a Google Docs link in text and extracts the document ID.
 * Returns null if no link is found.
 */
export function extractDocId(text: string): string | null {
    const match = DOC_ID_REGEX.exec(text);
    return match?.[1] ?? null;
}
