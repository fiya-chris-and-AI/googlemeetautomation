import { describe, it, expect } from 'vitest';
import {
    extractMeetingTitle,
    extractParticipants,
    generateTranscriptId,
    extractMeetingDate,
} from '../extraction/normalize.js';

describe('extractMeetingTitle', () => {
    it('extracts title from "Notes from" pattern', () => {
        expect(extractMeetingTitle('Notes from "Weekly Standup"')).toBe('Weekly Standup');
    });

    it('extracts title from "Transcript for" pattern', () => {
        expect(extractMeetingTitle('Transcript for Sprint Review')).toBe('Sprint Review');
    });

    it('extracts title from "Meeting transcript:" pattern', () => {
        expect(extractMeetingTitle('Meeting transcript: All Hands Q4')).toBe('All Hands Q4');
    });

    it('falls back to raw subject for unknown patterns', () => {
        expect(extractMeetingTitle('Some other email')).toBe('Some other email');
    });

    // meetings-noreply@google.com patterns
    it('extracts title from "Meeting notes:" pattern', () => {
        expect(extractMeetingTitle('Meeting notes: Sprint Demo')).toBe('Sprint Demo');
    });

    it('extracts title from "Meeting summary:" pattern', () => {
        expect(extractMeetingTitle('Meeting summary: Q1 Review')).toBe('Q1 Review');
    });

    it('extracts title from "Post-call notes:" pattern', () => {
        expect(extractMeetingTitle('Post-call notes: Client Call')).toBe('Client Call');
    });
});

describe('extractParticipants', () => {
    it('extracts unique speaker names from transcript', () => {
        const text = [
            'Alice Johnson: Hello everyone.',
            'Bob Smith: Hi Alice.',
            'Alice Johnson: Let us begin.',
        ].join('\n');

        const participants = extractParticipants(text);
        expect(participants).toContain('Alice Johnson');
        expect(participants).toContain('Bob Smith');
        expect(participants).toHaveLength(2);
    });

    it('returns empty array when no speakers found', () => {
        expect(extractParticipants('Just some plain text.')).toEqual([]);
    });

    it('sorts participants alphabetically', () => {
        const text = 'Zara: Hi.\nAlice: Hey.';
        const participants = extractParticipants(text);
        expect(participants[0]).toBe('Alice');
        expect(participants[1]).toBe('Zara');
    });
});

describe('generateTranscriptId', () => {
    it('creates a slugified ID with date prefix', () => {
        const id = generateTranscriptId('Weekly Standup', new Date('2024-03-15'));
        expect(id).toBe('2024-03-15_weekly-standup');
    });

    it('handles special characters in title', () => {
        const id = generateTranscriptId('Q4 Planning & Review!', new Date('2024-12-01'));
        expect(id).toBe('2024-12-01_q4-planning-and-review');
    });
});

describe('extractMeetingDate', () => {
    it('parses Gmail epoch milliseconds', () => {
        const date = extractMeetingDate('1700000000000');
        expect(date.getFullYear()).toBe(2023);
    });

    it('falls back to current date for null input', () => {
        const before = Date.now();
        const date = extractMeetingDate(null);
        const after = Date.now();
        expect(date.getTime()).toBeGreaterThanOrEqual(before);
        expect(date.getTime()).toBeLessThanOrEqual(after);
    });
});
