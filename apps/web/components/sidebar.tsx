'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from './theme-toggle';
import { SidebarUploadButton } from './upload-modal';
import { TimezoneClock } from './timezone-clock';

const NAV_ITEMS = [
    { href: '/', label: 'Dashboard', icon: '◆' },
    { href: '/calendar', label: 'Calendar', icon: '◫' },
    { href: '/transcripts', label: 'Transcripts', icon: '◇' },
    { href: '/action-items', label: 'Action Items', icon: '☑' },
    { href: '/ask', label: 'Ask AI', icon: '◈' },
    { href: '/logs', label: 'Logs', icon: '◉' },
] as const;

/**
 * Sidebar navigation — persistent across all pages.
 * Flat design with pill-shaped active states.
 */
export function Sidebar() {
    const pathname = usePathname();
    const [openCount, setOpenCount] = useState<number | null>(null);

    useEffect(() => {
        fetch('/api/action-items?status=open,in_progress')
            .then((r) => r.json())
            .then((data) => {
                if (Array.isArray(data)) setOpenCount(data.length);
            })
            .catch(() => { });
    }, []);

    return (
        <aside className="fixed left-0 top-0 bottom-0 w-64 bg-theme-raised border-r border-theme-border flex flex-col z-50">
            {/* Brand */}
            <div className="p-5 border-b border-theme-border">
                <div className="flex flex-col items-start">
                    {/* Light mode logo (black text) */}
                    <img
                        src="https://rgltabjdjrbmbjrjoqga.supabase.co/storage/v1/object/public/community-assets/community-logo-1772070053980.png"
                        alt="ScienceExperts.ai"
                        className="h-14 w-auto dark:hidden"
                    />
                    {/* Dark mode logo (white text) */}
                    <img
                        src="https://rgltabjdjrbmbjrjoqga.supabase.co/storage/v1/object/public/community-assets/community-logo-dark-1772073090031.png"
                        alt="ScienceExperts.ai"
                        className="h-14 w-auto hidden dark:block"
                    />
                    <p className="text-[11px] text-theme-text-secondary font-medium mt-1.5 ml-0.5">
                        Transcript Pipeline
                    </p>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-3 py-4 space-y-1">
                {/* Quick upload action */}
                <SidebarUploadButton />

                <div className="my-2 border-t border-theme-border" />

                {NAV_ITEMS.map((item) => {
                    const isActive = item.href === '/'
                        ? pathname === '/'
                        : pathname.startsWith(item.href);

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`
                flex items-center gap-3 px-3 py-2.5 rounded-full text-sm font-medium
                transition-all duration-200 group
                ${isActive
                                    ? 'bg-gray-100 dark:bg-neutral-800 text-gray-900 dark:text-neutral-100'
                                    : 'text-gray-600 dark:text-neutral-400 hover:bg-gray-50 dark:hover:bg-neutral-800'
                                }
              `}
                        >
                            <span className={`text-lg transition-transform duration-200 ${isActive ? 'scale-110' : 'group-hover:scale-105'}`}>
                                {item.icon}
                            </span>
                            {item.label}
                            {item.href === '/action-items' && openCount !== null && openCount > 0 && (
                                <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/20">
                                    {openCount}
                                </span>
                            )}
                            {isActive && item.href !== '/action-items' && (
                                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse-slow" />
                            )}
                            {isActive && item.href === '/action-items' && openCount === null && (
                                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse-slow" />
                            )}
                        </Link>
                    );
                })}
            </nav>

            {/* Footer */}
            <div className="p-4 border-t border-theme-border space-y-3">
                <TimezoneClock />
                <ThemeToggle />

                {/* Admin & Auth */}
                <div className="pt-2 space-y-1">
                    <Link
                        href="/admin/login"
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all
                            ${pathname.startsWith('/admin')
                                ? 'bg-gray-100 dark:bg-neutral-800 text-gray-900 dark:text-neutral-100'
                                : 'text-gray-500 dark:text-neutral-500 hover:bg-gray-50 dark:hover:bg-neutral-800'
                            }`}
                    >
                        <span>👤</span> Admin
                    </Link>
                    <a
                        href="/api/auth/logout"
                        className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium text-gray-500 dark:text-neutral-500 hover:bg-gray-50 dark:hover:bg-neutral-800 transition-all"
                    >
                        <span>🚪</span> Abmelden
                    </a>
                </div>

                <p className="text-[11px] text-theme-text-muted text-center mt-2">
                    ScienceExperts.ai — Powered by 3rd AI LLC
                </p>
            </div>
        </aside>
    );
}
