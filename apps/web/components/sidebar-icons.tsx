/**
 * Inline SVG icon components for the sidebar nav.
 * Each icon uses stroke="currentColor" so Tailwind text-color utilities
 * control the color. Standard props: viewBox 0 0 20 20, strokeWidth 1.6.
 */

interface IconProps {
    className?: string;
}

const svgBase = {
    viewBox: '0 0 20 20',
    fill: 'none',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    stroke: 'currentColor',
};

export function UploadIcon({ className }: IconProps) {
    return (
        <svg {...svgBase} className={className}>
            <path d="M10 14V4m0 0L6.5 7.5M10 4l3.5 3.5" />
            <path d="M3 13v2a2 2 0 002 2h10a2 2 0 002-2v-2" />
        </svg>
    );
}

export function DashboardIcon({ className }: IconProps) {
    return (
        <svg {...svgBase} className={className}>
            <rect x="2" y="2" width="7" height="8" rx="2" />
            <rect x="11" y="2" width="7" height="5" rx="2" />
            <rect x="2" y="12" width="7" height="6" rx="2" />
            <rect x="11" y="9" width="7" height="9" rx="2" />
        </svg>
    );
}

export function CalendarIcon({ className }: IconProps) {
    return (
        <svg {...svgBase} className={className}>
            <rect x="2" y="3" width="16" height="15" rx="2" />
            <path d="M2 8h16" />
            <path d="M6 1v4M14 1v4" />
            <circle cx="7" cy="12" r="1" fill="currentColor" stroke="none" />
            <circle cx="10" cy="12" r="1" fill="currentColor" stroke="none" />
            <circle cx="13" cy="12" r="1" fill="currentColor" stroke="none" />
        </svg>
    );
}

export function TranscriptsIcon({ className }: IconProps) {
    return (
        <svg {...svgBase} className={className}>
            <path d="M4 2h12a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V4a2 2 0 012-2z" />
            <path d="M6 7h8M6 10h6M6 13h4" />
        </svg>
    );
}

export function ActionItemsIcon({ className }: IconProps) {
    return (
        <svg {...svgBase} className={className}>
            <circle cx="10" cy="10" r="8" />
            <path d="M7 10l2 2 4-4" />
        </svg>
    );
}

export function DecisionsIcon({ className }: IconProps) {
    return (
        <svg {...svgBase} className={className}>
            <path d="M10 2v5" />
            <path d="M10 7L5 12" />
            <path d="M10 7l5 5" />
            <circle cx="5" cy="14" r="2.5" />
            <circle cx="15" cy="14" r="2.5" />
            <circle cx="10" cy="2" r="1.5" fill="currentColor" stroke="none" />
        </svg>
    );
}

export function ArchiveIcon({ className }: IconProps) {
    return (
        <svg {...svgBase} className={className}>
            <path d="M2 4a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H3a1 1 0 01-1-1V4z" />
            <path d="M3 7v9a2 2 0 002 2h10a2 2 0 002-2V7" />
            <path d="M8 11h4" />
        </svg>
    );
}

export function AskAiIcon({ className }: IconProps) {
    return (
        <svg {...svgBase} className={className}>
            <path d="M10 2l2 4 4.5 0.5-3.25 3.2 0.75 4.8L10 12l-4 2.5 0.75-4.8L3.5 6.5 8 6z" />
        </svg>
    );
}

export function LogsIcon({ className }: IconProps) {
    return (
        <svg {...svgBase} className={className}>
            <circle cx="10" cy="10" r="8" />
            <circle cx="10" cy="10" r="2.5" />
            <path d="M10 2v2M10 16v2M2 10h2M16 10h2" />
        </svg>
    );
}

/** Open Questions icon — question mark in a speech bubble. */
export function OpenQuestionsIcon({ className }: IconProps) {
    return (
        <svg {...svgBase} className={className}>
            <path d="M3 4a2 2 0 012-2h10a2 2 0 012 2v9a2 2 0 01-2 2H8l-4 3v-3a2 2 0 01-1-1.7V4z" />
            <path d="M8 6.5a2 2 0 112.5 1.94V9.5" />
            <circle cx="10.25" cy="11.5" r="0.5" fill="currentColor" stroke="none" />
        </svg>
    );
}

/** Small admin icon for the footer (viewBox 0 0 16 16). */
export function AdminIcon({ className }: IconProps) {
    return (
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" className={className}>
            <circle cx="8" cy="5" r="3.5" />
            <path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" />
        </svg>
    );
}

/** Small logout icon for the footer (viewBox 0 0 16 16). */
export function LogoutIcon({ className }: IconProps) {
    return (
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" className={className}>
            <path d="M6 14l-4-4 4-4" />
            <path d="M2 10h8a4 4 0 000-8H7" />
        </svg>
    );
}
