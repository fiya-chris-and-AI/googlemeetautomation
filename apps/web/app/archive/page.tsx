'use client';

import { useState, useEffect, useMemo } from 'react';
import type { ActionItem, Decision } from '@meet-pipeline/shared';
import { useTranslation } from '../../lib/use-translation';

type TabType = 'all' | 'action_items' | 'decisions';

/** The current admin user. Matches existing hardcoded pattern. */
const CURRENT_USER = 'Lutfiya Miller';

export default function ArchivePage() {
    const [actionItems, setActionItems] = useState<ActionItem[]>([]);
    const [decisions, setDecisions] = useState<Decision[]>([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState<TabType>('all');
    const [search, setSearch] = useState('');
    const [restoringIds, setRestoringIds] = useState<Set<string>>(new Set());

    const fetchArchive = async () => {
        try {
            const params = new URLSearchParams();
            if (tab !== 'all') params.set('type', tab);
            if (search) params.set('search', search);
            const qs = params.toString();

            const res = await fetch(`/api/archive${qs ? `?${qs}` : ''}`);
            const data = await res.json();
            setActionItems(data.action_items ?? []);
            setDecisions(data.decisions ?? []);
        } catch {
            // silently fail
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        setLoading(true);
        fetchArchive();
    }, [tab, search]);

    const handleRestore = async (entityType: 'action_item' | 'decision', id: string) => {
        setRestoringIds(prev => new Set(prev).add(id));
        try {
            const res = await fetch('/api/archive/restore', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ entity_type: entityType, id, actor: CURRENT_USER }),
            });
            if (res.ok) {
                // Remove from local view
                if (entityType === 'action_item') {
                    setActionItems(prev => prev.filter(i => i.id !== id));
                } else {
                    setDecisions(prev => prev.filter(d => d.id !== id));
                }
            }
        } finally {
            setRestoringIds(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        }
    };

    // Translate titles for display
    const allActionTitles = useMemo(() => actionItems.map(i => i.title), [actionItems]);
    const { translated: translatedTitles } = useTranslation(allActionTitles, { entityType: 'action_item' });
    const actionTitleMap = useMemo(() => {
        const map = new Map<string, string>();
        actionItems.forEach((item, idx) => map.set(item.id, translatedTitles[idx] ?? item.title));
        return map;
    }, [actionItems, translatedTitles]);

    const allDecisionTexts = useMemo(() => decisions.map(d => d.decision_text), [decisions]);
    const { translated: translatedDecisions } = useTranslation(allDecisionTexts, { entityType: 'decision' });
    const decisionTextMap = useMemo(() => {
        const map = new Map<string, string>();
        decisions.forEach((d, idx) => map.set(d.id, translatedDecisions[idx] ?? d.decision_text));
        return map;
    }, [decisions, translatedDecisions]);

    const totalCount = actionItems.length + decisions.length;

    const TABS: { key: TabType; label: string }[] = [
        { key: 'all', label: 'All' },
        { key: 'action_items', label: 'Action Items' },
        { key: 'decisions', label: 'Decisions' },
    ];

    return (
        <div className="max-w-7xl mx-auto animate-fade-in">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-theme-text-primary tracking-tight">📦 Archive</h1>
                <p className="text-theme-text-tertiary mt-1">
                    Items archived after 24 hours. Restore to bring them back to active view.
                </p>
            </div>

            {/* Tabs + Search */}
            <div className="glass-card p-4 mb-8 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1 bg-theme-overlay rounded-lg p-0.5">
                    {TABS.map(t => (
                        <button
                            key={t.key}
                            onClick={() => setTab(t.key)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${tab === t.key
                                    ? 'bg-brand-500/20 text-brand-400'
                                    : 'text-theme-text-muted hover:text-theme-text-secondary'
                                }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
                <input
                    type="text"
                    placeholder="Search archived items..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="input-glow border-0 bg-transparent focus:ring-0 text-sm flex-1 min-w-[200px]"
                />
                <span className="text-sm text-theme-text-muted">
                    {totalCount} archived
                </span>
            </div>

            {/* Content */}
            {loading ? (
                <div className="p-12 text-center text-theme-text-tertiary">Loading archive...</div>
            ) : totalCount === 0 ? (
                <div className="glass-card p-12 text-center">
                    <p className="text-theme-text-muted text-lg mb-2">No archived items</p>
                    <p className="text-theme-text-tertiary text-sm">
                        {search
                            ? 'Try adjusting your search.'
                            : 'Items will appear here after the 24-hour TTL expires.'}
                    </p>
                </div>
            ) : (
                <div className="space-y-8">
                    {/* Archived Action Items */}
                    {actionItems.length > 0 && (tab === 'all' || tab === 'action_items') && (
                        <div>
                            <div className="flex items-center gap-3 mb-4">
                                <h2 className="text-lg font-semibold text-theme-text-secondary">Action Items</h2>
                                <span className="text-xs text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">
                                    {actionItems.length}
                                </span>
                                <div className="flex-1 border-t border-theme-border/50" />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {actionItems.map(item => (
                                    <ArchivedActionItemCard
                                        key={item.id}
                                        item={item}
                                        translatedTitle={actionTitleMap.get(item.id)}
                                        onRestore={() => handleRestore('action_item', item.id)}
                                        isRestoring={restoringIds.has(item.id)}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Archived Decisions */}
                    {decisions.length > 0 && (tab === 'all' || tab === 'decisions') && (
                        <div>
                            <div className="flex items-center gap-3 mb-4">
                                <h2 className="text-lg font-semibold text-theme-text-secondary">Decisions</h2>
                                <span className="text-xs text-accent-violet bg-accent-violet/10 px-2 py-0.5 rounded-full">
                                    {decisions.length}
                                </span>
                                <div className="flex-1 border-t border-theme-border/50" />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {decisions.map(decision => (
                                    <ArchivedDecisionCard
                                        key={decision.id}
                                        decision={decision}
                                        translatedText={decisionTextMap.get(decision.id)}
                                        onRestore={() => handleRestore('decision', decision.id)}
                                        isRestoring={restoringIds.has(decision.id)}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ── Sub-components ──────────────────────────────

function ArchivedActionItemCard({
    item,
    translatedTitle,
    onRestore,
    isRestoring,
}: {
    item: ActionItem;
    translatedTitle?: string;
    onRestore: () => void;
    isRestoring: boolean;
}) {
    return (
        <div className="glass-card p-4 opacity-70 hover:opacity-90 transition-opacity duration-200">
            <div className="flex items-start gap-2">
                <span className="mt-1.5 inline-block w-2 h-2 rounded-full flex-shrink-0 bg-theme-text-muted" />
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-theme-text-primary">
                        {translatedTitle ?? item.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {item.assigned_to && (
                            <span className="badge-info text-[10px]">{item.assigned_to}</span>
                        )}
                        <span className="text-[10px] text-theme-text-muted">{item.priority}</span>
                        {item.group_label && (
                            <span className="text-[10px] text-theme-text-tertiary">
                                {item.group_label}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-[10px] text-theme-text-tertiary">
                        <span>Created: {new Date(item.created_at).toLocaleDateString()}</span>
                        {item.archived_at && (
                            <span>Archived: {new Date(item.archived_at).toLocaleDateString()}</span>
                        )}
                    </div>
                </div>
            </div>
            <div className="mt-3 pt-2 border-t border-theme-border/50">
                <button
                    onClick={onRestore}
                    disabled={isRestoring}
                    className={`px-3 py-1 text-[11px] font-medium rounded-lg border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition-colors ${isRestoring ? 'opacity-50 cursor-wait' : ''
                        }`}
                >
                    {isRestoring ? 'Restoring…' : '↩ Restore & Lock'}
                </button>
            </div>
        </div>
    );
}

function ArchivedDecisionCard({
    decision,
    translatedText,
    onRestore,
    isRestoring,
}: {
    decision: Decision;
    translatedText?: string;
    onRestore: () => void;
    isRestoring: boolean;
}) {
    return (
        <div className="glass-card p-4 opacity-70 hover:opacity-90 transition-opacity duration-200">
            <div className="flex items-start gap-2">
                <span className="mt-1.5 inline-block w-2 h-2 rounded-full flex-shrink-0 bg-theme-text-muted" />
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                        {decision.topic && (
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap bg-theme-bg-muted text-theme-text-muted">
                                {decision.topic}
                            </span>
                        )}
                    </div>
                    <p className="text-sm text-theme-text-primary mt-1">
                        {translatedText ?? decision.decision_text}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className="text-[10px] text-theme-text-muted">{decision.domain}</span>
                        {decision.meeting_title && (
                            <span className="text-[10px] text-theme-text-tertiary truncate max-w-[200px]">
                                from: {decision.meeting_title}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-[10px] text-theme-text-tertiary">
                        <span>Decided: {new Date(decision.decided_at).toLocaleDateString()}</span>
                        {decision.archived_at && (
                            <span>Archived: {new Date(decision.archived_at).toLocaleDateString()}</span>
                        )}
                    </div>
                </div>
            </div>
            <div className="mt-3 pt-2 border-t border-theme-border/50">
                <button
                    onClick={onRestore}
                    disabled={isRestoring}
                    className={`px-3 py-1 text-[11px] font-medium rounded-lg border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition-colors ${isRestoring ? 'opacity-50 cursor-wait' : ''
                        }`}
                >
                    {isRestoring ? 'Restoring…' : '↩ Restore & Lock'}
                </button>
            </div>
        </div>
    );
}
