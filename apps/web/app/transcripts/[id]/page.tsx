'use client';

import { useState, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import type { MeetingTranscript, QueryResponse } from '@meet-pipeline/shared';


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

    const [summary, setSummary] = useState<string | null>(null);
    const [summaryLoading, setSummaryLoading] = useState(false);

    // ── Decision extraction state ────────────────
    const [extractingDecisions, setExtractingDecisions] = useState(false);
    const [decisionResult, setDecisionResult] = useState<string | null>(null);

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


    }, [params.id]);

    useEffect(() => {
        if (!transcript || summary !== null || summaryLoading) return;
        setSummaryLoading(true);

        fetch(`/api/transcripts/${transcript.transcript_id}/summarize`)
            .then((r) => r.json())
            .then((data) => setSummary(data.summary ?? 'Unable to generate summary.'))
            .catch(() => setSummary('Unable to generate summary.'))
            .finally(() => setSummaryLoading(false));
    }, [transcript, summary]);

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

    // Split transcript into lines for rendering
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
                                <div className="text-sm text-theme-text-primary prose prose-invert prose-sm max-w-none
                                    prose-headings:text-theme-text-primary prose-headings:text-sm prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-1
                                    prose-p:my-1 prose-p:leading-relaxed
                                    prose-li:my-0.5 prose-li:text-theme-text-secondary
                                    prose-strong:text-theme-text-primary prose-strong:font-semibold
                                    prose-ul:my-1 prose-ol:my-1">
                                    <ReactMarkdown>{answer.answer}</ReactMarkdown>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Meeting Summary */}
                    <div className="glass-card p-5 mb-6">
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-xs font-medium uppercase tracking-wider text-theme-text-tertiary flex items-center gap-1.5">
                                <span className="text-brand-400">✦</span> Meeting Summary
                            </h2>
                            {summary && !summaryLoading && (
                                <button
                                    onClick={() => { setSummary(null); }}
                                    className="text-[11px] font-medium text-brand-400 hover:text-brand-300 transition-colors"
                                >
                                    Regenerate
                                </button>
                            )}
                        </div>
                        {summaryLoading ? (
                            <div className="space-y-2">
                                <div className="h-3 bg-theme-border/30 rounded animate-pulse w-full" />
                                <div className="h-3 bg-theme-border/30 rounded animate-pulse w-5/6" />
                                <div className="h-3 bg-theme-border/30 rounded animate-pulse w-4/6" />
                            </div>
                        ) : summary ? (
                            <div className="text-sm text-theme-text-secondary leading-relaxed prose prose-invert prose-sm max-w-none
                                            prose-headings:text-theme-text-primary prose-headings:text-base prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-2
                                            prose-p:my-1.5 prose-p:leading-relaxed
                                            prose-li:my-0.5 prose-li:text-theme-text-secondary
                                            prose-strong:text-theme-text-primary prose-strong:font-semibold
                                            prose-ul:my-1.5 prose-ol:my-1.5">
                                <ReactMarkdown>{summary}</ReactMarkdown>
                            </div>
                        ) : null}
                    </div>

                    {/* Transcript Text */}
                    <div className="glass-card p-6 font-sans text-[0.9rem] leading-[1.85] custom-scrollbar max-h-[calc(100vh-300px)] overflow-y-auto">
                        {lines.map((line, i) => {
                            const trimmed = line.trim();

                            // Detect timestamp lines like [00:01:28]
                            const timestampMatch = trimmed.match(/^\[(\d[\d:]+)\](.*)/);
                            if (timestampMatch) {
                                const timestamp = timestampMatch[1];
                                const afterTimestamp = timestampMatch[2]?.trim() ?? '';

                                // Check if there's a speaker name after the timestamp
                                const speaker = transcript.participants.find((p) =>
                                    afterTimestamp.startsWith(`${p}:`) || afterTimestamp.startsWith(`${p} -`) || afterTimestamp.startsWith(`${p} –`)
                                );

                                if (speaker) {
                                    const colorClass = 'text-brand-400';
                                    const speakerEnd = afterTimestamp.indexOf(speaker) + speaker.length;
                                    const rest = afterTimestamp.substring(speakerEnd).replace(/^[:\s–-]+/, ' ');

                                    return (
                                        <div key={i} className="mb-4">
                                            <span className="font-mono text-[0.7rem] text-theme-text-muted">[{timestamp}]</span>
                                            <p className="mt-0.5">
                                                <span className={`font-semibold ${colorClass}`}>{speaker}</span>
                                                <span className="text-theme-text-primary">{rest}</span>
                                            </p>
                                        </div>
                                    );
                                }

                                // Timestamp line without a recognized speaker
                                return (
                                    <div key={i} className="mb-4">
                                        <span className="font-mono text-[0.7rem] text-theme-text-muted">[{timestamp}]</span>
                                        {afterTimestamp && (
                                            <p className="text-theme-text-primary mt-0.5">{afterTimestamp}</p>
                                        )}
                                    </div>
                                );
                            }

                            // Non-timestamp line: check for speaker
                            const speaker = transcript.participants.find((p) =>
                                trimmed.startsWith(`${p}:`) || trimmed.startsWith(`${p} -`) || trimmed.startsWith(`${p} –`)
                            );

                            if (speaker) {
                                const colorClass = 'text-brand-400';
                                const prefix = line.substring(0, line.indexOf(speaker) + speaker.length);
                                const rest = line.substring(prefix.length);

                                return (
                                    <p key={i} className="mb-4">
                                        <span className={`font-semibold ${colorClass}`}>{prefix}</span>
                                        <span className="text-theme-text-primary">{rest}</span>
                                    </p>
                                );
                            }

                            return (
                                <p key={i} className="text-theme-text-primary mb-1">
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

                        {/* Extract Decisions */}
                        <div className="pt-2 border-t border-theme-border">
                            <button
                                id="extract-decisions-btn"
                                onClick={async () => {
                                    setExtractingDecisions(true);
                                    setDecisionResult(null);
                                    try {
                                        const res = await fetch('/api/decisions/extract', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ transcript_id: transcript.transcript_id }),
                                        });
                                        const data = await res.json();
                                        if (!res.ok) {
                                            setDecisionResult(`Error: ${data.error}`);
                                        } else {
                                            setDecisionResult(`Extracted ${data.count} decision${data.count !== 1 ? 's' : ''}`);
                                        }
                                    } catch {
                                        setDecisionResult('Extraction failed');
                                    } finally {
                                        setExtractingDecisions(false);
                                    }
                                }}
                                disabled={extractingDecisions}
                                className="w-full px-3 py-2 text-sm font-medium rounded-lg
                                           bg-accent-violet/20 text-accent-violet
                                           hover:bg-accent-violet/30 transition-colors
                                           disabled:opacity-50"
                            >
                                {extractingDecisions ? 'Extracting...' : '✦ Extract Decisions'}
                            </button>
                            {decisionResult && (
                                <p className={`text-xs mt-2 ${decisionResult.startsWith('Error') ? 'text-rose-400' : 'text-emerald-400'}`}>
                                    {decisionResult}
                                </p>
                            )}
                        </div>

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
