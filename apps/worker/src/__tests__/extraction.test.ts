import { describe, it, expect } from 'vitest';
import { extractInlineTranscript } from '../extraction/inline.js';
import { parseVtt, parseSbv, extractDocId } from '../extraction/parsers.js';

describe('Inline HTML extraction', () => {
    it('strips HTML tags and preserves speaker names', () => {
        const html = `
      <div>
        <p><b>Alice:</b> Hello everyone, let's get started.</p>
        <p><b>Bob:</b> Sounds good.</p>
      </div>
    `;
        const result = extractInlineTranscript(html);
        expect(result).toContain('Alice:');
        expect(result).toContain('Bob:');
        expect(result).toContain("let's get started");
        expect(result).not.toContain('<p>');
        expect(result).not.toContain('<b>');
    });

    it('handles empty HTML', () => {
        const result = extractInlineTranscript('<div></div>');
        expect(result).toBe('');
    });

    it('preserves timestamps in text', () => {
        const html = '<p>10:30 AM - Alice: Good morning</p>';
        const result = extractInlineTranscript(html);
        expect(result).toContain('10:30 AM');
    });
});

describe('Google Doc ID extraction', () => {
    it('extracts doc ID from a standard URL', () => {
        const url = 'https://docs.google.com/document/d/1aBcDeFgHiJkLmNoPqRsTuVwXyZ/edit';
        expect(extractDocId(url)).toBe('1aBcDeFgHiJkLmNoPqRsTuVwXyZ');
    });

    it('extracts doc ID from a URL with underscores and hyphens', () => {
        const url = 'https://docs.google.com/document/d/abc_123-XYZ/view';
        expect(extractDocId(url)).toBe('abc_123-XYZ');
    });

    it('returns null when no doc link is found', () => {
        expect(extractDocId('No links here')).toBeNull();
        expect(extractDocId('')).toBeNull();
    });
});

describe('VTT parsing', () => {
    it('strips timecodes and extracts speaker-attributed text', () => {
        const vtt = `WEBVTT

1
00:00:01.000 --> 00:00:05.000
<v Alice>Hello everyone

2
00:00:05.500 --> 00:00:10.000
<v Bob>Hi Alice, let's begin`;

        const result = parseVtt(vtt);
        expect(result).toContain('Alice: Hello everyone');
        expect(result).toContain("Bob: Hi Alice, let's begin");
        expect(result).not.toContain('WEBVTT');
        expect(result).not.toContain('-->');
        expect(result).not.toContain('00:00');
    });

    it('handles VTT without speaker tags', () => {
        const vtt = `WEBVTT

00:00:01.000 --> 00:00:05.000
Just some plain text here`;

        const result = parseVtt(vtt);
        expect(result).toContain('Just some plain text here');
    });
});

describe('SBV parsing', () => {
    it('strips timecodes from SBV format', () => {
        const sbv = `0:00:01.000,0:00:05.000
Hello from Alice

0:00:05.500,0:00:10.000
Bob here, ready to start`;

        const result = parseSbv(sbv);
        expect(result).toContain('Hello from Alice');
        expect(result).toContain('Bob here, ready to start');
        expect(result).not.toContain('0:00:01');
    });

    it('handles empty SBV', () => {
        const result = parseSbv('');
        expect(result).toBe('');
    });
});
