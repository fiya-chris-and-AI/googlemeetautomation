'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import type { OpenQuestion } from '@meet-pipeline/shared';
import { useTranslation } from '../../lib/use-translation';
import { useLocale } from '../../lib/locale';

// ── Topic badge color map ───────────────────────
const TOPIC_STYLE: Record<string, string> = {
    'UI & Design': 'bg-pink-500/20 text-pink-400',
    'AI & Automation': 'bg-accent-violet/20 text-accent-violet',
    'Translation': 'badge-info',
    'DevOps': 'badge-success',
    'Business & Legal': 'badge-warning',
    'Product Features': 'bg-blue-500/20 text-blue-400',
    'Branding & Content': 'bg-orange-500/20 text-orange-400',
    'Process & Meetings': 'bg-accent-teal/20 text-accent-teal',
    'Accounts & Access': 'bg-indigo-500/20 text-indigo-400',
    'Data & Analytics': 'bg-cyan-500/20 text-cyan-400',
    'Documentation': 'bg-gray-500/20 text-gray-400',
    'Personal': 'bg-rose-500/20 text-rose-400',
};

const STATUS_STYLE: Record<string, string> = {
    open: 'badge-warning',
    resolved: 'badge-success',
    archived: 'bg-theme-bg-muted text-theme-text-muted',
};

const ASSIGNEES: { name: string; displayName: string; accent: string }[] = [
    { name: 'Lutfiya Miller', displayName: 'Dr. Lutfiya Miller', accent: 'border-violet-500' },
    { name: 'Chris Müller', displayName: 'Chris Müller', accent: 'border-blue-500' },
];

/** Check if item was created in the last 24 hours. */
function isNewItem(createdAt: string): boolean {
    return Date.now() - new Date(createdAt).getTime() < 24 * 60 * 60 * 1000;
}

