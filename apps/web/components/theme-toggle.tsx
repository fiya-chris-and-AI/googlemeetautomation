'use client';

import { useTheme } from '../lib/theme';

/**
 * Theme toggle — compact tile button for the sidebar footer.
 * Renders sun/moon inline SVG + label. Designed to sit side-by-side
 * with the language toggle.
 */
export function ThemeToggle() {
    const { theme, toggleTheme } = useTheme();

    return (
        <button
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg
                       text-xs font-medium text-gray-500 dark:text-gray-400
                       bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700
                       hover:bg-gray-100 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-600
                       hover:text-gray-700 dark:hover:text-gray-200 transition-colors duration-100 cursor-pointer"
        >
            {theme === 'dark' ? (
                <SunIcon className="w-4 h-4" />
            ) : (
                <MoonIcon className="w-4 h-4" />
            )}
            <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
        </button>
    );
}

function SunIcon({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" className={className}>
            <circle cx="8" cy="8" r="3" />
            <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06" />
        </svg>
    );
}

function MoonIcon({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" className={className}>
            <path d="M13.5 9.2A6.5 6.5 0 016.8 2.5a5.5 5.5 0 106.7 6.7z" />
        </svg>
    );
}
