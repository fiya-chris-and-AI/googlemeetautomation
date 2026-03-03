import * as cheerio from 'cheerio';

/**
 * Extract plain text from an inline HTML email body.
 * Preserves speaker names and timestamps by keeping
 * line-break structure while stripping all HTML tags.
 */
export function extractInlineTranscript(html: string): string {
    const $ = cheerio.load(html);

    // Remove script/style elements that add noise
    $('script, style').remove();

    // Replace <br> and block-level elements with newlines
    $('br').replaceWith('\n');
    $('p, div, li, tr').each((_, el) => {
        $(el).append('\n');
    });

    // Get text, collapse whitespace on each line, remove blank lines
    const raw = $.text();
    const lines = raw
        .split('\n')
        .map((line) => line.replace(/\s+/g, ' ').trim())
        .filter((line) => line.length > 0);

    return lines.join('\n');
}
