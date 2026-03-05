import slugify from 'slugify';
import type { MeetingTranscript, ExtractionMethod } from '@meet-pipeline/shared';

/**
 * Regex patterns to extract a meeting title from common email subjects.
 * Strips the prefix to get just the meeting name.
 */
const SUBJECT_PATTERNS: RegExp[] = [
    // gemini-notes@google.com patterns
    /^Notes from\s+"?(.+?)"?\s*$/i,
    /^Transcript for\s+"?(.+?)"?\s*$/i,
    /^Meeting transcript:?\s*"?(.+?)"?\s*$/i,

    // meetings-noreply@google.com patterns
    // TODO: confirm exact subject patterns from real emails
    /^Meeting notes:?\s*"?(.+?)"?\s*$/i,
    /^Meeting summary:?\s*"?(.+?)"?\s*$/i,
    /^Post-call notes:?\s*"?(.+?)"?\s*$/i,
];

/**
 * Extract a clean meeting title from the email subject line.
 * Falls back to the raw subject if no pattern matches.
 */
export function extractMeetingTitle(subject: string): string {
    for (const pattern of SUBJECT_PATTERNS) {
        const match = pattern.exec(subject);
        if (match?.[1]) {
            return match[1].trim();
        }
    }
    return subject.trim();
}

/**
 * Parse unique speaker names from the transcript text.
 * Looks for lines starting with "Speaker Name:" or "Speaker Name -".
 */
export function extractParticipants(text: string): string[] {
    const speakers = new Set<string>();
    const lines = text.split('\n');

    for (const line of lines) {
        // Match patterns like "John Doe: some text" or "John Doe - some text"
        const match = /^([A-Z][a-zA-Z' .-]+?)[\s]*[:–—-]\s+\S/.exec(line.trim());
        if (match?.[1]) {
            const name = match[1].trim();
            // Filter out obvious non-names (very short or very long)
            if (name.length >= 2 && name.length <= 50) {
                speakers.add(name);
            }
        }
    }

    return Array.from(speakers).sort();
}

/**
 * Generate the canonical transcript ID: YYYY-MM-DD_meeting-title-slug
 */
export function generateTranscriptId(title: string, date: Date): string {
    const dateStr = date.toISOString().split('T')[0];
    const slug = slugify(title, { lower: true, strict: true, replacement: '-' });
    return `${dateStr}_${slug}`;
}

/**
 * Try to extract a meeting date from the email headers or subject.
 * Falls back to "now" if nothing is parseable.
 */
export function extractMeetingDate(internalDate?: string | null): Date {
    if (internalDate) {
        // Gmail internalDate is epoch milliseconds as a string
        const ms = parseInt(internalDate, 10);
        if (!isNaN(ms)) return new Date(ms);
    }
    return new Date();
}

/**
 * Build the canonical MeetingTranscript object from extracted data.
 */
export function normalizeTranscript(params: {
    emailId: string;
    subject: string;
    internalDate: string | null | undefined;
    rawText: string;
    extractionMethod: ExtractionMethod;
}): MeetingTranscript {
    const title = extractMeetingTitle(params.subject);
    const date = extractMeetingDate(params.internalDate);
    const participants = extractParticipants(params.rawText);
    const wordCount = params.rawText.split(/\s+/).filter(Boolean).length;

    return {
        transcript_id: generateTranscriptId(title, date),
        meeting_title: title,
        meeting_date: date.toISOString(),
        participants,
        raw_transcript: params.rawText,
        source_email_id: params.emailId,
        extraction_method: params.extractionMethod,
        word_count: wordCount,
        processed_at: new Date().toISOString(),
    };
}
