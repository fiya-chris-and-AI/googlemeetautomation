'use client';

import { useState } from 'react';

interface LockButtonProps {
    entityType: 'action_item' | 'decision';
    entityId: string;
    isLocked: boolean;
    lockedBy: string | null;
    currentUser: string;          // 'Lutfiya Miller' | 'Chris Müller'
    onLockChange: (locked: boolean) => void;
}

/**
 * Toggle button for locking/unlocking action items and decisions.
 * Locking prevents auto-archival after the 24h TTL expires.
 */
export function LockButton({ entityType, entityId, isLocked, lockedBy, currentUser, onLockChange }: LockButtonProps) {
    const [loading, setLoading] = useState(false);
    const apiBase = entityType === 'action_item' ? 'action-items' : 'decisions';

    const toggle = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/${apiBase}/${entityId}/lock`, {
                method: isLocked ? 'DELETE' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ actor: currentUser }),
            });
            if (res.ok) onLockChange(!isLocked);
        } finally {
            setLoading(false);
        }
    };

    return (
        <button
            onClick={toggle}
            disabled={loading}
            title={isLocked ? `Locked by ${lockedBy} — click to unlock` : 'Lock to prevent auto-archive'}
            className={`
                inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-lg
                border transition-all duration-200
                ${isLocked
                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                    : 'border-theme-border text-theme-text-muted hover:text-amber-400 hover:border-amber-500/30'
                }
                ${loading ? 'opacity-50 cursor-wait' : ''}
            `}
        >
            <span className="text-sm">{isLocked ? '🔒' : '🔓'}</span>
            {isLocked ? 'Locked' : 'Lock'}
        </button>
    );
}
