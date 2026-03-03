'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { MeetingTranscript, QueryResponse } from '@meet-pipeline/shared';

/**
 * Dashboard Home — summary stats, recent transcripts, and a query bar.
 */
export default function DashboardPage() {
    const [transcripts, setTranscripts] = useState<MeetingTranscript[]>([]);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState('');
    const [answer, setAnswer] = useState<QueryResponse | null>(null);
    const [querying, setQuerying] = useState(false);

    useEffect(() => {
        fetch('/api/transcripts')
            .then((r) => r.json())
            .then((data: MeetingTranscript[]) => {
                setTranscripts(data);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

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

    return (
        <div className="max-w-6xl mx-auto animate-fade-in">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-theme-text-primary tracking-tight">Dashboard</h1>
                <p className="text-theme-text-tertiary mt-1">Your meeting transcript overview</p>
            </div>

            {/* Query Bar */}
            <div className="mb-8">
                <div className="glass-card p-2 flex gap-2">
                    <input
                        id="dashboard-search"
                        type="text"
                        placeholder="Ask a question about your meetings..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        className="flex-1 input-glow border-0 bg-transparent focus:ring-0"
                    />
                    <button
                        id="dashboard-search-btn"
                        onClick={handleSearch}
                        disabled={querying}
                        className="px-6 py-3 bg-gradient-to-r from-brand-500 to-brand-600 text-white rounded-xl font-medium text-sm
                       hover:from-brand-400 hover:to-brand-500 transition-all duration-200 disabled:opacity-50
                       shadow-lg shadow-brand-500/20 hover:shadow-brand-500/30"
                    >
                        {querying ? 'Searching...' : 'Ask AI'}
                    </button>
                </div>

                {answer && (
                    <div className="glass-card p-6 mt-4 animate-slide-up">
                        <p className="text-theme-text-primary whitespace-pre-wrap">{answer.answer}</p>
                        {answer.sources.length > 0 && (
                            <div className="mt-4 pt-4 border-t border-theme-border/[0.06]">
                                <p className="text-xs text-theme-text-tertiary mb-2">Sources ({answer.sources.length})</p>
                                <div className="space-y-2">
                                    {answer.sources.map((s) => (
                                        <Link
                                            key={s.chunk_id}
                                            href={`/transcripts/${s.transcript_id}`}
                                            className="block text-xs text-brand-400 hover:text-brand-300 transition-colors"
                                        >
                                            {s.meeting_title} — {new Date(s.meeting_date).toLocaleDateString()}
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <StatCard label="Total Transcripts" value={totalTranscripts} color="from-brand-500 to-brand-600" loading={loading} />
                <StatCard label="This Week" value={thisWeek} color="from-accent-teal to-emerald-500" loading={loading} />
                <StatCard label="This Month" value={thisMonth} color="from-accent-violet to-purple-500" loading={loading} />
            </div>

            {/* Top Participants */}
            {topParticipants.length > 0 && (
                <div className="glass-card p-6 mb-8">
                    <h2 className="text-sm font-semibold text-theme-text-secondary uppercase tracking-wider mb-4">
                        Most Frequent Participants
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

            {/* Recent Transcripts */}
            <div className="glass-card overflow-hidden">
                <div className="px-6 py-4 border-b border-theme-border/[0.06]">
                    <h2 className="text-sm font-semibold text-theme-text-secondary uppercase tracking-wider">
                        Recent Transcripts
                    </h2>
                </div>
                {loading ? (
                    <div className="p-12 text-center text-theme-text-tertiary">Loading...</div>
                ) : recent.length === 0 ? (
                    <div className="p-12 text-center text-theme-text-tertiary">
                        No transcripts yet. Processed emails will appear here.
                    </div>
                ) : (
                    <div className="divide-y divide-theme-border/[0.04]">
                        {recent.map((t) => (
                            <Link
                                key={t.transcript_id}
                                href={`/transcripts/${t.transcript_id}`}
                                className="table-row flex items-center justify-between px-6 py-4"
                            >
                                <div>
                                    <p className="text-sm font-medium text-theme-text-primary">{t.meeting_title}</p>
                                    <p className="text-xs text-theme-text-tertiary mt-0.5">
                                        {new Date(t.meeting_date).toLocaleDateString()} · {t.participants.length} participants
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs text-theme-text-tertiary">{t.word_count.toLocaleString()} words</p>
                                    <span className={`text-[10px] font-medium ${t.extraction_method === 'inline' ? 'text-brand-400' :
                                            t.extraction_method === 'google_doc' ? 'text-accent-teal' : 'text-accent-violet'
                                        }`}>
                                        {t.extraction_method}
                                    </span>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
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
            <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${color} opacity-80`} />
            <p className="text-xs text-theme-text-tertiary font-medium uppercase tracking-wider">{label}</p>
            <p className="text-3xl font-bold text-theme-text-primary mt-2">
                {loading ? '—' : value}
            </p>
        </div>
    );
}
