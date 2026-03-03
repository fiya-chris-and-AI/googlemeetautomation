import type { Metadata } from 'next';
import { Sidebar } from '../components/sidebar';
import { ThemeProvider } from '../lib/theme';
import './globals.css';

export const metadata: Metadata = {
    title: 'MeetScript — Google Meet Transcript Pipeline',
    description: 'AI-powered meeting transcript management with RAG search by 3rd AI LLC',
};

// Inline script to prevent FOUC — runs before React hydration
const themeScript = `
  (function() {
    var stored = localStorage.getItem('meetscript-theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = stored || (prefersDark ? 'dark' : 'light');
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  })();
`;

/**
 * Root layout — sidebar + main content area with theme support.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" suppressHydrationWarning>
            <head>
                <script dangerouslySetInnerHTML={{ __html: themeScript }} />
            </head>
            <body className="min-h-screen custom-scrollbar">
                <ThemeProvider>
                    <Sidebar />
                    <main className="ml-64 min-h-screen p-8">
                        {children}
                    </main>
                </ThemeProvider>
            </body>
        </html>
    );
}