export default function OpenQuestionsPage() {
    const [questions, setQuestions] = useState<OpenQuestion[]>([]);
    const [loading, setLoading] = useState(true);

    // Filters
    const [statusFilter, setStatusFilter] = useState('open');
    const [topicFilter, setTopicFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

    // Expand state
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

    const { t } = useLocale();

    const fetchQuestions = async () => {
        try {
            const params = new URLSearchParams();
            if (statusFilter !== 'all') params.set('status', statusFilter);
            if (search) params.set('search', search);
            params.set('order', sortOrder);
            const qs = params.toString();

            const res = await fetch(`/api/open-questions${qs ? `?${qs}` : ''}`);
            const data = await res.json();
            if (Array.isArray(data)) setQuestions(data);
        } catch {
            // silently fail
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        setLoading(true);
        fetchQuestions();
    }, [statusFilter, search, sortOrder]);

    // Stats
    const stats = useMemo(() => {
        let open = 0;
        let resolved = 0;
        const topicCounts: Record<string, number> = {};

        questions.forEach((q) => {
            if (q.status === 'open') open++;
            if (q.status === 'resolved') resolved++;
            if (q.topic) topicCounts[q.topic] = (topicCounts[q.topic] ?? 0) + 1;
        });

        return { total: questions.length, open, resolved, topicCounts };
    }, [questions]);

    // Unique topic labels for dropdown
    const uniqueTopics = useMemo(() => {
        const topics = new Set<string>();
        for (const q of questions) {
            if (q.topic) topics.add(q.topic);
        }
        return [...topics].sort((a, b) => a.localeCompare(b));
    }, [questions]);

    // Filter by topic (client-side since API doesn't filter resolved+topic combos easily)
    const filteredQuestions = useMemo(() => {
        if (topicFilter === 'all') return questions;
        return questions.filter((q) => q.topic === topicFilter);
    }, [questions, topicFilter]);

    // ── Group by assignee, then sub-group by topic ──
    type TopicGroup = { topic: string; items: OpenQuestion[] };
    const { byAssignee, unassigned } = useMemo(() => {
        const result: Record<string, TopicGroup[]> = {};
        const unassignedItems: OpenQuestion[] = [];

        // Normalize raised_by to an assignee name, or null
        const matchAssignee = (raisedBy: string | null | undefined): string | null => {
            if (!raisedBy) return null;
            const lower = raisedBy.toLowerCase();
            for (const a of ASSIGNEES) {
                const parts = a.name.toLowerCase().split(' ');
                if (parts.some((p) => lower.includes(p))) return a.name;
            }
            return null;
        };

        // Bucket items by assignee
        const buckets: Record<string, OpenQuestion[]> = {};
        for (const a of ASSIGNEES) buckets[a.name] = [];

        for (const q of filteredQuestions) {
            const assigneeName = matchAssignee(q.raised_by);
            if (assigneeName) {
                buckets[assigneeName].push(q);
            } else {
                unassignedItems.push(q);
            }
        }

        // Within each assignee, group by topic
        for (const a of ASSIGNEES) {
            const topicMap = new Map<string, OpenQuestion[]>();
            for (const q of buckets[a.name]) {
                const key = q.topic || 'Uncategorized';
                const arr = topicMap.get(key) ?? [];
                arr.push(q);
                topicMap.set(key, arr);
            }
            result[a.name] = [...topicMap.entries()]
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([topic, items]) => ({ topic, items }));
        }

        // Group unassigned by topic too
        const unassignedTopicMap = new Map<string, OpenQuestion[]>();
        for (const q of unassignedItems) {
            const key = q.topic || 'Uncategorized';
            const arr = unassignedTopicMap.get(key) ?? [];
            arr.push(q);
            unassignedTopicMap.set(key, arr);
        }
        const unassignedGroups = [...unassignedTopicMap.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([topic, items]) => ({ topic, items }));

        return { byAssignee: result, unassigned: unassignedGroups };
    }, [filteredQuestions]);

    // Per-assignee stats
    const perAssigneeStats = useMemo(() => {
        const stats: Record<string, { total: number; open: number; resolved: number }> = {};
        for (const a of ASSIGNEES) {
            const groups = byAssignee[a.name] ?? [];
            let total = 0, open = 0, resolved = 0;
            for (const g of groups) {
                for (const q of g.items) {
                    total++;
                    if (q.status === 'open') open++;
                    if (q.status === 'resolved') resolved++;
                }
            }
            stats[a.name] = { total, open, resolved };
        }
        return stats;
    }, [byAssignee]);

    // Expand/collapse
    const toggleExpand = (id: string) => {
        setExpandedIds((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    /** Toggle status between open and resolved. */
    const handleStatusToggle = async (id: string, currentStatus: string) => {
        const newStatus = currentStatus === 'open' ? 'resolved' : 'open';
        // Optimistic update
        setQuestions((prev) =>
            prev.map((q) => (q.id === id ? { ...q, status: newStatus as OpenQuestion['status'] } : q)),
        );

        try {
            // This will need a PATCH route — for now, just do optimistic
            // TODO: Create PATCH /api/open-questions/[id] route
            await fetch(`/api/open-questions/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus }),
            });
        } catch {
            // Revert on failure
            setQuestions((prev) =>
                prev.map((q) => (q.id === id ? { ...q, status: currentStatus as OpenQuestion['status'] } : q)),
            );
        }
    };

    // Translate question texts
    const allTexts = useMemo(() => questions.map((q) => q.question_text), [questions]);
    const { translated: translatedTexts } = useTranslation(allTexts, { entityType: 'open_question' });
    const textMap = useMemo(() => {
        const map = new Map<string, string>();
        questions.forEach((q, idx) => map.set(q.id, translatedTexts[idx] ?? q.question_text));
        return map;
    }, [questions, translatedTexts]);

    const maxW = 'max-w-7xl'; // wider for dual-column

    return (
        <div className={`${maxW} mx-auto animate-fade-in`}>
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-theme-text-primary tracking-tight">
                        {t('openQuestions.title')}
                    </h1>
                    <p className="text-theme-text-tertiary mt-1">
                        {t('openQuestions.subtitle')}
                    </p>
                </div>
            </div>

            {/* Stats Bar */}
            <div className="glass-card p-4 mb-6 flex flex-wrap items-center gap-4">
                <span className="text-sm font-medium text-theme-text-primary">
                    {stats.total} {stats.total === 1 ? 'question' : 'questions'}
                </span>
                <span className="text-theme-text-muted">·</span>
                <span className="text-xs text-amber-400">{stats.open} open</span>
                {stats.resolved > 0 && (
                    <>
                        <span className="text-theme-text-muted">·</span>
                        <span className="text-xs text-emerald-400">{stats.resolved} resolved</span>
                    </>
                )}
                {Object.keys(stats.topicCounts).length > 0 && (
                    <>
                        <span className="text-theme-text-muted">·</span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                            {Object.entries(stats.topicCounts).map(([topic, count]) => (
                                <span
                                    key={topic}
                                    className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${TOPIC_STYLE[topic] ?? 'bg-theme-bg-muted text-theme-text-muted'}`}
                                >
                                    {topic} {count}
                                </span>
                            ))}
                        </div>
                    </>
                )}
            </div>

            {/* Filter Bar */}
            <div className="glass-card p-4 mb-8 flex flex-wrap items-center gap-3">
                <input
                    type="text"
                    placeholder="Search open questions..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="input-glow border-0 bg-transparent focus:ring-0 text-sm flex-1 min-w-[200px]"
                />
                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg border border-theme-border bg-theme-overlay text-theme-text-secondary cursor-pointer"
                >
                    <option value="open">Open</option>
                    <option value="resolved">Resolved</option>
                    <option value="open,resolved">All Active</option>
                    <option value="all">Everything</option>
                </select>
                {uniqueTopics.length > 0 && (
                    <select
                        value={topicFilter}
                        onChange={(e) => setTopicFilter(e.target.value)}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg border border-theme-border bg-theme-overlay text-theme-text-secondary cursor-pointer"
                    >
                        <option value="all">All Topics</option>
                        {uniqueTopics.map((topic) => (
                            <option key={topic} value={topic}>{topic}</option>
                        ))}
                    </select>
                )}
                <button
                    onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-theme-border text-theme-text-muted hover:text-theme-text-secondary transition-colors whitespace-nowrap cursor-pointer"
                >
                    {sortOrder === 'desc' ? 'Most Recent' : 'Oldest First'}
                </button>
            </div>

            {/* Question Cards */}
            {loading ? (
                <div className="p-12 text-center text-theme-text-tertiary">Loading open questions...</div>
            ) : filteredQuestions.length === 0 ? (
                <div className="glass-card p-12 text-center">
                    <p className="text-theme-text-muted text-lg mb-2">No open questions found</p>
                    <p className="text-theme-text-tertiary text-sm">
                        {statusFilter !== 'all' || topicFilter !== 'all' || search
                            ? 'Try adjusting your filters'
                            : 'Open questions will appear here when meeting transcripts are summarized'}
                    </p>
                </div>
            ) : (
                <>
                    {/* Dual-column grid — one column per assignee */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                        {ASSIGNEES.map((assignee) => {
                            const groups = byAssignee[assignee.name] ?? [];
                            const aStats = perAssigneeStats[assignee.name] ?? { total: 0, open: 0, resolved: 0 };

                            return (
                                <div key={assignee.name} className={`border-t-2 ${assignee.accent} pt-4`}>
                                    {/* Assignee header */}
                                    <div className="flex items-center justify-between mb-4">
                                        <h2 className="text-base font-semibold text-theme-text-primary">
                                            {assignee.displayName}
                                        </h2>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-theme-text-secondary font-medium">
                                                {aStats.total}
                                            </span>
                                            <span className="text-xs text-amber-400">{aStats.open} open</span>
                                            {aStats.resolved > 0 && (
                                                <span className="text-xs text-emerald-400">
                                                    ✅ {aStats.resolved}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Topic sub-groups */}
                                    {groups.length === 0 ? (
                                        <p className="text-xs text-theme-text-muted py-4">No questions</p>
                                    ) : (
                                        <div className="space-y-5">
                                            {groups.map((topicGroup) => (
                                                <div key={topicGroup.topic}>
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${TOPIC_STYLE[topicGroup.topic] ?? 'bg-theme-bg-muted text-theme-text-muted'}`}>
                                                            ▼ {topicGroup.topic}
                                                        </span>
                                                        <span className="text-[10px] text-theme-text-muted">
                                                            {topicGroup.items.length}
                                                        </span>
                                                        <div className="flex-1 border-t border-theme-border/30" />
                                                    </div>
                                                    <div className="space-y-2">
                                                        {topicGroup.items.map((question) => (
                                                            <QuestionCard
                                                                key={question.id}
                                                                question={question}
                                                                isExpanded={expandedIds.has(question.id)}
                                                                onToggleExpand={() => toggleExpand(question.id)}
                                                                onStatusToggle={handleStatusToggle}
                                                                isNew={isNewItem(question.created_at)}
                                                                translatedText={textMap.get(question.id)}
                                                            />
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Unassigned questions */}
                    {unassigned.length > 0 && (
                        <div className="border-t border-theme-border/50 pt-6">
                            <h3 className="text-sm font-semibold text-theme-text-secondary mb-4">Unassigned</h3>
                            <div className="space-y-5">
                                {unassigned.map((topicGroup) => (
                                    <div key={topicGroup.topic}>
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${TOPIC_STYLE[topicGroup.topic] ?? 'bg-theme-bg-muted text-theme-text-muted'}`}>
                                                ▼ {topicGroup.topic}
                                            </span>
                                            <span className="text-[10px] text-theme-text-muted">
                                                {topicGroup.items.length}
                                            </span>
                                            <div className="flex-1 border-t border-theme-border/30" />
                                        </div>
                                        <div className="space-y-2">
                                            {topicGroup.items.map((question) => (
                                                <QuestionCard
                                                    key={question.id}
                                                    question={question}
                                                    isExpanded={expandedIds.has(question.id)}
                                                    onToggleExpand={() => toggleExpand(question.id)}
                                                    onStatusToggle={handleStatusToggle}
                                                    isNew={isNewItem(question.created_at)}
                                                    translatedText={textMap.get(question.id)}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

// ── Question Card Component ────────────────────

interface QuestionCardProps {
    question: OpenQuestion;
    isExpanded: boolean;
    onToggleExpand: () => void;
    onStatusToggle: (id: string, currentStatus: string) => void;
    isNew?: boolean;
    translatedText?: string;
}

function QuestionCard({
    question,
    isExpanded,
    onToggleExpand,
    onStatusToggle,
    isNew,
    translatedText,
}: QuestionCardProps) {
    const displayText = translatedText ?? question.question_text;
    const isResolved = question.status === 'resolved';

    return (
        <div
            className={`glass-card p-4 hover:border-brand-400/30 transition-all duration-200 group ${isResolved ? 'opacity-70' : ''}`}
        >
            <div className="flex items-start gap-3">
                {/* Status toggle button */}
                <button
                    onClick={() => onStatusToggle(question.id, question.status)}
                    className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors cursor-pointer ${isResolved
                        ? 'border-emerald-400 bg-emerald-400/20 text-emerald-400'
                        : 'border-amber-400/50 hover:border-amber-400 text-transparent hover:text-amber-400/30'
                        }`}
                    title={isResolved ? 'Mark as open' : 'Mark as resolved'}
                >
                    {isResolved && (
                        <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path d="M2 6l3 3 5-5" />
                        </svg>
                    )}
                </button>

                {/* Content — text spans full width, tags below */}
                <div className="flex-1 min-w-0">
                    <p
                        className={`text-sm leading-relaxed cursor-pointer ${isResolved
                            ? 'text-theme-text-muted line-through'
                            : 'text-theme-text-primary'
                            }`}
                        onClick={onToggleExpand}
                    >
                        {displayText}
                    </p>

                    {/* Metadata row — source transcript, date, status, NEW badge */}
                    <div className="flex items-center gap-2 mt-2 text-[11px] text-theme-text-muted flex-wrap">
                        {question.meeting_title && question.transcript_id && (
                            <Link
                                href={`/transcripts/${question.transcript_id}`}
                                className="text-brand-400/70 hover:text-brand-400 transition-colors truncate max-w-[180px]"
                                title={question.meeting_title}
                            >
                                {question.meeting_title}
                            </Link>
                        )}
                        <span>{new Date(question.created_at).toLocaleDateString()}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_STYLE[question.status] ?? ''}`}>
                            {question.status}
                        </span>
                        {isNew && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-brand-500/15 text-brand-400">
                                NEW
                            </span>
                        )}
                    </div>

                    {/* Expanded details */}
                    {isExpanded && (
                        <div className="mt-3 pt-3 border-t border-theme-border/50 space-y-2 animate-fade-in">
                            {question.context && (
                                <div>
                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-theme-text-tertiary mb-1">Context</p>
                                    <p className="text-xs text-theme-text-secondary leading-relaxed">{question.context}</p>
                                </div>
                            )}
                            {question.source_text && (
                                <div>
                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-theme-text-tertiary mb-1">Source</p>
                                    <p className="text-xs text-theme-text-muted leading-relaxed italic">"{question.source_text}"</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
