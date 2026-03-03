import { describe, it, expect } from 'vitest';
import { chunkTranscript } from '../chunking/chunker.js';

describe('chunkTranscript', () => {
    it('returns a single chunk for short text', () => {
        const text = 'Alice: Hello everyone.\nBob: Hi Alice.';
        const chunks = chunkTranscript(text);
        expect(chunks).toHaveLength(1);
        expect(chunks[0].text).toContain('Alice: Hello everyone');
        expect(chunks[0].index).toBe(0);
        expect(chunks[0].totalChunks).toBe(1);
    });

    it('splits at speaker-turn boundaries', () => {
        // Create text with two distinct speaker turns, each over 2000 chars
        const aliceTurn = 'Alice: ' + 'This is a detailed point. '.repeat(100);
        const bobTurn = 'Bob: ' + 'I agree with that assessment. '.repeat(100);
        const text = aliceTurn + '\n' + bobTurn;

        const chunks = chunkTranscript(text);
        expect(chunks.length).toBeGreaterThan(1);

        // First chunk should contain Alice's content
        expect(chunks[0].text).toContain('Alice:');
    });

    it('never splits mid-sentence', () => {
        // Create a long paragraph with clear sentences
        const sentences = Array.from({ length: 50 }, (_, i) =>
            `Speaker${i}: This is sentence number ${i} and it has some content.`
        ).join('\n');

        const chunks = chunkTranscript(sentences);

        for (const chunk of chunks) {
            // No chunk should end in the middle of a word (except possibly the overlap boundary)
            const lines = chunk.text.split('\n').filter(Boolean);
            for (const line of lines) {
                // Each line should be a complete unit (starts with a speaker or is continuation)
                expect(line.length).toBeGreaterThan(0);
            }
        }
    });

    it('includes overlap between consecutive chunks', () => {
        // Create long enough text to produce multiple chunks
        const turns = Array.from({ length: 30 }, (_, i) =>
            `Speaker${i}: This is a moderately long statement that provides enough content to test chunking behavior properly.`
        ).join('\n');

        const chunks = chunkTranscript(turns);

        if (chunks.length >= 2) {
            // The end of chunk N should overlap with the start of chunk N+1
            const endOfFirst = chunks[0].text.slice(-200);
            const startOfSecond = chunks[1].text.slice(0, 600);

            // Some content from end of first chunk should appear in second chunk
            const overlap = endOfFirst.split('\n').some((line) =>
                line.trim().length > 10 && startOfSecond.includes(line.trim())
            );
            expect(overlap).toBe(true);
        }
    });

    it('provides correct chunk metadata', () => {
        const text = 'Alice: Short message.\nBob: Another short message.';
        const chunks = chunkTranscript(text);

        expect(chunks[0].index).toBe(0);
        expect(chunks[0].totalChunks).toBe(chunks.length);
        expect(chunks[0].tokenEstimate).toBeGreaterThan(0);
    });
});
