'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import type { MeetingTranscript, ActionItem } from '@meet-pipeline/shared';
import { UploadModal } from '../../components/upload-modal';

type SortField = 'meeting_date' | 'meeting_title' | 'word_count';
type SortDirection = 'asc' | 'desc';
type ExtractionState = { status: 'idle' } | { status: 'extracting' } | { status: 'done'; count: number };

/**
 * Transcript Library — filterable, sortable table of all transcripts.
 */
export default function TranscriptsPage() {
    const [transcripts, setTranscripts] = useState<MeetingTranscript[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [participantFilter, setParticipantFilter] = useState('');
    const [sortField, setSortField] = useState<SortField>('meeting_date');
    const [sortDir, setSortDir] = useState<SortDirection>('desc');
    const [extractionStates, setExtractionStates] = useState<Map<string, ExtractionState>>(new Map());
    const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

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

    const handleExtract = async (transcriptId: string) => {
        setExtractionStates((prev) => new Map(prev).set(transcriptId, { status: 'extracting' }));
        try {
            const res = await fetch('/api/action-items/extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ transcript_id: transcriptId }),
            });
            const data = (await res.json()) as { items?: ActionItem[]; count?: number };
            const count = data.count ?? data.items?.length ?? 0;
            setExtractionStates((prev) => new Map(prev).set(transcriptId, { status: 'done', count }));
        } catch {
            setExtractionStates((prev) => new Map(prev).set(transcriptId, { status: 'idle' }));
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
                setTranscripts((prev) => prev.filter((t) => t.transcript_id !== transcriptId));
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
                (t) =>
                    t.meeting_title.toLowerCase().includes(q) ||
                    t.raw_transcript.toLowerCase().includes(q)
            );
        }

        if (participantFilter) {
            const q = participantFilter.toLowerCase();
            result = result.filter((t) =>
                t.participants.some((p) => p.toLowerCase().includes(q))
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
    }, [transcripts, search, participantFilter, sortField, sortDir]);

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

    return (
        <div className="max-w-6xl mx-auto animate-fade-in">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-theme-text-primary tracking-tight">Transcript Library</h1>
                <p className="text-theme-text-tertiary mt-1">{transcripts.length} transcripts indexed</p>
            </div>

            {/* Filters */}
            <div className="flex gap-3 mb-6">
                <input
                    id="transcript-search"
                    type="text"
                    placeholder="Search by keyword..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="input-glow flex-1"
                />
                <input
                    id="participant-filter"
                    type="text"
                    placeholder="Filter by participant..."
                    value={participantFilter}
                    onChange={(e) => setParticipantFilter(e.target.value)}
                    className="input-glow w-64"
                />
                <UploadModal onSuccess={() => refreshTranscripts()} />
            </div>

            {/* Table */}
            <div className="glass-card overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-theme-border">
                            <th
                                onClick={() => toggleSort('meeting_title')}
                                className="text-left px-6 py-3 text-xs font-semibold text-theme-text-tertiary uppercase tracking-wider cursor-pointer hover:text-theme-text-primary transition-colors"
                            >
                                Title{sortIndicator('meeting_title')}
                            </th>
                            <th
                                onClick={() => toggleSort('meeting_date')}
                                className="text-left px-6 py-3 text-xs font-semibold text-theme-text-tertiary uppercase tracking-wider cursor-pointer hover:text-theme-text-primary transition-colors"
                            >
                                Date{sortIndicator('meeting_date')}
                            </th>
                            <th className="text-left px-6 py-3 text-xs font-semibold text-theme-text-tertiary uppercase tracking-wider">
                                Participants
                            </th>
                            <th
                                onClick={() => toggleSort('word_count')}
                                className="text-right px-6 py-3 text-xs font-semibold text-theme-text-tertiary uppercase tracking-wider cursor-pointer hover:text-theme-text-primary transition-colors"
                            >
                                Words{sortIndicator('word_count')}
                            </th>
                            <th className="text-right px-6 py-3 text-xs font-semibold text-theme-text-tertiary uppercase tracking-wider">
                                Method
                            </th>
                            <th className="text-right px-6 py-3 text-xs font-semibold text-theme-text-tertiary uppercase tracking-wider">
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={6} className="px-6 py-12 text-center text-theme-text-tertiary">
                                    Loading transcripts...
                                </td>
                            </tr>
                        ) : filtered.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-6 py-12 text-center text-theme-text-tertiary">
                                    {search || participantFilter
                                        ? 'No transcripts match your filters.'
                                        : 'No transcripts yet.'}
                                </td>
                            </tr>
                        ) : (
                            filtered.map((t) => (
                                <tr key={t.transcript_id} className="table-row">
                                    <td className="px-6 py-4">
                                        <Link
                                            href={`/transcripts/${t.transcript_id}`}
                                            className="text-sm font-medium text-theme-text-primary hover:text-brand-400 transition-colors"
                                        >
                                            {t.meeting_title}
                                        </Link>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-theme-text-secondary">
                                        {new Date(t.meeting_date).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-wrap gap-1">
                                            {t.participants.slice(0, 3).map((p) => (
                                                <span key={p} className="badge-info text-[10px]">{p}</span>
                                            ))}
                                            {t.participants.length > 3 && (
                                                <span className="badge text-[10px] text-theme-text-tertiary">
                                                    +{t.participants.length - 3}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-theme-text-secondary text-right">
                                        {t.word_count.toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <span className={`badge text-[10px] ${t.extraction_method === 'inline' ? 'badge-info' :
                                            t.extraction_method === 'google_doc' ? 'badge-success' :
                                                t.extraction_method === 'upload' ? 'badge-success' : 'badge-warning'
                                            }`}>
                                            {t.extraction_method}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <ExtractButton
                                                state={extractionStates.get(t.transcript_id) ?? { status: 'idle' }}
                                                onExtract={() => handleExtract(t.transcript_id)}
                                            />
                                            <button
                                                onClick={() => handleDelete(t.transcript_id)}
                                                disabled={deletingIds.has(t.transcript_id)}
                                                className={`px-2.5 py-1 text-[11px] font-medium rounded-lg transition-colors disabled:opacity-50 ${confirmDeleteId === t.transcript_id
                                                    ? 'bg-rose-500/20 text-rose-400 ring-1 ring-rose-500/30'
                                                    : 'text-theme-text-muted hover:text-rose-400 hover:bg-rose-500/10'
                                                    }`}
                                            >
                                                {deletingIds.has(t.transcript_id)
                                                    ? '...'
                                                    : confirmDeleteId === t.transcript_id
                                                        ? 'Confirm?'
                                                        : 'Delete'}
                                            </button>
                                        </div>
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

function ExtractButton({ state, onExtract }: {
    state: ExtractionState;
    onExtract: () => void;
}) {
    if (state.status === 'extracting') {
        return (
            <span className="px-2.5 py-1 text-[11px] font-medium text-brand-400 opacity-70">
                Extracting...
            </span>
        );
    }

    if (state.status === 'done') {
        return (
            <span className="px-2.5 py-1 text-[11px] font-medium text-emerald-400">
                {state.count} found
            </span>
        );
    }

    return (
        <button
            onClick={onExtract}
            className="px-2.5 py-1 text-[11px] font-medium text-brand-400 hover:bg-brand-500/10 rounded-lg transition-colors"
        >
            Extract AI
        </button>
    );
}
