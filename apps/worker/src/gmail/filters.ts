/**
 * Accepted transcript senders — only emails from these addresses are processed.
 * NOTE: Keep in sync with apps/web/lib/gmail.ts (TRANSCRIPT_SENDERS + TRANSCRIPT_SUBJECT_PATTERNS)
 */
const TRANSCRIPT_SENDERS: string[] = [
    'gemini-notes@google.com',
    'meetings-noreply@google.com',
];

/**
 * Subject patterns that indicate a Google Meet transcript email.
 * These are the known formats Google uses across both senders.
 */
const TRANSCRIPT_SUBJECT_PATTERNS: RegExp[] = [
    // gemini-notes@google.com patterns
    /^Notes: /i,
    /^Notes from /i,
    /^Transcript for /i,
    /^Meeting transcript/i,

    // meetings-noreply@google.com patterns
    // TODO: confirm exact subject patterns from real emails
    /^Meeting notes:?\s/i,
    /^Meeting summary:?\s/i,
    /^Post-call notes:?\s/i,
];

/**
 * Determines whether an email is a Google Meet transcript.
 * Checks the sender against the whitelist and the subject against known patterns.
 */
export function isTranscriptEmail(from: string, subject: string): boolean {
    const fromLower = from.toLowerCase();
    const senderMatch = TRANSCRIPT_SENDERS.some((s) => fromLower.includes(s));
    const subjectMatch = TRANSCRIPT_SUBJECT_PATTERNS.some((p) => p.test(subject));
    return senderMatch && subjectMatch;
}
