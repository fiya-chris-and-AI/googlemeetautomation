'use client';

import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import Link from 'next/link';
import type { MeetingTranscript, QueryResponse, ActionItem, ActivityLogEntry, ScoreboardMetrics, CumulativeStats, SourceType } from '@meet-pipeline/shared';
import { UploadModal } from '../components/upload-modal';
import { useLocale } from '../lib/locale';
import { useTranslation } from '../lib/use-translation';

/**
 * Dashboard Home — summary stats, recent transcripts, and a query bar.
 */
export default function DashboardPage() {
    const { t, locale } = useLocale();
    const [transcripts, setTranscripts] = useState<MeetingTranscript[]>([]);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState('');
    const [answer, setAnswer] = useState<QueryResponse | null>(null);
    const [querying, setQuerying] = useState(false);
    const [actionItems, setActionItems] = useState<ActionItem[]>([]);
    const [activity, setActivity] = useState<ActivityLogEntry[]>([]);
    const [calendarScoreboard, setCalendarScoreboard] = useState<ScoreboardMetrics | null>(null);
    const [calendarCumulative, setCalendarCumulative] = useState<CumulativeStats | null>(null);
    const [transcriptsOpen, setTranscriptsOpen] = useState(true);

    const refreshData = () => {
        fetch('/api/transcripts')
            .then((r) => r.json())
            .then((data) => {
                if (Array.isArray(data)) setTranscripts(data);
                setLoading(false);
            })
            .catch(() => setLoading(false));

        fetch('/api/action-items')
            .then((r) => r.json())
            .then((data) => { if (Array.isArray(data)) setActionItems(data); })
            .catch(() => { });

        fetch('/api/activity?limit=10')
            .then((r) => r.json())
            .then((data) => { if (Array.isArray(data)) setActivity(data); })
            .catch(() => { });

        fetch('/api/calendar')
            .then((r) => r.json())
            .then((data) => {
                if (data?.scoreboard) setCalendarScoreboard(data.scoreboard);
                if (data?.cumulative) setCalendarCumulative(data.cumulative);
            })
            .catch(() => { });
    };

    useEffect(() => { refreshData(); }, []);

    const handleSearch = async () => {
        if (!query.trim()) return;
        setQuerying(true);
        try {
            const res = await fetch('/api/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question: query }),
            });
            const data: QueryResponse = await res.json();
            setAnswer(data);
        } catch {
            // Error handled silently in UI
        } finally {
            setQuerying(false);
        }
    };

    const handleStatusChange = async (id: string, newStatus: ActionItem['status']) => {
        try {
            const res = await fetch(`/api/action-items/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus }),
            });
            const updated = (await res.json()) as ActionItem;
            setActionItems((prev) => prev.map((item) => (item.id === id ? updated : item)));
        } catch {
            // Silently fail — item stays in current state
        }
    };

    const openItems = actionItems.filter((i) => i.status === 'open' || i.status === 'in_progress');

    // Lock/archive stats
    const lockedCount = actionItems.filter(i => i.is_locked).length;
    const expiringSoonCount = actionItems.filter(i => {
        if (i.is_locked || i.archived_at) return false;
        const deadline = new Date(i.created_at).getTime() + 24 * 60 * 60 * 1000;
        const remaining = deadline - Date.now();
        return remaining > 0 && remaining < 2 * 60 * 60 * 1000; // less than 2 hours
    }).length;

    // Stats
    const totalTranscripts = transcripts.length;
    const now = new Date();
    const thisWeek = transcripts.filter((t) => {
        const d = new Date(t.meeting_date);
        const diff = now.getTime() - d.getTime();
        return diff < 7 * 24 * 60 * 60 * 1000;
    }).length;
    const thisMonth = transcripts.filter((t) => {
        const d = new Date(t.meeting_date);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;

    // Most frequent participants
    const participantCounts = new Map<string, number>();
    transcripts.forEach((t) =>
        t.participants.forEach((p) => participantCounts.set(p, (participantCounts.get(p) ?? 0) + 1))
    );
    const topParticipants = [...participantCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    const recent = transcripts.slice(0, 10);

    // Translate transcript titles when locale is 'de'
    const recentTitles = recent.map((tr) => tr.meeting_title);
    const { translated: translatedTitles } = useTranslation(recentTitles, { entityType: 'transcript' });

    // Translate open action item titles shown on the dashboard
    const openItemTitles = openItems.map((i) => i.title);
    const { translated: translatedItemTitles } = useTranslation(openItemTitles, { entityType: 'action_item' });
    const itemTitleMap = new Map<string, string>();
    openItems.forEach((item, idx) => itemTitleMap.set(item.id, translatedItemTitles[idx] ?? item.title));

    return (
        <div className="max-w-6xl mx-auto animate-fade-in">
            {/* Header */}
            <div className="mb-8 flex items-start justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-theme-text-primary tracking-tight">{t('dashboard.title')}</h1>
                    <p className="text-theme-text-tertiary mt-1">{t('dashboard.subtitle')}</p>
                </div>
                <UploadModal onSuccess={() => refreshData()} />
            </div>

            {/* Query Bar */}
            <div className="mb-8">
                <div className="glass-card p-2 flex gap-2">
                    <input
                        id="dashboard-search"
                        type="text"
                        placeholder={t('dashboard.search.placeholder')}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        className="flex-1 input-glow border-0 bg-transparent focus:ring-0"
                    />
                    <button
                        id="dashboard-search-btn"
                        onClick={handleSearch}
                        disabled={querying}
                        className="btn-primary px-6 py-3"
                    >
                        {querying ? t('dashboard.search.loading') : t('dashboard.search.button')}
                    </button>
                </div>

                {answer && (
                    <div className="glass-card p-6 mt-4 animate-slide-up">
                        <div className="text-sm text-theme-text-primary prose prose-invert prose-sm max-w-none
                            prose-headings:text-theme-text-primary prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-1
                            prose-p:my-1 prose-p:leading-relaxed
                            prose-li:my-0.5 prose-li:text-theme-text-secondary
                            prose-strong:text-theme-text-primary prose-strong:font-semibold
                            prose-ul:my-1 prose-ol:my-1">
                            <ReactMarkdown>{answer.answer}</ReactMarkdown>
                        </div>
                        {answer.sources.length > 0 && (
                            <div className="mt-4 pt-4 border-t border-theme-border">
                                <p className="text-xs text-theme-text-tertiary mb-2">{t('dashboard.sources')} ({answer.sources.length})</p>
                                <div className="space-y-2">
                                    {answer.sources.map((s) => (
                                        <Link
                                            key={s.chunk_id}
                                            href={`/transcripts/${s.transcript_id}`}
                                            className="block text-xs text-brand-400 hover:text-brand-300 transition-colors"
                                        >
                                            {s.meeting_title} — {new Date(s.meeting_date).toLocaleDateString(locale === 'de' ? 'de-DE' : 'en-US')}
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
                <StatCard label={t('dashboard.stat.total')} value={totalTranscripts} color="from-brand-500 to-brand-600" loading={loading} />
                <StatCard label={t('dashboard.stat.week')} value={thisWeek} color="from-accent-teal to-emerald-500" loading={loading} />
                <StatCard label={t('dashboard.stat.month')} value={thisMonth} color="from-accent-violet to-purple-500" loading={loading} />
                <StatCard
                    label="WhatsApp Sessions"
                    value={transcripts.filter(tr => tr.extraction_method === 'whatsapp' || (tr as MeetingTranscript & { source_type?: SourceType }).source_type === 'whatsapp').length}
                    color="from-green-500 to-emerald-500"
                    loading={loading}
                />
            </div>

            {/* Lock/Archive status badges */}
            {(lockedCount > 0 || expiringSoonCount > 0) && (
                <div className="flex flex-wrap items-center gap-3 mb-8">
                    {expiringSoonCount > 0 && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-400 text-xs font-medium">
                            ⏱ {expiringSoonCount} expiring soon
                        </span>
                    )}
                    {lockedCount > 0 && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 text-xs font-medium">
                            🔒 {lockedCount} locked
                        </span>
                    )}
                </div>
            )}

            {/* This Month at a Glance */}
            <CalendarWidget scoreboard={calendarScoreboard} cumulative={calendarCumulative} />

            {/* Open Action Items Summary */}
            {openItems.length > 0 && (
                <ActionItemsSummary
                    openItems={openItems}
                    onStatusChange={handleStatusChange}
                    titleMap={itemTitleMap}
                />
            )}

            {/* Top Participants */}
            {topParticipants.length > 0 && (
                <div className="glass-card p-6 mb-8">
                    <h2 className="text-sm font-semibold text-theme-text-secondary uppercase tracking-wider mb-4">
                        {t('dashboard.participants.title')}
                    </h2>
                    <div className="flex flex-wrap gap-2">
                        {topParticipants.map(([name, count]) => (
                            <span key={name} className="badge-info">
                                {name} ({count})
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Recent Transcripts — collapsible */}
            <div className="glass-card overflow-hidden">
                <button
                    onClick={() => setTranscriptsOpen((v) => !v)}
                    className="w-full flex items-center justify-between px-8 py-5 border-b border-theme-border
                               hover:bg-theme-muted transition-colors cursor-pointer"
                >
                    <h2 className="text-sm font-semibold text-theme-text-secondary uppercase tracking-wider">
                        {t('dashboard.transcripts.title')}
                        {!loading && <span className="ml-2 text-theme-text-muted font-normal normal-case tracking-normal">({recent.length})</span>}
                    </h2>
                    <span
                        className="text-xs text-theme-text-muted transition-transform duration-200"
                        style={{ display: 'inline-block', transform: transcriptsOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
                    >
                        &#9654;
                    </span>
                </button>
                {transcriptsOpen && (
                    <>
                        {loading ? (
                            <div className="px-8 py-12 text-center text-theme-text-tertiary">{t('dashboard.transcripts.loading')}</div>
                        ) : recent.length === 0 ? (
                            <div className="px-8 py-12 text-center text-theme-text-tertiary">
                                {t('dashboard.transcripts.empty')}
                            </div>
                        ) : (
                            <div className="divide-y divide-theme-border">
                                {recent.map((tr, idx) => (
                                    <Link
                                        key={tr.transcript_id}
                                        href={`/transcripts/${tr.transcript_id}`}
                                        className="block flex items-center justify-between px-8 py-4
                                                   border-b border-theme-border last:border-b-0
                                                   hover:bg-[rgb(var(--color-muted))] transition-colors duration-150 cursor-pointer"
                                    >
                                        <div className="min-w-0 flex-1 mr-4">
                                            <p className="text-sm font-medium text-theme-text-primary truncate max-w-xs sm:max-w-sm md:max-w-md">{translatedTitles[idx] ?? tr.meeting_title}</p>
                                            <p className="text-xs text-theme-text-tertiary mt-0.5">
                                                {new Date(tr.meeting_date).toLocaleDateString(locale === 'de' ? 'de-DE' : 'en-US')} · {tr.participants.length} {t('dashboard.transcripts.participants')}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs text-theme-text-tertiary">{tr.word_count.toLocaleString()} {t('dashboard.transcripts.words')}</p>
                                            <span className={`text-[10px] font-medium ${tr.extraction_method === 'inline' ? 'text-brand-400' :
                                                tr.extraction_method === 'google_doc' ? 'text-accent-teal' :
                                                    tr.extraction_method === 'upload' ? 'text-emerald-400' : 'text-accent-violet'
                                                }`}>
                                                {tr.extraction_method}
                                            </span>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Activity Feed */}
            {activity.length > 0 && (
                <div className="glass-card overflow-hidden mt-8">
                    <div className="p-6 border-b border-theme-border">
                        <h2 className="text-sm font-semibold text-theme-text-secondary uppercase tracking-wider">
                            {t('dashboard.activity.title')}
                        </h2>
                    </div>
                    <div className="divide-y divide-theme-border">
                        {activity.map((entry) => (
                            <div key={entry.id} className="px-6 py-3 flex items-start gap-3">
                                <span className={`mt-1 inline-block w-2 h-2 rounded-full flex-shrink-0 ${entry.event_type.includes('created') ? 'bg-emerald-500' :
                                    entry.event_type.includes('updated') ? 'bg-brand-400' :
                                        entry.event_type.includes('processed') ? 'bg-accent-teal' : 'bg-theme-text-muted'
                                    }`} />
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm text-theme-text-primary">{entry.summary}</p>
                                    <p className="text-xs text-theme-text-muted mt-0.5">
                                        {new Date(entry.created_at).toLocaleString()}
                                        {entry.actor && entry.actor !== 'system' && ` · ${entry.actor}`}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function StatCard({ label, value, color, loading }: {
    label: string;
    value: number;
    color: string;
    loading: boolean;
}) {
    return (
        <div className="stat-card">
            {/* Accent bar handled by .stat-card::before in CSS */}
            <p className="text-xs text-theme-text-tertiary font-medium uppercase tracking-wider">{label}</p>
            <p className="text-3xl font-bold text-theme-text-primary mt-2">
                {loading ? '—' : value}
            </p>
        </div>
    );
}

function ActionItemsSummary({ openItems, onStatusChange, titleMap }: {
    openItems: ActionItem[];
    onStatusChange: (id: string, status: ActionItem['status']) => void;
    titleMap: Map<string, string>;
}) {
    const { t } = useLocale();
    const assigneeCounts = new Map<string, number>();
    openItems.forEach((i) => {
        const key = i.assigned_to ?? 'Unassigned';
        assigneeCounts.set(key, (assigneeCounts.get(key) ?? 0) + 1);
    });

    const now = new Date();
    const overdueCount = openItems.filter(
        (i) => i.due_date && new Date(i.due_date) < now
    ).length;

    const urgentItems = openItems
        .filter((i) => i.priority === 'urgent' || i.priority === 'high')
        .slice(0, 3);

    return (
        <div className="glass-card p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-theme-text-secondary uppercase tracking-wider">
                    {t('dashboard.actions.title')}
                </h2>
                <Link
                    href="/action-items"
                    className="text-xs text-brand-400 hover:text-brand-300 transition-colors font-medium"
                >
                    {t('dashboard.actions.viewAll')}
                </Link>
            </div>

            <div className="flex flex-wrap items-center gap-3 mb-4">
                {[...assigneeCounts.entries()].map(([name, count]) => (
                    <span key={name} className="badge-info">
                        {name}: {count}
                    </span>
                ))}
                {overdueCount > 0 && (
                    <span className="badge-error">
                        {overdueCount} {t('dashboard.actions.overdue')}
                    </span>
                )}
            </div>

            {urgentItems.length > 0 && (
                <div className="space-y-2">
                    {urgentItems.map((item) => (
                        <div key={item.id} className="flex items-center gap-2">
                            <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${item.priority === 'urgent' ? 'bg-rose-500' : 'bg-amber-500'
                                }`} />
                            <p className="text-sm text-theme-text-primary truncate flex-1">{titleMap.get(item.id) ?? item.title}</p>
                            {item.assigned_to && (
                                <span className="text-xs text-theme-text-tertiary flex-shrink-0">{item.assigned_to}</span>
                            )}
                            <button
                                onClick={() => onStatusChange(item.id, item.status === 'open' ? 'in_progress' : 'done')}
                                className="px-2.5 py-0.5 text-[11px] rounded-lg bg-brand-500/10 text-brand-400 hover:bg-brand-500/20 transition-colors flex-shrink-0"
                            >
                                {item.status === 'open' ? t('dashboard.actions.start') : t('dashboard.actions.done')}
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function CalendarWidget({ scoreboard, cumulative }: {
    scoreboard: ScoreboardMetrics | null;
    cumulative: CumulativeStats | null;
}) {
    const { t } = useLocale();
    if (!scoreboard) return null;

    return (
        <div className="glass-card p-5 mb-8">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-sm font-semibold text-theme-text-secondary uppercase tracking-wider mb-2">
                        {t('dashboard.calendar.title')}
                    </h2>
                    <p className="text-sm text-theme-text-primary">
                        <span className="font-semibold text-brand-400">{scoreboard.totalMeetings}</span> {t('dashboard.calendar.meetings')}
                        {' · ~'}<span className="font-semibold text-accent-teal">{scoreboard.totalHours.toFixed(1)}h</span> {t('dashboard.calendar.total')}
                        {' · '}<span className="font-semibold text-accent-violet">{scoreboard.topicsDiscussed.length}</span> {t('dashboard.calendar.topics')}
                        {' · '}<span className="font-semibold text-emerald-400">{scoreboard.actionItemCompletionRate}%</span> {t('dashboard.calendar.completion')}
                    </p>
                    {cumulative && (
                        <p className="text-xs text-theme-text-tertiary mt-1.5">
                            {t('dashboard.calendar.allTime')} <span className="font-medium text-theme-text-secondary">{cumulative.totalMeetings}</span> {t('dashboard.calendar.meetings')}
                            {' · ~'}<span className="font-medium text-theme-text-secondary">{cumulative.totalHours.toFixed(1)}h</span>
                            {' · '}<span className="font-medium text-theme-text-secondary">{cumulative.totalActionItems}</span> {t('dashboard.calendar.actionItems')}
                            {' · '}<span className="font-medium text-theme-text-secondary">{cumulative.averageMeetingsPerMonth.toFixed(1)}</span>{t('dashboard.calendar.monthAvg')}
                        </p>
                    )}
                </div>
                <Link
                    href="/calendar"
                    className="text-xs text-brand-400 hover:text-brand-300 transition-colors font-medium whitespace-nowrap ml-4"
                >
                    {t('dashboard.calendar.viewCalendar')}
                </Link>
            </div>
        </div>
    );
}
