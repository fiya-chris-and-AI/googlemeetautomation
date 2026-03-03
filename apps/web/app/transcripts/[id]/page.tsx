'use client';

import { useState, useEffect, use } from 'react';
import type { MeetingTranscript, QueryResponse } from '@meet-pipeline/shared';

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

/**
 * Transcript Detail — full text, metadata sidebar, and scoped Q&A.
 */
export default function TranscriptDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const resolvedParams = use(params);
    const [transcript, setTranscript] = useState<MeetingTranscript | null>(null);
    const [loading, setLoading] = useState(true);
    const [question, setQuestion] = useState('');
    const [answer, setAnswer] = useState<QueryResponse | null>(null);
    const [asking, setAsking] = useState(false);

    useEffect(() => {
        fetch(`/api/transcripts/${resolvedParams.id}`)
            .then((r) => r.json())
            .then((data: MeetingTranscript) => {
                setTranscript(data);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [resolvedParams.id]);

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
            const data: QueryResponse = await res.json();
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
                    <h1 className="text-2xl font-bold text-theme-text-primary tracking-tight mb-6">
                        {transcript.meeting_title}
                    </h1>

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
                            <div className="mt-4 pt-4 border-t border-theme-border/[0.06]">
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
                <div className="w-72 flex-shrink-0">
                    <div className="glass-card p-6 sticky top-8 space-y-6">
                        <MetaField label="Date" value={new Date(transcript.meeting_date).toLocaleDateString('en-US', {
                            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                        })} />
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
