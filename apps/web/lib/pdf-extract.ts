/**
 * PDF text extraction utility.
 * Isolated in its own module so the CJS require('pdf-parse') doesn't
 * interfere with Next.js API route registration.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdf = require('pdf-parse');

/** Extract all text from a PDF buffer. */
export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
    const result = await pdf(buffer);
    return result.text ?? '';
}
