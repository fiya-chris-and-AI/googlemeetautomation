/**
 * Subject patterns that indicate a Google Meet transcript email.
 * These are the known formats Google uses.
 */
const TRANSCRIPT_SUBJECT_PATTERNS: RegExp[] = [
    /^Notes: /i,
    /^Notes from /i,
    /^Transcript for /i,
    /^Meeting transcript/i,
];

const TRANSCRIPT_SENDER = 'gemini-notes@google.com';

/**
 * Determines whether an email is a Google Meet transcript.
 * Checks the sender and subject line against known patterns.
 */
export function isTranscriptEmail(from: string, subject: string): boolean {
    const senderMatch = from.toLowerCase().includes(TRANSCRIPT_SENDER);
    const subjectMatch = TRANSCRIPT_SUBJECT_PATTERNS.some((p) => p.test(subject));
    return senderMatch && subjectMatch;
}
