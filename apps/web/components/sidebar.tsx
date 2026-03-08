'use client';

import { useState, useEffect, type ComponentType } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from './theme-toggle';
import { SidebarUploadButton } from './upload-modal';
import { TimezoneClock } from './timezone-clock';
import { useLocale } from '../lib/locale';
import type { TranslationKey } from '../lib/translations';
import {
    DashboardIcon,
    CalendarIcon,
    TranscriptsIcon,
    ActionItemsIcon,
    DecisionsIcon,
    ArchiveIcon,
    AskAiIcon,
    LogsIcon,
    AdminIcon,
    LogoutIcon,
} from './sidebar-icons';

// ── Nav item type ────────────────────────────────────────────────────
interface NavItem {
    href: string;
    labelKey: TranslationKey;
    icon: ComponentType<{ className?: string }>;
    /** Tailwind text-color class for the icon's default (inactive) state */
    iconColor: string;
}

// ── "Workspace" section ──────────────────────────────────────────────
const WORKSPACE_ITEMS: NavItem[] = [
    { href: '/', labelKey: 'sidebar.nav.dashboard', icon: DashboardIcon, iconColor: 'text-brand-500' },
    { href: '/calendar', labelKey: 'sidebar.nav.calendar', icon: CalendarIcon, iconColor: 'text-icon-calendar' },
    { href: '/transcripts', labelKey: 'sidebar.nav.transcripts', icon: TranscriptsIcon, iconColor: 'text-icon-transcripts' },
    { href: '/action-items', labelKey: 'sidebar.nav.actionItems', icon: ActionItemsIcon, iconColor: 'text-brand-500' },
    { href: '/decisions', labelKey: 'sidebar.nav.decisions', icon: DecisionsIcon, iconColor: 'text-icon-decisions' },
    { href: '/archive', labelKey: 'sidebar.nav.archive', icon: ArchiveIcon, iconColor: 'text-icon-archive' },
];

// ── "Intelligence" section ───────────────────────────────────────────
const INTELLIGENCE_ITEMS: NavItem[] = [
    { href: '/ask', labelKey: 'sidebar.nav.askAi', icon: AskAiIcon, iconColor: 'text-brand-500' },
    { href: '/logs', labelKey: 'sidebar.nav.logs', icon: LogsIcon, iconColor: 'text-gray-400' },
];

// ── Section label ────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
        <div className="text-[10px] font-semibold uppercase tracking-[1.1px] text-gray-400 dark:text-gray-500 px-3 pt-3 pb-1">
            {children}
        </div>
    );
}

// ── Horizontal divider ──────────────────────────────────────────────
function Divider() {
    return <div className="h-px bg-gray-200 dark:bg-gray-700 mx-5 my-1.5" />;
}

/**
 * Sidebar navigation — persistent across all pages.
 * Sectioned layout with SVG icons, per-item colors, and active state bar.
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

    /** Render a single nav item row */
    function renderNavItem(item: NavItem) {
        const isActive = item.href === '/'
            ? pathname === '/'
            : pathname.startsWith(item.href);

        const Icon = item.icon;

        return (
            <Link
                key={item.href}
                href={item.href}
                className={`
                    relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm
                    transition-colors duration-100 group
                    ${isActive
                        ? 'bg-brand-500/[0.06] text-brand-500 font-semibold'
                        : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white font-medium'
                    }
                `}
            >
                {/* Active left bar */}
                {isActive && (
                    <div className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-brand-500" />
                )}

                {/* Icon — active overrides to brand, otherwise per-item color */}
                <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-brand-500' : item.iconColor}`} />

                {/* Label */}
                <span className="flex-1">{t(item.labelKey)}</span>

                {/* Badge: Action Items */}
                {item.href === '/action-items' && openCount !== null && openCount > 0 && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-500">
                        {openCount}
                    </span>
                )}

                {/* Badge: Decisions */}
                {item.href === '/decisions' && decisionCount !== null && decisionCount > 0 && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-500">
                        {decisionCount}
                    </span>
                )}
            </Link>
        );
    }

    return (
        <aside className="fixed left-0 top-0 bottom-0 w-64 bg-white dark:bg-black border-r border-gray-200 dark:border-gray-800 flex flex-col z-50">
            {/* Brand */}
            <div className="p-5 border-b border-gray-200 dark:border-gray-800">
                <div className="flex flex-col items-start">
                    {/* Light mode logo */}
                    <img
                        src="https://rgltabjdjrbmbjrjoqga.supabase.co/storage/v1/object/public/community-assets/community-logo-1772070053980.png"
                        alt="ScienceExperts.ai"
                        className="h-14 w-auto dark:hidden"
                    />
                    {/* Dark mode logo */}
                    <img
                        src="https://rgltabjdjrbmbjrjoqga.supabase.co/storage/v1/object/public/community-assets/community-logo-dark-1772073090031.png"
                        alt="ScienceExperts.ai"
                        className="h-14 w-auto hidden dark:block"
                    />
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 font-medium mt-1.5 ml-0.5">
                        {t('sidebar.brand')}
                    </p>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto px-2.5 pt-2">
                {/* Upload action */}
                <div className="px-0.5">
                    <SidebarUploadButton />
                </div>

                <Divider />

                {/* Workspace section */}
                <SectionLabel>Workspace</SectionLabel>
                <div className="space-y-0.5">
                    {WORKSPACE_ITEMS.map(renderNavItem)}
                </div>

                <Divider />

                {/* Intelligence section */}
                <SectionLabel>Intelligence</SectionLabel>
                <div className="space-y-0.5">
                    {INTELLIGENCE_ITEMS.map(renderNavItem)}
                </div>
            </nav>

            {/* Footer — three stacked rows */}
            <div className="p-2.5 border-t border-gray-200 dark:border-gray-800 space-y-1.5">
                {/* Row 1: Timezone */}
                <TimezoneClock />

                {/* Row 2: Dark mode + Deutsch toggles (side by side) */}
                <div className="flex gap-1.5">
                    <ThemeToggle />
                    <button
                        onClick={toggleLocale}
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg
                                   text-xs font-medium text-gray-500 dark:text-gray-400
                                   bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700
                                   hover:bg-gray-100 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-600
                                   hover:text-gray-700 dark:hover:text-gray-200 transition-colors duration-100 cursor-pointer"
                        title={locale === 'en' ? 'Switch to German' : 'Auf Englisch umschalten'}
                    >
                        <span className="text-sm leading-none">{locale === 'en' ? '🇩🇪' : '🇺🇸'}</span>
                        {t('locale.toggle')}
                    </button>
                </div>

                {/* Row 3: Admin + Logout (side by side) */}
                <div className="flex gap-0.5">
                    <Link
                        href="/admin/login"
                        className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-colors duration-100
                            ${pathname.startsWith('/admin')
                                ? 'text-brand-500'
                                : 'text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                            }`}
                    >
                        <AdminIcon className="w-4 h-4" />
                        {t('sidebar.admin')}
                    </Link>
                    <a
                        href="/api/auth/logout"
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium
                                   text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-400
                                   hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors duration-100"
                    >
                        <LogoutIcon className="w-4 h-4" />
                        {t('sidebar.logout')}
                    </a>
                </div>
            </div>
        </aside>
    );
}
