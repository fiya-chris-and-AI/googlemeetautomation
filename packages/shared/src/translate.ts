/**
 * Batch translation using Gemini.
 *
 * Translates an array of short strings between EN and DE.
 * Designed to be called from the /api/translate route.
 * Batches strings into groups of 20 to keep token usage low.
 */

import { callGemini } from './gemini';

export type TranslateLang = 'en' | 'de';

const LANG_NAMES: Record<TranslateLang, string> = {
    en: 'English',
    de: 'German',
};

const BATCH_SIZE = 20;

const SYSTEM_PROMPT = `You are a precise translator.

Rules:
- Each input line is numbered like "1: some text"
- Return ONLY the translations, keeping the EXACT same numbering: "1: translated text"
- Do NOT skip or merge lines — every input number MUST appear in your output
- Do NOT translate proper nouns (people names, company names, product names)
- Keep the same tone and brevity as the original
- If a line is already in the target language, return it unchanged with its number`;

/**
 * Translate an array of strings from one language to another using Gemini.
 * Handles batching internally — callers can pass any number of strings.
 */
export async function translateTexts(
    texts: string[],
    targetLang: TranslateLang,
    apiKey: string,
): Promise<string[]> {
    if (texts.length === 0) return [];

    const targetName = LANG_NAMES[targetLang];
    const results: string[] = [];

    // Process in batches to keep token usage manageable
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
        const batch = texts.slice(i, i + BATCH_SIZE);

        // Number each line so Gemini's response can be parsed reliably
        const numbered = batch.map((text, idx) => `${idx + 1}: ${text}`).join('\n');
        const userMessage = `Translate the following ${batch.length} lines to ${targetName}:\n\n${numbered}`;

        const response = await callGemini(SYSTEM_PROMPT, userMessage, apiKey, {
            maxOutputTokens: 2048,
        });

        // Parse numbered responses: "1: translated text" → Map<number, string>
        const parsed = new Map<number, string>();
        for (const line of response.trim().split('\n')) {
            const match = line.match(/^(\d+):\s*(.+)/);
            if (match) {
                parsed.set(parseInt(match[1], 10), match[2].trim());
            }
        }

        // Map back to the batch — fall back to original if a line was missed
        for (let j = 0; j < batch.length; j++) {
            results.push(parsed.get(j + 1) ?? batch[j]);
        }
    }

    return results;
}
