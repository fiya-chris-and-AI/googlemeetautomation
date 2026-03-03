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
                // Custom brand palette — deep blues with teal accents
                brand: {
                    50: '#eef7ff',
                    100: '#d9edff',
                    200: '#bce0ff',
                    300: '#8eccff',
                    400: '#59afff',
                    500: '#338bff',
                    600: '#1b6af5',
                    700: '#1454e1',
                    800: '#1745b6',
                    900: '#193d8f',
                    950: '#142757',
                },
                surface: {
                    DEFAULT: '#0a0f1e',
                    raised: '#111827',
                    overlay: '#1a2236',
                    muted: '#1e293b',
                },
                accent: {
                    teal: '#2dd4bf',
                    violet: '#8b5cf6',
                    amber: '#f59e0b',
                    rose: '#f43f5e',
                },
                // Semantic theme tokens backed by CSS variables
                theme: {
                    base: 'rgb(var(--color-bg-base) / <alpha-value>)',
                    raised: 'rgb(var(--color-bg-raised) / <alpha-value>)',
                    overlay: 'rgb(var(--color-bg-overlay) / <alpha-value>)',
                    muted: 'rgb(var(--color-bg-muted) / <alpha-value>)',
                },
                'theme-text': {
                    primary: 'rgb(var(--color-text-primary) / <alpha-value>)',
                    secondary: 'rgb(var(--color-text-secondary) / <alpha-value>)',
                    tertiary: 'rgb(var(--color-text-tertiary) / <alpha-value>)',
                    muted: 'rgb(var(--color-text-muted) / <alpha-value>)',
                },
                'theme-border': 'rgb(var(--color-border) / <alpha-value>)',
            },
            fontFamily: {
                sans: ['Inter', 'system-ui', 'sans-serif'],
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
    plugins: [],
};
