/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: 'class',
    content: [
        './app/**/*.{ts,tsx}',
        './components/**/*.{ts,tsx}',
    ],
    theme: {
        extend: {
            colors: {
                // ScienceExperts.ai brand palette — red/coral accent
                brand: {
                    50: '#fef2f2',
                    100: '#fee2e2',
                    200: '#fecaca',
                    300: '#fca5a5',
                    400: '#e05a5a',
                    500: '#D94A4A',   // PRIMARY ACCENT — CTA buttons, active states
                    600: '#C43E3E',   // Hover state
                    700: '#b91c1c',
                    800: '#991b1b',
                    900: '#7f1d1d',
                    950: '#450a0a',
                },
                surface: {
                    DEFAULT: '#121212',
                    raised: '#2a2a2a',
                    overlay: '#202020',
                    muted: '#323232',
                },
                accent: {
                    teal: '#06b6d4',
                    violet: '#8b5cf6',
                    amber: '#f59e0b',
                    rose: '#ef4444',
                    emerald: '#22c55e',
                    blue: '#3b82f6',
                },
                // Per-nav-item icon colors (muted, cohesive tones)
                icon: {
                    calendar: '#4A7FC4',
                    transcripts: '#8B6DB5',
                    decisions: '#3A9E8A',
                    archive: '#C08A50',
                },
                // Semantic theme tokens backed by CSS variables
                theme: {
                    base: 'rgb(var(--color-background) / <alpha-value>)',
                    raised: 'rgb(var(--color-card) / <alpha-value>)',
                    overlay: 'rgb(var(--color-muted) / <alpha-value>)',
                    muted: 'rgb(var(--color-muted) / <alpha-value>)',
                },
                'theme-text': {
                    primary: 'rgb(var(--color-foreground) / <alpha-value>)',
                    secondary: 'rgb(var(--color-secondary) / <alpha-value>)',
                    tertiary: 'rgb(var(--color-secondary) / <alpha-value>)',
                    muted: 'rgb(var(--color-muted-foreground) / <alpha-value>)',
                },
                'theme-border': 'rgb(var(--color-border) / <alpha-value>)',
            },
            fontFamily: {
                sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
                mono: ['JetBrains Mono', 'monospace'],
            },
            animation: {
                'fade-in': 'fadeIn 0.5s ease-out',
                'slide-up': 'slideUp 0.3s ease-out',
                'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            },
            keyframes: {
                fadeIn: {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                slideUp: {
                    '0%': { opacity: '0', transform: 'translateY(10px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
            },
        },
    },
    plugins: [require('@tailwindcss/typography')],
};
