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

    // Group by meeting transcript
    const groupedByMeeting = useMemo(() => {
        const groups = new Map<string, { title: string; transcriptId: string; items: OpenQuestion[] }>();
        const ungrouped: OpenQuestion[] = [];

        for (const q of filteredQuestions) {
            if (q.transcript_id && q.meeting_title) {
                const existing = groups.get(q.transcript_id);
                if (existing) {
                    existing.items.push(q);
                } else {
                    groups.set(q.transcript_id, {
                        title: q.meeting_title,
                        transcriptId: q.transcript_id,
                        items: [q],
                    });
                }
            } else {
                ungrouped.push(q);
            }
        }

        return { meetings: [...groups.values()], ungrouped };
    }, [filteredQuestions]);

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

    return (
        <div className="max-w-5xl mx-auto animate-fade-in">
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
                <div className="space-y-8">
                    {/* Grouped by meeting */}
                    {groupedByMeeting.meetings.map((meeting) => (
                        <div key={meeting.transcriptId}>
                            {/* Meeting header */}
                            <div className="flex items-center gap-3 mb-4">
                                <Link
                                    href={`/transcripts/${meeting.transcriptId}`}
                                    className="text-sm font-semibold text-brand-400 hover:text-brand-300 transition-colors"
                                >
                                    {meeting.title}
                                </Link>
                                <span className="text-xs text-theme-text-muted bg-theme-bg-muted px-2 py-0.5 rounded-full">
                                    {meeting.items.length}
                                </span>
                                <div className="flex-1 border-t border-theme-border/50" />
                            </div>

                            {/* Question cards for this meeting */}
                            <div className="space-y-3">
                                {meeting.items.map((question) => (
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

                    {/* Ungrouped questions */}
                    {groupedByMeeting.ungrouped.length > 0 && (
                        <div>
                            <div className="flex items-center gap-3 mb-4">
                                <span className="text-sm font-semibold text-theme-text-secondary">Unlinked Questions</span>
                                <span className="text-xs text-theme-text-muted bg-theme-bg-muted px-2 py-0.5 rounded-full">
                                    {groupedByMeeting.ungrouped.length}
                                </span>
                                <div className="flex-1 border-t border-theme-border/50" />
                            </div>
                            <div className="space-y-3">
                                {groupedByMeeting.ungrouped.map((question) => (
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
                    )}
                </div>
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

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                        <p
                            className={`text-sm leading-relaxed cursor-pointer ${isResolved
                                ? 'text-theme-text-muted line-through'
                                : 'text-theme-text-primary'
                                }`}
                            onClick={onToggleExpand}
                        >
                            {displayText}
                        </p>

                        <div className="flex items-center gap-1.5 flex-shrink-0">
                            {isNew && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-brand-500/15 text-brand-400">
                                    NEW
                                </span>
                            )}
                            {question.topic && (
                                <span
                                    className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${TOPIC_STYLE[question.topic] ?? 'bg-theme-bg-muted text-theme-text-muted'}`}
                                >
                                    {question.topic}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Metadata row */}
                    <div className="flex items-center gap-3 mt-2 text-[11px] text-theme-text-muted">
                        {question.raised_by && (
                            <span className="flex items-center gap-1">
                                <span className="text-brand-400">●</span>
                                {question.raised_by}
                            </span>
                        )}
                        <span>{new Date(question.created_at).toLocaleDateString()}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_STYLE[question.status] ?? ''}`}>
                            {question.status}
                        </span>
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
