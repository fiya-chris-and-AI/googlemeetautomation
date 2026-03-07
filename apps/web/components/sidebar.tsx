'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from './theme-toggle';
import { SidebarUploadButton } from './upload-modal';
import { TimezoneClock } from './timezone-clock';
import { useLocale } from '../lib/locale';
import type { TranslationKey } from '../lib/translations';

const NAV_ITEMS = [
    { href: '/', labelKey: 'sidebar.nav.dashboard' as TranslationKey, icon: '◆' },
    { href: '/calendar', labelKey: 'sidebar.nav.calendar' as TranslationKey, icon: '◫' },
    { href: '/transcripts', labelKey: 'sidebar.nav.transcripts' as TranslationKey, icon: '◇' },
    { href: '/action-items', labelKey: 'sidebar.nav.actionItems' as TranslationKey, icon: '☑' },
    { href: '/decisions', labelKey: 'sidebar.nav.decisions' as TranslationKey, icon: '◩' },
    { href: '/archive', labelKey: 'sidebar.nav.archive' as TranslationKey, icon: '📦' },
    { href: '/ask', labelKey: 'sidebar.nav.askAi' as TranslationKey, icon: '◈' },
    { href: '/logs', labelKey: 'sidebar.nav.logs' as TranslationKey, icon: '◉' },
] as const;

/**
 * Sidebar navigation — persistent across all pages.
 * Flat design with pill-shaped active states.
 */
export function Sidebar() {
    const pathname = usePathname();
    const { t, locale, toggleLocale } = useLocale();
    const [openCount, setOpenCount] = useState<number | null>(null);
    const [decisionCount, setDecisionCount] = useState<number | null>(null);

    useEffect(() => {
        fetch('/api/action-items?status=open,in_progress')
            .then((r) => r.json())
            .then((data) => {
                if (Array.isArray(data)) setOpenCount(data.length);
            })
            .catch(() => { });

        fetch('/api/decisions?status=active')
            .then((r) => r.json())
            .then((data) => {
                if (Array.isArray(data)) setDecisionCount(data.length);
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
                        {t('sidebar.brand')}
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
                            {t(item.labelKey)}
                            {item.href === '/action-items' && openCount !== null && openCount > 0 && (
                                <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/20">
                                    {openCount}
                                </span>
                            )}
                            {item.href === '/decisions' && decisionCount !== null && decisionCount > 0 && (
                                <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-accent-violet/15 text-accent-violet ring-1 ring-accent-violet/20">
                                    {decisionCount}
                                </span>
                            )}
                            {isActive && item.href !== '/action-items' && item.href !== '/decisions' && (
                                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse-slow" />
                            )}
                            {isActive && item.href === '/action-items' && openCount === null && (
                                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse-slow" />
                            )}
                            {isActive && item.href === '/decisions' && decisionCount === null && (
                                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse-slow" />
                            )}
                        </Link>
                    );
                })}
            </nav>

            {/* Footer */}
            <div className="p-4 border-t border-theme-border space-y-3">
                <TimezoneClock />
                <div className="flex items-center gap-2">
                    <ThemeToggle />
                    <button
                        onClick={toggleLocale}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
                                   text-gray-600 dark:text-neutral-400 hover:bg-gray-100 dark:hover:bg-neutral-800
                                   transition-all duration-200 cursor-pointer"
                        title={locale === 'en' ? 'Switch to German' : 'Auf Englisch umschalten'}
                    >
                        <span>{locale === 'en' ? '🇩🇪' : '🇺🇸'}</span>
                        {t('locale.toggle')}
                    </button>
                </div>

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
                        <span>👤</span> {t('sidebar.admin')}
                    </Link>
                    <a
                        href="/api/auth/logout"
                        className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium text-gray-500 dark:text-neutral-500 hover:bg-gray-50 dark:hover:bg-neutral-800 transition-all"
                    >
                        <span>🚪</span> {t('sidebar.logout')}
                    </a>
                </div>

            </div>
        </aside>
    );
}
