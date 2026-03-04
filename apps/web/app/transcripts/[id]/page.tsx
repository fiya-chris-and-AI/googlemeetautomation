'use client';

import { useState, useEffect, useCallback } from 'react';
import type { MeetingTranscript, QueryResponse, ActionItem } from '@meet-pipeline/shared';

/** Color palette for speaker highlighting. */
const SPEAKER_COLORS = [
    'text-brand-400',
    'text-accent-teal',
    'text-accent-violet',
    'text-accent-amber',
    'text-accent-rose',
    'text-emerald-400',
    'text-sky-400',
    'text-orange-400',
];

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Transcript Detail — full text, editable metadata, and scoped Q&A.
 */
export default function TranscriptDetailPage({
    params,
}: {
    params: { id: string };
}) {
    const [transcript, setTranscript] = useState<MeetingTranscript | null>(null);
    const [loading, setLoading] = useState(true);
    const [question, setQuestion] = useState('');
    const [answer, setAnswer] = useState<QueryResponse | null>(null);
    const [asking, setAsking] = useState(false);
    const [actionItems, setActionItems] = useState<ActionItem[]>([]);
    const [extracting, setExtracting] = useState(false);

    // ── Editing state ────────────────────────────
    const [editingTitle, setEditingTitle] = useState(false);
    const [draftTitle, setDraftTitle] = useState('');
    const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');

    /** Persist a single field update via PATCH. Optimistic UI with rollback. */
    const saveField = useCallback(async (
        field: 'meeting_title' | 'meeting_date',
        value: string,
    ) => {
        if (!transcript) return;

        // Snapshot for rollback
        const prev = { ...transcript };
        setTranscript({ ...transcript, [field]: value });
        setSaveStatus('saving');

        try {
            const res = await fetch(`/api/transcripts/${params.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [field]: value }),
            });
            if (!res.ok) throw new Error('Save failed');
            setSaveStatus('saved');
        } catch {
            // Rollback on failure
            setTranscript(prev);
            setSaveStatus('error');
        } finally {
            setTimeout(() => setSaveStatus('idle'), 2000);
        }
    }, [transcript, params.id]);

    useEffect(() => {
        fetch(`/api/transcripts/${params.id}`)
            .then((r) => r.json() as Promise<MeetingTranscript>)
            .then((data) => {
                setTranscript(data);
                setLoading(false);
            })
            .catch(() => setLoading(false));

        fetch(`/api/action-items?transcript_id=${params.id}`)
            .then((r) => r.json())
            .then((data) => { if (Array.isArray(data)) setActionItems(data); })
            .catch(() => { });
    }, [params.id]);

    const handleAsk = async () => {
        if (!question.trim() || !transcript) return;
        setAsking(true);
        try {
            const res = await fetch('/api/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    question,
                    transcript_id: transcript.transcript_id,
                }),
            });
            const data = (await res.json()) as QueryResponse;
            setAnswer(data);
        } catch {
            // Silently handled
        } finally {
            setAsking(false);
        }
    };

    const handleExtract = async () => {
        if (!transcript) return;
        setExtracting(true);
        try {
            const res = await fetch('/api/action-items/extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ transcript_id: transcript.transcript_id }),
            });
            const data = (await res.json()) as { items?: ActionItem[] };
            if (Array.isArray(data.items)) {
                setActionItems((prev) => [...data.items!, ...prev]);
            }
        } catch {
            // Silently handled
        } finally {
            setExtracting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64 text-theme-text-tertiary">
                Loading transcript...
            </div>
        );
    }

    if (!transcript) {
        return (
            <div className="flex items-center justify-center h-64 text-theme-text-tertiary">
                Transcript not found.
            </div>
        );
    }

    // Build a speaker→color map
    const speakerColorMap = new Map<string, string>();
    transcript.participants.forEach((p, i) => {
        speakerColorMap.set(p, SPEAKER_COLORS[i % SPEAKER_COLORS.length]);
    });

    // Highlight speakers in the transcript text
    const lines = transcript.raw_transcript.split('\n');

    return (
        <div className="max-w-7xl mx-auto animate-fade-in">
            <div className="flex gap-8">
                {/* Main Content */}
                <div className="flex-1 min-w-0">
                    {/* Editable Title */}
                    {editingTitle ? (
                        <input
                            id="edit-title-input"
                            autoFocus
                            value={draftTitle}
                            onChange={(e) => setDraftTitle(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    const trimmed = draftTitle.trim();
                                    if (trimmed && trimmed !== transcript.meeting_title) {
                                        saveField('meeting_title', trimmed);
                                    }
                                    setEditingTitle(false);
                                } else if (e.key === 'Escape') {
                                    setEditingTitle(false);
                                }
                            }}
                            onBlur={() => {
                                const trimmed = draftTitle.trim();
                                if (trimmed && trimmed !== transcript.meeting_title) {
                                    saveField('meeting_title', trimmed);
                                }
                                setEditingTitle(false);
                            }}
                            className="w-full text-2xl font-bold text-theme-text-primary tracking-tight mb-6
                                       bg-transparent border-b-2 border-brand-500/40 outline-none
                                       focus:border-brand-400 transition-colors"
                        />
                    ) : (
                        <h1
                            onClick={() => {
                                setDraftTitle(transcript.meeting_title);
                                setEditingTitle(true);
                            }}
                            className="group text-2xl font-bold text-theme-text-primary tracking-tight mb-6
                                       cursor-pointer hover:text-brand-400 transition-colors"
                            title="Click to edit title"
                        >
                            {transcript.meeting_title}
                            <span className="ml-2 text-theme-text-muted opacity-0 group-hover:opacity-100
                                            transition-opacity text-sm font-normal">✏️</span>
                        </h1>
                    )}

                    {/* Save status indicator */}
                    {saveStatus !== 'idle' && (
                        <p className={`text-xs mb-3 transition-opacity ${saveStatus === 'saving' ? 'text-theme-text-muted' :
                                saveStatus === 'saved' ? 'text-emerald-400' :
                                    'text-rose-400'
                            }`}>
                            {saveStatus === 'saving' ? 'Saving…' :
                                saveStatus === 'saved' ? 'Saved ✓' :
                                    'Error — changes reverted'}
                        </p>
                    )}

                    {/* Scoped Q&A */}
                    <div className="glass-card p-4 mb-6">
                        <div className="flex gap-2">
                            <input
                                id="scoped-question"
                                type="text"
                                placeholder="Ask about this meeting..."
                                value={question}
                                onChange={(e) => setQuestion(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
                                className="flex-1 input-glow border-0 bg-transparent focus:ring-0 text-sm"
                            />
                            <button
                                id="scoped-ask-btn"
                                onClick={handleAsk}
                                disabled={asking}
                                className="px-4 py-2 bg-brand-500/20 text-brand-400 rounded-lg text-sm font-medium
                           hover:bg-brand-500/30 transition-colors disabled:opacity-50"
                            >
                                {asking ? '...' : 'Ask'}
                            </button>
                        </div>
                        {answer && (
                            <div className="mt-4 pt-4 border-t border-theme-border">
                                <p className="text-sm text-theme-text-primary whitespace-pre-wrap">{answer.answer}</p>
                            </div>
                        )}
                    </div>

                    {/* Transcript Text */}
                    <div className="glass-card p-6 font-mono text-sm leading-relaxed custom-scrollbar max-h-[calc(100vh-300px)] overflow-y-auto">
                        {lines.map((line, i) => {
                            // Find if this line starts with a known speaker
                            const speaker = transcript.participants.find((p) =>
                                line.trim().startsWith(`${p}:`) || line.trim().startsWith(`${p} -`) || line.trim().startsWith(`${p} –`)
                            );

                            if (speaker) {
                                const colorClass = speakerColorMap.get(speaker) ?? 'text-theme-text-primary';
                                const prefix = line.substring(0, line.indexOf(speaker) + speaker.length);
                                const rest = line.substring(prefix.length);

                                return (
                                    <p key={i} className="mb-1">
                                        <span className={`font-semibold ${colorClass}`}>{prefix}</span>
                                        <span className="text-theme-text-secondary">{rest}</span>
                                    </p>
                                );
                            }

                            return (
                                <p key={i} className="text-theme-text-secondary mb-1">
                                    {line || '\u00A0'}
                                </p>
                            );
                        })}
                    </div>
                </div>

                {/* Metadata Sidebar */}
                <div className="w-72 flex-shrink-0 space-y-6">
                    <div className="glass-card p-6 sticky top-8 space-y-6">
                        <MetaField label="Date">
                            <input
                                id="edit-date-input"
                                type="date"
                                value={transcript.meeting_date.slice(0, 10)}
                                onChange={(e) => {
                                    if (e.target.value) {
                                        saveField('meeting_date', e.target.value);
                                    }
                                }}
                                className="w-full text-sm text-theme-text-secondary bg-transparent
                                           border border-theme-border rounded-lg px-2 py-1
                                           hover:border-brand-500/40 focus:border-brand-400
                                           focus:outline-none transition-colors cursor-pointer"
                            />
                        </MetaField>
                        <MetaField label="Word Count" value={transcript.word_count.toLocaleString()} />
                        <MetaField label="Extraction Method">
                            <span className={`badge text-xs ${transcript.extraction_method === 'inline' ? 'badge-info' :
                                transcript.extraction_method === 'google_doc' ? 'badge-success' : 'badge-warning'
                                }`}>
                                {transcript.extraction_method}
                            </span>
                        </MetaField>
                        <MetaField label="Processed At" value={new Date(transcript.processed_at).toLocaleString()} />
                        <div>
                            <p className="text-xs text-theme-text-tertiary font-medium uppercase tracking-wider mb-2">
                                Participants ({transcript.participants.length})
                            </p>
                            <div className="space-y-1.5">
                                {transcript.participants.map((p) => (
                                    <div key={p} className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${speakerColorMap.get(p)?.replace('text-', 'bg-') ?? 'bg-theme-text-tertiary'
                                            }`} />
                                        <span className="text-sm text-theme-text-secondary">{p}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Action Items for this transcript */}
                    <div className="glass-card p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <p className="text-xs text-theme-text-tertiary font-medium uppercase tracking-wider">
                                Action Items ({actionItems.filter((i) => i.status !== 'dismissed').length})
                            </p>
                            <button
                                onClick={handleExtract}
                                disabled={extracting}
                                className="text-[11px] font-medium text-brand-400 hover:text-brand-300 transition-colors disabled:opacity-50"
                            >
                                {extracting ? 'Extracting...' : 'Extract with AI'}
                            </button>
                        </div>

                        {actionItems.filter((i) => i.status !== 'dismissed').length === 0 ? (
                            <p className="text-xs text-theme-text-muted">
                                No action items yet. Click &ldquo;Extract with AI&rdquo; to find them.
                            </p>
                        ) : (
                            <div className="space-y-2">
                                {actionItems.filter((i) => i.status !== 'dismissed').map((item) => (
                                    <div key={item.id} className="flex items-start gap-2">
                                        <span className={`mt-1 inline-block w-2 h-2 rounded-full flex-shrink-0 ${item.priority === 'urgent' ? 'bg-rose-500' :
                                            item.priority === 'high' ? 'bg-amber-500' :
                                                item.priority === 'medium' ? 'bg-brand-400' : 'bg-theme-text-muted'
                                            }`} />
                                        <div className="min-w-0 flex-1">
                                            <p className={`text-xs font-medium ${item.status === 'done' ? 'text-theme-text-muted line-through' : 'text-theme-text-primary'
                                                }`}>
                                                {item.title}
                                            </p>
                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                {item.assigned_to && (
                                                    <span className="text-[10px] text-theme-text-tertiary">{item.assigned_to}</span>
                                                )}
                                                <span className={`text-[10px] font-medium ${item.status === 'done' ? 'text-emerald-400' :
                                                    item.status === 'in_progress' ? 'text-brand-400' :
                                                        'text-theme-text-muted'
                                                    }`}>
                                                    {item.status.replace('_', ' ')}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function MetaField({ label, value, children }: {
    label: string;
    value?: string;
    children?: React.ReactNode;
}) {
    return (
        <div>
            <p className="text-xs text-theme-text-tertiary font-medium uppercase tracking-wider mb-1">{label}</p>
            {children ?? <p className="text-sm text-theme-text-secondary">{value}</p>}
        </div>
    );
}
