/**
 * POST /api/translate
 *
 * Cache-first translation endpoint.
 * 1. Checks Supabase translation_cache for existing translations
 * 2. Batch-translates cache misses via Gemini
 * 3. Stores new translations in the cache
 * 4. Returns all translations in original order
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '../../../lib/supabase';
import { translateTexts } from '@meet-pipeline/shared';
import type { TranslateLang } from '@meet-pipeline/shared';

interface TranslateRequestBody {
    texts: string[];
    targetLang: TranslateLang;
    entityType?: string;
    entityId?: string;
    fieldNames?: string[];
}


export async function POST(req: NextRequest) {
    try {
        const body = (await req.json()) as TranslateRequestBody;
        const { texts, targetLang, entityType, entityId, fieldNames } = body;

        if (!texts?.length || !targetLang) {
            return NextResponse.json(
                { error: 'texts and targetLang are required' },
                { status: 400 },
            );
        }

        if (targetLang !== 'en' && targetLang !== 'de') {
            return NextResponse.json(
                { error: 'targetLang must be "en" or "de"' },
                { status: 400 },
            );
        }

        const supabase = getServerSupabase();

        // ── Step 1: Check cache for existing translations ─────────
        // Query by source_text directly (the md5 unique index handles dedup on writes)
        const { data: cached } = await supabase
            .from('translation_cache')
            .select('source_text, translated_text')
            .in('source_text', texts)
            .eq('target_lang', targetLang);

        // Build a lookup map from source_text → translated_text
        const cacheMap = new Map<string, string>();
        if (cached) {
            for (const row of cached) {
                cacheMap.set(row.source_text, row.translated_text);
            }
        }

        // ── Step 2: Separate hits from misses ────────────────────
        const misses: { index: number; text: string }[] = [];
        const results: string[] = new Array(texts.length);

        for (let i = 0; i < texts.length; i++) {
            const cachedTranslation = cacheMap.get(texts[i]);
            if (cachedTranslation) {
                results[i] = cachedTranslation;
            } else {
                misses.push({ index: i, text: texts[i] });
            }
        }

        // ── Step 3: Translate cache misses via Gemini ────────────
        if (misses.length > 0) {
            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) {
                return NextResponse.json(
                    { error: 'GEMINI_API_KEY not configured' },
                    { status: 500 },
                );
            }

            const missTexts = misses.map((m) => m.text);
            const translated = await translateTexts(missTexts, targetLang, apiKey);

            // Fill in results and prepare cache rows
            const cacheRows = misses.map((miss, idx) => ({
                source_text: miss.text,
                source_lang: targetLang === 'de' ? 'en' : 'de',
                target_lang: targetLang,
                translated_text: translated[idx],
                entity_type: entityType ?? null,
                entity_id: entityId ?? null,
                field_name: fieldNames?.[miss.index] ?? null,
            }));

            for (let idx = 0; idx < misses.length; idx++) {
                results[misses[idx].index] = translated[idx];
            }

            // ── Step 4: Store new translations in cache ──────────
            // Insert individually with conflict handling (md5 unique index)
            for (const row of cacheRows) {
                await supabase
                    .from('translation_cache')
                    .insert(row)
                    .then(({ error }) => {
                        // Ignore unique violations (race condition with parallel requests)
                        if (error && !error.message.includes('duplicate')) {
                            console.warn('[translate] Cache write failed:', error.message);
                        }
                    });
            }
        }

        return NextResponse.json({ translations: results });
    } catch (err) {
        console.error('[translate] Error:', err);
        return NextResponse.json(
            { error: 'Translation failed' },
            { status: 500 },
        );
    }
}
