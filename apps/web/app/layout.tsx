import type { Metadata } from 'next';
import { AuthLayout } from '../components/auth-layout';
import { ThemeProvider } from '../lib/theme';
import { LocaleProvider } from '../lib/locale';
import './globals.css';

export const metadata: Metadata = {
  title: 'ScienceExperts.ai — Transcript Pipeline',
  description: 'Where researchers, scientists, and innovators connect, learn, and grow together.',
};

// Inline script to prevent FOUC — runs before React hydration
const themeScript = `
  (function() {
    var stored = localStorage.getItem('scienceexperts-theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = stored || (prefersDark ? 'dark' : 'light');
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  })();
`;

// Inline script to set locale before React hydrates — prevents EN flash on DE reload
const localeScript = `
  (function() {
    var locale = localStorage.getItem('scienceexperts-locale') || 'en';
    document.documentElement.lang = locale === 'de' ? 'de' : 'en';
    document.documentElement.setAttribute('data-locale', locale);
  })();
`;

/**
 * Root layout — uses AuthLayout to conditionally show sidebar.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript + localeScript }} />
      </head>
      <body className="min-h-screen custom-scrollbar">
        <ThemeProvider>
          <LocaleProvider>
            <AuthLayout>{children}</AuthLayout>
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

