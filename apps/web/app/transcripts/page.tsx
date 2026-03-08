'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import type { MeetingTranscript } from '@meet-pipeline/shared';
import { UploadModal } from '../../components/upload-modal';
import { useLocale } from '../../lib/locale';

type SortField = 'meeting_date' | 'meeting_title' | 'word_count';
type SortDirection = 'asc' | 'desc';

/**
 * Transcript Library — filterable, sortable table of all transcripts.
 */
export default function TranscriptsPage() {
    const [transcripts, setTranscripts] = useState<MeetingTranscript[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    const [sortField, setSortField] = useState<SortField>('meeting_date');
    const [sortDir, setSortDir] = useState<SortDirection>('desc');
    const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [syncing, setSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<{
        found: number;
        alreadyProcessed: number;
        newlyProcessed: number;
        errors: number;
    } | null>(null);
    const [newSyncedIds, setNewSyncedIds] = useState<Set<string>>(new Set());
    const { t, locale } = useLocale();

    const refreshTranscripts = () => {
        fetch('/api/transcripts')
            .then((r) => r.json())
            .then((data) => {
                setTranscripts(Array.isArray(data) ? data : []);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    };

    useEffect(() => { refreshTranscripts(); }, []);

    const handleSync = async () => {
        setSyncing(true);
        setSyncResult(null);
        setNewSyncedIds(new Set());
        try {
            const res = await fetch('/api/sync', { method: 'POST' });
            const data = await res.json();
            setSyncResult(data);

            // Track which transcripts were just synced so we can show a "new" dot.
            const before = new Set(transcripts.map((tr) => tr.transcript_id));
            const refreshRes = await fetch('/api/transcripts');
            const refreshed = await refreshRes.json();
            const list: MeetingTranscript[] = Array.isArray(refreshed) ? refreshed : [];
            setTranscripts(list);

            const added = new Set(list.filter((tr) => !before.has(tr.transcript_id)).map((tr) => tr.transcript_id));
            setNewSyncedIds(added);
        } catch {
            setSyncResult(null);
        } finally {
            setSyncing(false);
        }
    };

    const handleDelete = async (transcriptId: string) => {
        // Two-click confirmation: first click sets confirmDeleteId, second click executes
        if (confirmDeleteId !== transcriptId) {
            setConfirmDeleteId(transcriptId);
            return;
        }
        setConfirmDeleteId(null);
        setDeletingIds((prev) => new Set(prev).add(transcriptId));
        try {
            const res = await fetch(`/api/transcripts/${transcriptId}`, { method: 'DELETE' });
            if (res.ok) {
                setTranscripts((prev) => prev.filter((tr) => tr.transcript_id !== transcriptId));
            }
        } catch {
            // Silently handled — row stays visible
        } finally {
            setDeletingIds((prev) => {
                const next = new Set(prev);
                next.delete(transcriptId);
                return next;
            });
        }
    };

    const filtered = useMemo(() => {
        let result = transcripts;

        if (search) {
            const q = search.toLowerCase();
            result = result.filter(
                (tr) =>
                    tr.meeting_title.toLowerCase().includes(q) ||
                    tr.raw_transcript.toLowerCase().includes(q)
            );
        }

        result.sort((a, b) => {
            let cmp = 0;
            if (sortField === 'meeting_date') {
                cmp = new Date(a.meeting_date).getTime() - new Date(b.meeting_date).getTime();
            } else if (sortField === 'meeting_title') {
                cmp = a.meeting_title.localeCompare(b.meeting_title);
            } else {
                cmp = a.word_count - b.word_count;
            }
            return sortDir === 'asc' ? cmp : -cmp;
        });

        return result;
    }, [transcripts, search, sortField, sortDir]);

    const toggleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDir('desc');
        }
    };

    const sortIndicator = (field: SortField) =>
        sortField === field ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

    const localeDateStr = locale === 'de' ? 'de-DE' : 'en-US';

    return (
        <div className="max-w-7xl mx-auto animate-fade-in">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-theme-text-primary tracking-tight">{t('transcripts.title')}</h1>
                <p className="text-theme-text-tertiary mt-1">{transcripts.length} {t('transcripts.title').toLowerCase()}</p>
            </div>

            {/* Filters */}
            <div className="flex gap-3 mb-6">
                <input
                    id="transcript-search"
                    type="text"
                    placeholder={t('transcripts.search.placeholder')}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="input-glow flex-1"
                />

                <button
                    id="sync-inbox-btn"
                    onClick={handleSync}
                    disabled={syncing}
                    className="px-4 py-2 text-sm font-medium rounded-lg transition-colors
                               bg-transparent border border-theme-border
                               text-theme-text-primary
                               hover:bg-[rgb(var(--color-muted))]
                               disabled:opacity-50 disabled:cursor-not-allowed
                               whitespace-nowrap"
                >
                    {syncing ? t('transcripts.syncing') : `⟳ ${t('transcripts.sync')}`}
                </button>
                <UploadModal onSuccess={() => refreshTranscripts()} />
            </div>

            {/* Sync result banner */}
            {syncResult && (
                <div className="mb-4 px-4 py-3 rounded-lg border border-theme-border
                                bg-theme-card text-sm text-theme-text-primary
                                flex items-center justify-between">
                    <span>
                        Sync complete — found {syncResult.found} email{syncResult.found !== 1 ? 's' : ''}
                        {syncResult.newlyProcessed > 0
                            ? `, ingested ${syncResult.newlyProcessed} new transcript${syncResult.newlyProcessed !== 1 ? 's' : ''}`
                            : ', no new transcripts'}
                        {syncResult.errors > 0 && `, ${syncResult.errors} error${syncResult.errors !== 1 ? 's' : ''}`}
                    </span>
                    <button
                        onClick={() => { setSyncResult(null); setNewSyncedIds(new Set()); }}
                        className="text-theme-text-muted hover:text-theme-text-primary ml-4 transition-colors"
                    >
                        ✕
                    </button>
                </div>
            )}

            {/* Table */}
            <div className="glass-card overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-theme-border">
                            <th
                                onClick={() => toggleSort('meeting_title')}
                                className="text-left px-6 py-3 text-xs font-semibold text-theme-text-tertiary uppercase tracking-wider cursor-pointer hover:text-theme-text-primary transition-colors"
                            >
                                {t('transcripts.table.title')}{sortIndicator('meeting_title')}
                            </th>
                            <th
                                onClick={() => toggleSort('meeting_date')}
                                className="text-left px-6 py-3 text-xs font-semibold text-theme-text-tertiary uppercase tracking-wider cursor-pointer hover:text-theme-text-primary transition-colors"
                            >
                                {t('transcripts.table.date')}{sortIndicator('meeting_date')}
                            </th>

                            <th
                                onClick={() => toggleSort('word_count')}
                                className="text-right px-6 py-3 text-xs font-semibold text-theme-text-tertiary uppercase tracking-wider cursor-pointer hover:text-theme-text-primary transition-colors"
                            >
                                {t('transcripts.table.words')}{sortIndicator('word_count')}
                            </th>
                            <th className="text-right px-6 py-3 text-xs font-semibold text-theme-text-tertiary uppercase tracking-wider">
                                {t('transcripts.table.source')}
                            </th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-theme-text-tertiary uppercase tracking-wider">
                                {t('transcripts.table.actionItems')}
                            </th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-theme-text-tertiary uppercase tracking-wider">
                                {t('transcripts.table.decisions')}
                            </th>
                            <th className="text-right px-6 py-3 text-xs font-semibold text-theme-text-tertiary uppercase tracking-wider">
                                {t('transcripts.table.actions')}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={7} className="px-6 py-12 text-center text-theme-text-tertiary">
                                    {t('transcripts.loading')}
                                </td>
                            </tr>
                        ) : filtered.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="px-6 py-12 text-center text-theme-text-tertiary">
                                    {search
                                        ? t('transcripts.empty')
                                        : t('transcripts.empty.hint')}
                                </td>
                            </tr>
                        ) : (
                            filtered.map((tr) => (
                                <tr key={tr.transcript_id} className="table-row">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            {newSyncedIds.has(tr.transcript_id) && (
                                                <span className="relative flex h-2 w-2 shrink-0" title="Newly synced">
                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                                                </span>
                                            )}
                                            <Link
                                                href={`/transcripts/${tr.transcript_id}`}
                                                className="text-sm font-medium text-theme-text-primary hover:text-brand-400 transition-colors"
                                            >
                                                {tr.meeting_title}
                                            </Link>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-theme-text-secondary">
                                        {new Date(tr.meeting_date).toLocaleDateString(localeDateStr)}
                                    </td>

                                    <td className="px-6 py-4 text-sm text-theme-text-secondary text-right">
                                        {tr.word_count.toLocaleString(localeDateStr)}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <span className={`badge text-[10px] ${tr.extraction_method === 'inline' ? 'badge-info' :
                                            tr.extraction_method === 'google_doc' ? 'badge-success' :
                                                tr.extraction_method === 'upload' ? 'badge-success' : 'badge-warning'
                                            }`}>
                                            {tr.extraction_method}
                                        </span>
                                    </td>
                                    {/* Action Items column */}
                                    <td className="px-4 py-4">
                                        <ItemPreview
                                            count={tr.action_item_count ?? 0}
                                            titles={tr.action_item_titles ?? []}
                                            color="emerald"
                                        />
                                    </td>
                                    {/* Decisions column */}
                                    <td className="px-4 py-4">
                                        <ItemPreview
                                            count={tr.decision_count ?? 0}
                                            titles={tr.decision_titles ?? []}
                                            color="brand"
                                        />
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button
                                            onClick={() => handleDelete(tr.transcript_id)}
                                            disabled={deletingIds.has(tr.transcript_id)}
                                            className={`px-2.5 py-1 text-[11px] font-medium rounded-lg transition-colors disabled:opacity-50 ${confirmDeleteId === tr.transcript_id
                                                ? 'bg-rose-500/20 text-rose-400 ring-1 ring-rose-500/30'
                                                : 'text-theme-text-muted hover:text-rose-400 hover:bg-rose-500/10'
                                                }`}
                                        >
                                            {deletingIds.has(tr.transcript_id)
                                                ? '...'
                                                : confirmDeleteId === tr.transcript_id
                                                    ? t('transcripts.delete.confirm')
                                                    : t('transcripts.delete')}
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

/**
 * Compact preview of action items or decisions for a transcript row.
 * Shows a count badge and up to 3 truncated titles.
 */
function ItemPreview({ count, titles, color }: {
    count: number;
    titles: string[];
    color: 'emerald' | 'brand';
}) {
    if (count === 0) {
        return (
            <span className="text-[10px] text-theme-text-muted">—</span>
        );
    }

    const badgeClasses = color === 'emerald'
        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
        : 'bg-brand-500/10 text-brand-600 dark:text-brand-400';

    return (
        <div className="space-y-1">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full ${badgeClasses}`}>
                {count}
            </span>
            {titles.length > 0 && (
                <div className="space-y-0.5">
                    {titles.map((title, i) => (
                        <p key={i} className="text-[11px] text-theme-text-muted truncate max-w-[180px]" title={title}>
                            {title.length > 50 ? `${title.slice(0, 50)}…` : title}
                        </p>
                    ))}
                </div>
            )}
        </div>
    );
}
