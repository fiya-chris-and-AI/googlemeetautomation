'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from './theme-toggle';

const NAV_ITEMS = [
    { href: '/', label: 'Dashboard', icon: '◆' },
    { href: '/transcripts', label: 'Transcripts', icon: '◇' },
    { href: '/ask', label: 'Ask AI', icon: '◈' },
    { href: '/logs', label: 'Logs', icon: '◉' },
] as const;

/**
 * Sidebar navigation — persistent across all pages.
 * Glassmorphism style with active-state glow.
 */
export function Sidebar() {
    const pathname = usePathname();

    return (
        <aside className="fixed left-0 top-0 bottom-0 w-64 bg-theme-raised/80 backdrop-blur-2xl border-r border-theme-border/[0.06] flex flex-col z-50">
            {/* Brand */}
            <div className="p-6 border-b border-theme-border/[0.06]">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-accent-teal flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-brand-500/25">
                        MT
                    </div>
                    <div>
                        <h1 className="text-sm font-semibold text-theme-text-primary tracking-tight">
                            MeetScript
                        </h1>
                        <p className="text-[11px] text-theme-text-tertiary font-medium">
                            Transcript Pipeline
                        </p>
                    </div>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-3 py-4 space-y-1">
                {NAV_ITEMS.map((item) => {
                    const isActive = item.href === '/'
                        ? pathname === '/'
                        : pathname.startsWith(item.href);

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`
                flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                transition-all duration-200 group
                ${isActive
                                    ? 'bg-brand-500/10 text-brand-400 shadow-sm shadow-brand-500/5'
                                    : 'text-theme-text-secondary hover:text-theme-text-primary hover:bg-theme-border/[0.04]'
                                }
              `}
                        >
                            <span className={`text-lg transition-transform duration-200 ${isActive ? 'scale-110' : 'group-hover:scale-105'}`}>
                                {item.icon}
                            </span>
                            {item.label}
                            {isActive && (
                                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse-slow" />
                            )}
                        </Link>
                    );
                })}
            </nav>

            {/* Footer */}
            <div className="p-4 border-t border-theme-border/[0.06]">
                <ThemeToggle />
                <p className="text-[11px] text-theme-text-muted text-center mt-2">
                    3rd AI LLC — solutions@3rdaillc.com
                </p>
            </div>
        </aside>
    );
}
