import { describe, it, expect } from 'vitest';
import { isTranscriptEmail } from '../gmail/filters.js';

describe('isTranscriptEmail', () => {
    const SENDER = 'gemini-notes@google.com';

    it('matches "Notes from" subject', () => {
        expect(isTranscriptEmail(SENDER, 'Notes from "Weekly Standup"')).toBe(true);
    });

    it('matches "Transcript for" subject', () => {
        expect(isTranscriptEmail(SENDER, 'Transcript for Sprint Review')).toBe(true);
    });

    it('matches "Meeting transcript" subject', () => {
        expect(isTranscriptEmail(SENDER, 'Meeting transcript: All Hands')).toBe(true);
    });

    it('is case-insensitive on sender', () => {
        expect(isTranscriptEmail('Gemini-Notes@Google.com', 'Notes from Team Sync')).toBe(true);
    });

    it('rejects wrong sender', () => {
        expect(isTranscriptEmail('someone@example.com', 'Notes from Team Sync')).toBe(false);
    });

    it('rejects wrong subject pattern', () => {
        expect(isTranscriptEmail(SENDER, 'Meeting invite: Standup')).toBe(false);
        expect(isTranscriptEmail(SENDER, 'Action items from meeting')).toBe(false);
    });

    it('handles sender with display name', () => {
        expect(isTranscriptEmail('"Google Meet" <gemini-notes@google.com>', 'Notes from Demo')).toBe(true);
    });
});
