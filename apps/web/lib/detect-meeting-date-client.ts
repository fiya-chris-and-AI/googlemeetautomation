/**
 * Client-safe date detection wrapper for the upload modal.
 *
 * Re-uses the existing server-side detection functions (they're pure JS,
 * no Node APIs) and adds a File-based async helper that reads content
 * via the browser FileReader API.
 */

import { detectMeetingDate, detectDateFromFilename } from './detect-meeting-date';

/** Format a Date as YYYY-MM-DD for the HTML date input. */
function toDateInputValue(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/** Read the first `maxBytes` of a File as text (browser-safe). */
function readFileHead(file: File, maxBytes = 2000): Promise<string> {
    return new Promise((resolve, reject) => {
        const slice = file.slice(0, maxBytes);
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(slice);
    });
}

/**
 * Detect a meeting date from a File object.
 *
 * Priority:
 *  1. Filename patterns (instant, regex-only)
 *  2. File content patterns (reads first 2 KB)
 *
 * Returns a YYYY-MM-DD string for the date input, or null.
 * PDFs are skipped for content scanning (binary format).
 */
export async function detectDateFromFile(file: File): Promise<string | null> {
    // 1. Try filename first (instant)
    const fromName = detectDateFromFilename(file.name);
    if (fromName) return toDateInputValue(fromName);

    // 2. Try file content (skip PDFs — binary, can't read as text here)
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (ext === '.pdf') return null;

    try {
        const head = await readFileHead(file);
        const fromContent = detectMeetingDate(head);
        if (fromContent) return toDateInputValue(fromContent);
    } catch {
        // Silently ignore read errors — the server cascade will still work
    }

    return null;
}
