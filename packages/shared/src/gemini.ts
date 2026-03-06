/**
 * Shared Gemini API client utility.
 *
 * Thin wrapper around the Google Generative AI REST API.
 * Used by extraction, summarization, and query modules.
 */

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-2.5-flash';

export interface GeminiOptions {
    /** Model to use (default: gemini-2.5-flash) */
    model?: string;
    /** Max output tokens (default: 8192) */
    maxOutputTokens?: number;
}

/**
 * Call the Gemini API with a system prompt and user message.
 * Returns the raw text response.
 *
 * Throws on network / API errors so callers can handle them.
 */
export async function callGemini(
    systemPrompt: string,
    userMessage: string,
    apiKey: string,
    options?: GeminiOptions,
): Promise<string> {
    const model = options?.model ?? DEFAULT_MODEL;
    const maxOutputTokens = options?.maxOutputTokens ?? 8192;

    const url = `${GEMINI_API_URL}/${model}:generateContent?key=${apiKey}`;

    const requestBody = {
        systemInstruction: {
            parts: [{ text: systemPrompt }],
        },
        contents: [
            {
                role: 'user',
                parts: [{ text: userMessage }],
            },
        ],
        generationConfig: {
            maxOutputTokens,
        },
    };

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
        const errorBody = await res.text();
        console.error(`[gemini] API error ${res.status}: ${errorBody}`);
        throw new Error(`Gemini API returned ${res.status}: ${errorBody}`);
    }

    const data = (await res.json()) as {
        candidates?: Array<{
            content?: { parts?: Array<{ text?: string }> };
        }>;
    };

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    if (!text) {
        console.warn('[gemini] Empty response from API');
    }

    return text;
}

/**
 * Strip markdown fences from AI-generated JSON responses.
 * Both Claude and Gemini sometimes wrap JSON in ```json ... ``` fences
 * despite being told not to.
 */
export function stripMarkdownFences(text: string): string {
    return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
}
