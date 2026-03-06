'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { translations, type Locale, type TranslationKey } from './translations';

interface LocaleContextValue {
    locale: Locale;
    toggleLocale: () => void;
    /** Look up a translated string by key. Falls back to English if missing. */
    t: (key: TranslationKey) => string;
}

const LocaleContext = createContext<LocaleContextValue | undefined>(undefined);

const STORAGE_KEY = 'scienceexperts-locale';

/** Read persisted locale from localStorage or the pre-hydration data attribute, default to 'en'. */
function getInitialLocale(): Locale {
    if (typeof window === 'undefined') return 'en';
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'de') return stored;
    // Fall back to the data-locale attribute set by the inline script in layout.tsx
    const attr = document.documentElement.getAttribute('data-locale');
    if (attr === 'en' || attr === 'de') return attr;
    return 'en';
}

/**
 * Locale provider — mirrors the ThemeProvider pattern.
 * Wraps the app so any component can call useLocale() to
 * get the current language, toggle it, or translate a key.
 */
export function LocaleProvider({ children }: { children: React.ReactNode }) {
    const [locale, setLocale] = useState<Locale>('en');
    // Track whether the initial hydration from localStorage has completed.
    // Persistence only starts after hydration so we don't overwrite the stored value.
    const isHydrated = useRef(false);

    // Hydrate from localStorage on mount
    useEffect(() => {
        const stored = getInitialLocale();
        setLocale(stored);
        // Mark hydrated in a microtask so the persist effect for this
        // initial setState does NOT fire yet (it sees isHydrated=false).
        // The persist effect will fire on the *next* user-initiated change.
        queueMicrotask(() => { isHydrated.current = true; });
    }, []);

    // Persist changes — only after hydration is complete
    useEffect(() => {
        if (!isHydrated.current) return;
        try { localStorage.setItem(STORAGE_KEY, locale); } catch { /* quota exceeded — ignore */ }
    }, [locale]);

    const toggleLocale = useCallback(() => {
        setLocale((prev) => (prev === 'en' ? 'de' : 'en'));
    }, []);

    const t = useCallback(
        (key: TranslationKey): string => {
            // Try current locale first, fall back to English
            return translations[locale]?.[key] ?? translations.en[key] ?? key;
        },
        [locale],
    );

    return (
        <LocaleContext.Provider value={{ locale, toggleLocale, t }}>
            {children}
        </LocaleContext.Provider>
    );
}

/**
 * Hook to access locale, toggle, and translation function.
 * Must be used within a LocaleProvider.
 */
export function useLocale(): LocaleContextValue {
    const ctx = useContext(LocaleContext);
    if (!ctx) throw new Error('useLocale must be used within LocaleProvider');
    return ctx;
}
