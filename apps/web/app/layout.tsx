import type { Metadata } from 'next';
import { Sidebar } from '../components/sidebar';
import './globals.css';

export const metadata: Metadata = {
    title: 'MeetScript — Google Meet Transcript Pipeline',
    description: 'AI-powered meeting transcript management with RAG search by 3rd AI LLC',
};

/**
 * Root layout — dark-mode sidebar + main content area.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" className="dark">
            <body className="min-h-screen custom-scrollbar">
                <Sidebar />
                <main className="ml-64 min-h-screen p-8">
                    {children}
                </main>
            </body>
        </html>
    );
}
