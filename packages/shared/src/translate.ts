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

const SYSTEM_PROMPT = `You are a precise translator. Translate each line of text to the target language.

Rules:
- Return ONLY the translations, one per line, in the EXACT same order as the input
- Do NOT add numbering, bullets, or any extra formatting
- Do NOT translate proper nouns (people names, company names, product names)
- Keep the same tone and brevity as the original
- If a line is already in the target language, return it unchanged
- Return exactly the same number of lines as the input`;

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
        const userMessage = `Translate the following ${batch.length} lines to ${targetName}:\n\n${batch.join('\n')}`;

        const response = await callGemini(SYSTEM_PROMPT, userMessage, apiKey, {
            maxOutputTokens: 2048,
        });

        const lines = response.trim().split('\n').map((l) => l.trim()).filter(Boolean);

        // Gemini should return exactly as many lines as we sent.
        // If it doesn't, fall back to originals for the missing ones.
        for (let j = 0; j < batch.length; j++) {
            results.push(lines[j] ?? batch[j]);
        }
    }

    return results;
}
