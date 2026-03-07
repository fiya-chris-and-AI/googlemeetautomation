'use client';

import { useState, useEffect } from 'react';

interface TTLBadgeProps {
    createdAt: string;
    isLocked: boolean;
}

/**
 * Countdown badge showing time remaining until auto-archive.
 * Displays "🔒 Locked" when locked, "⏱ Xh Xm" countdown otherwise.
 * Uses rose-400 styling when under 2h remaining for urgency.
 */
export function TTLBadge({ createdAt, isLocked }: TTLBadgeProps) {
    const [remaining, setRemaining] = useState('');

    useEffect(() => {
        if (isLocked) { setRemaining(''); return; }

        const tick = () => {
            const deadline = new Date(createdAt).getTime() + 24 * 60 * 60 * 1000;
            const diff = deadline - Date.now();
            if (diff <= 0) { setRemaining('Archiving…'); return; }
            const h = Math.floor(diff / 3_600_000);
            const m = Math.floor((diff % 3_600_000) / 60_000);
            setRemaining(`${h}h ${m}m`);
        };

        tick();
        const id = setInterval(tick, 60_000);
        return () => clearInterval(id);
    }, [createdAt, isLocked]);

    if (isLocked) return <span className="text-[10px] text-amber-400">🔒 Locked</span>;
    if (!remaining) return null;

    const isUrgent = remaining === 'Archiving…' ||
        (parseInt(remaining) <= 2 && remaining.includes('h'));

    return (
        <span className={`text-[10px] font-mono ${isUrgent ? 'text-rose-400' : 'text-theme-text-tertiary'}`}>
            ⏱ {remaining}
        </span>
    );
}
