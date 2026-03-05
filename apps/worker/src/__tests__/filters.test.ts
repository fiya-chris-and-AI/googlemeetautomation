import { describe, it, expect } from 'vitest';
import { isTranscriptEmail } from '../gmail/filters.js';

describe('isTranscriptEmail', () => {
    const GEMINI_SENDER = 'gemini-notes@google.com';
    const MEETINGS_SENDER = 'meetings-noreply@google.com';

    // ── gemini-notes@google.com (existing behavior) ──

    it('matches "Notes from" subject with gemini-notes sender', () => {
        expect(isTranscriptEmail(GEMINI_SENDER, 'Notes from "Weekly Standup"')).toBe(true);
    });

    it('matches "Transcript for" subject with gemini-notes sender', () => {
        expect(isTranscriptEmail(GEMINI_SENDER, 'Transcript for Sprint Review')).toBe(true);
    });

    it('matches "Meeting transcript" subject with gemini-notes sender', () => {
        expect(isTranscriptEmail(GEMINI_SENDER, 'Meeting transcript: All Hands')).toBe(true);
    });

    it('is case-insensitive on sender', () => {
        expect(isTranscriptEmail('Gemini-Notes@Google.com', 'Notes from Team Sync')).toBe(true);
    });

    it('handles sender with display name', () => {
        expect(isTranscriptEmail('"Google Meet" <gemini-notes@google.com>', 'Notes from Demo')).toBe(true);
    });

    // ── meetings-noreply@google.com (new sender) ──

    it('matches meetings-noreply sender with "Meeting notes" subject', () => {
        expect(isTranscriptEmail(MEETINGS_SENDER, 'Meeting notes: Sprint Demo')).toBe(true);
    });

    it('matches meetings-noreply sender with "Meeting summary" subject', () => {
        expect(isTranscriptEmail(MEETINGS_SENDER, 'Meeting summary: Q1 Review')).toBe(true);
    });

    it('matches meetings-noreply sender with "Post-call notes" subject', () => {
        expect(isTranscriptEmail(MEETINGS_SENDER, 'Post-call notes: Client Call')).toBe(true);
    });

    it('matches meetings-noreply sender with existing gemini-notes subject patterns', () => {
        expect(isTranscriptEmail(MEETINGS_SENDER, 'Notes from "Team Standup"')).toBe(true);
        expect(isTranscriptEmail(MEETINGS_SENDER, 'Transcript for Design Review')).toBe(true);
    });

    it('handles display name for meetings-noreply sender', () => {
        expect(
            isTranscriptEmail('"Google Meet" <meetings-noreply@google.com>', 'Meeting notes: Sync')
        ).toBe(true);
    });

    // ── Rejection cases ──

    it('rejects wrong sender', () => {
        expect(isTranscriptEmail('someone@example.com', 'Notes from Team Sync')).toBe(false);
    });

    it('rejects wrong subject pattern with gemini-notes sender', () => {
        expect(isTranscriptEmail(GEMINI_SENDER, 'Meeting invite: Standup')).toBe(false);
        expect(isTranscriptEmail(GEMINI_SENDER, 'Action items from meeting')).toBe(false);
    });

    it('rejects wrong subject pattern with meetings-noreply sender', () => {
        expect(isTranscriptEmail(MEETINGS_SENDER, 'Your meeting is starting')).toBe(false);
        expect(isTranscriptEmail(MEETINGS_SENDER, 'Calendar invite: Standup')).toBe(false);
    });
});
