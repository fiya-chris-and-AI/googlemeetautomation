'use client';

/**
 * Client-side hook for translating dynamic content.
 *
 * When the locale is 'en', returns originals immediately (no API call).
 * When the locale is 'de', fetches translations from POST /api/translate,
 * which checks the Supabase cache first before calling Gemini.
 *
 * Includes an in-memory session cache so navigating away and back
 * doesn't re-fetch already-translated strings.
 */

import { useState, useEffect, useRef } from 'react';
import { useLocale } from './locale';

/** Global in-memory cache — persists across component mounts within a session. */
const sessionCache = new Map<string, string>();

/** Build a cache key from source text + target language. */
function cacheKey(text: string, lang: string): string {
    return `${lang}:${text}`;
}

interface UseTranslationOptions {
    entityType?: string;
    entityId?: string;
    fieldNames?: string[];
}

/**
 * Translate an array of strings based on the current locale.
 *
 * Returns the same array (same order, same length) with translations
 * swapped in where available. Falls back to originals while loading.
 */
export function useTranslation(
    texts: string[],
    options?: UseTranslationOptions,
): { translated: string[]; loading: boolean } {
    const { locale } = useLocale();
    const [translated, setTranslated] = useState<string[]>(texts);
    const [loading, setLoading] = useState(false);
    const abortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        // English = no translation needed
        if (locale === 'en' || texts.length === 0) {
            setTranslated(texts);
            setLoading(false);
            return;
        }

        // Check which texts need translation (not in session cache)
        const needsTranslation: { index: number; text: string }[] = [];
        const result = [...texts];

        for (let i = 0; i < texts.length; i++) {
            const key = cacheKey(texts[i], locale);
            const cached = sessionCache.get(key);
            if (cached) {
                result[i] = cached;
            } else if (texts[i].trim()) {
                needsTranslation.push({ index: i, text: texts[i] });
            }
        }

        // All are cached — return immediately
        if (needsTranslation.length === 0) {
            setTranslated(result);
            setLoading(false);
            return;
        }

        // Fetch translations from the API
        setLoading(true);
        setTranslated(result); // Show cached ones immediately

        // Cancel any in-flight request
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        const fetchTranslations = async () => {
            try {
                // Split into batches of BATCH_SIZE to avoid API timeouts
                const BATCH_SIZE = 5;
                const running = [...result];

                for (let start = 0; start < needsTranslation.length; start += BATCH_SIZE) {
                    if (controller.signal.aborted) return;

                    const batch = needsTranslation.slice(start, start + BATCH_SIZE);

                    const res = await fetch('/api/translate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            texts: batch.map((n) => n.text),
                            targetLang: locale,
                            entityType: options?.entityType,
                            entityId: options?.entityId,
                            fieldNames: options?.fieldNames,
                        }),
                        signal: controller.signal,
                    });

                    if (!res.ok) throw new Error(`Translation API returned ${res.status}`);

                    const data = (await res.json()) as { translations: string[] };

                    // Store in session cache and update running results
                    for (let i = 0; i < batch.length; i++) {
                        const { index, text } = batch[i];
                        const translatedText = data.translations[i] ?? text;
                        sessionCache.set(cacheKey(text, locale), translatedText);
                        running[index] = translatedText;
                    }

                    // Progressive update — show translations as each batch completes
                    if (!controller.signal.aborted) {
                        setTranslated([...running]);
                    }
                }

                if (!controller.signal.aborted) {
                    setLoading(false);
                }
            } catch (err) {
                if (err instanceof DOMException && err.name === 'AbortError') return;
                console.warn('[useTranslation] Translation failed, using originals:', err);
                if (!controller.signal.aborted) {
                    setLoading(false);
                }
            }
        };

        fetchTranslations();

        return () => {
            controller.abort();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [locale, texts.join('\x00')]);

    return { translated, loading };
}
