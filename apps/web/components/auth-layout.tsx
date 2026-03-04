'use client';

import { usePathname } from 'next/navigation';
import { Sidebar } from '../components/sidebar';

/**
 * Conditionally renders the sidebar + main layout.
 * On /login page: no sidebar, full-width content.
 * Otherwise: sidebar + offset main area.
 */
export function AuthLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isLoginPage = pathname === '/login';

    if (isLoginPage) {
        return <>{children}</>;
    }

    return (
        <>
            <Sidebar />
            <main className="ml-64 min-h-screen p-8">
                {children}
            </main>
        </>
    );
}
