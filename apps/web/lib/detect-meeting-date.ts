import { parse } from 'date-fns/parse';
import { isValid } from 'date-fns/isValid';

/**
 * Scan the first ~2 000 characters of transcript text for a meeting date.
 *
 * Priority order:
 *  1. "Date: <value>" or "Meeting Date: <value>"
 *  2. "Meeting — <date>" / "Meeting - <date>"
 *  3. ISO-8601 on its own line (YYYY-MM-DD)
 *  4. US format MM/DD/YYYY
 *  5. Long-form: "March 4, 2025", "4 March 2025", "Mar 4, 2025"
 *  6. ISO-8601 timestamp (YYYY-MM-DDThh:mm:ss)
 *
 * Returns the first valid Date found, or null.
 */
export function detectMeetingDate(text: string): Date | null {
    const header = text.slice(0, 2000);

    // Each entry: [regex, date-fns format string(s) to try]
    const patterns: Array<{ regex: RegExp; formats: string[] }> = [
        // "Date: March 4, 2025" / "Meeting Date: 2025-03-04" / "Date: 03/04/2025"
        {
            regex: /(?:meeting\s+)?date\s*:\s*(.+)/i,
            formats: [
                'yyyy-MM-dd',
                'MM/dd/yyyy',
                'M/d/yyyy',
                'MMMM d, yyyy',
                'MMMM dd, yyyy',
                'MMM d, yyyy',
                'MMM dd, yyyy',
                'd MMMM yyyy',
                'dd MMMM yyyy',
            ],
        },
        // "Meeting — March 4, 2025" or "Meeting - March 4, 2025"
        {
            regex: /meeting\s*[—–\-]\s*(.+)/i,
            formats: [
                'MMMM d, yyyy',
                'MMMM dd, yyyy',
                'MMM d, yyyy',
                'MMM dd, yyyy',
                'd MMMM yyyy',
                'dd MMMM yyyy',
                'yyyy-MM-dd',
                'MM/dd/yyyy',
            ],
        },
        // ISO-8601 date standalone on a line
        {
            regex: /^(\d{4}-\d{2}-\d{2})$/m,
            formats: ['yyyy-MM-dd'],
        },
        // US format MM/DD/YYYY standalone
        {
            regex: /\b(\d{1,2}\/\d{1,2}\/\d{4})\b/,
            formats: ['MM/dd/yyyy', 'M/d/yyyy'],
        },
        // Long-form dates anywhere in text
        {
            regex: /\b((?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4})\b/i,
            formats: ['MMMM d, yyyy', 'MMMM dd, yyyy', 'MMM d, yyyy', 'MMM dd, yyyy', 'MMMM d yyyy', 'MMM d yyyy'],
        },
        // "4 March 2025" (day-first long form)
        {
            regex: /\b(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4})\b/i,
            formats: ['d MMMM yyyy', 'dd MMMM yyyy', 'd MMM yyyy', 'dd MMM yyyy'],
        },
        // ISO-8601 timestamp 2025-03-04T10:30:00
        {
            regex: /\b(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}/,
            formats: ['yyyy-MM-dd'],
        },
    ];

    for (const { regex, formats } of patterns) {
        const match = header.match(regex);
        if (!match) continue;

        const candidate = match[1].trim();
        for (const fmt of formats) {
            const parsed = parse(candidate, fmt, new Date());
            if (isValid(parsed) && parsed.getFullYear() > 1999 && parsed.getFullYear() < 2100) {
                return parsed;
            }
        }
    }

    return null;
}
