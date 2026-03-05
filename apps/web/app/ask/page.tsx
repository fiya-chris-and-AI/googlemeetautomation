'use client';

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import Link from 'next/link';
import type { QueryResponse, SourceChunk } from '@meet-pipeline/shared';

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    sources?: SourceChunk[];
}

const SUGGESTED_QUESTIONS = [
    'What action items came out of last week\'s meetings?',
    'Summarize discussions about project deadlines',
    'What were the key decisions made this month?',
    'What did the team say about budget planning?',
];

/**
 * AI Query page — chat-style interface for asking questions
 * across all meetings with expandable source citations.
 */
export default function AskPage() {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = async (question?: string) => {
        const q = question ?? input.trim();
        if (!q) return;

        const userMsg: ChatMessage = { role: 'user', content: q };
        setMessages((prev) => [...prev, userMsg]);
        setInput('');
        setLoading(true);

        try {
            const res = await fetch('/api/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question: q }),
            });
            const data: QueryResponse = await res.json();

            const assistantMsg: ChatMessage = {
                role: 'assistant',
                content: data.answer,
                sources: data.sources,
            };
            setMessages((prev) => [...prev, assistantMsg]);
        } catch {
            const errorMsg: ChatMessage = {
                role: 'assistant',
                content: 'Sorry, I encountered an error processing your question. Please try again.',
            };
            setMessages((prev) => [...prev, errorMsg]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto animate-fade-in flex flex-col h-[calc(100vh-4rem)]">
            {/* Header */}
            <div className="mb-6">
                <h1 className="text-3xl font-bold text-theme-text-primary tracking-tight">Ask AI</h1>
                <p className="text-theme-text-tertiary mt-1">Query your meeting history with natural language</p>
            </div>

            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto custom-scrollbar mb-4 space-y-4">
                {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                        <div className="w-16 h-16 rounded-2xl bg-brand-500/10 flex items-center justify-center mb-6">
                            <span className="text-3xl">◈</span>
                        </div>
                        <h2 className="text-lg font-semibold text-theme-text-primary mb-2">
                            Ask anything about your meetings
                        </h2>
                        <p className="text-sm text-theme-text-tertiary mb-8 max-w-md">
                            I can search through all your transcripts and provide answers with citations to the original meetings.
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
                            {SUGGESTED_QUESTIONS.map((q) => (
                                <button
                                    key={q}
                                    onClick={() => handleSend(q)}
                                    className="text-left text-sm p-3 rounded-xl bg-theme-overlay border border-theme-border
                             text-theme-text-secondary hover:text-theme-text-primary hover:bg-theme-muted transition-all duration-200"
                                >
                                    {q}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div
                            className={`max-w-[80%] rounded-2xl px-5 py-3 ${msg.role === 'user'
                                ? 'bg-brand-500/20 text-theme-text-primary rounded-br-md'
                                : 'glass-card rounded-bl-md'
                                }`}
                        >
                            {msg.role === 'user' ? (
                                <p className="text-sm whitespace-pre-wrap text-theme-text-primary">{msg.content}</p>
                            ) : (
                                <div className="text-sm text-theme-text-primary prose prose-invert prose-sm max-w-none
                                    prose-headings:text-theme-text-primary prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-1
                                    prose-p:my-1 prose-p:leading-relaxed
                                    prose-li:my-0.5 prose-li:text-theme-text-secondary
                                    prose-strong:text-theme-text-primary prose-strong:font-semibold
                                    prose-ul:my-1 prose-ol:my-1">
                                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                                </div>
                            )}

                            {/* Source Citations */}
                            {msg.sources && msg.sources.length > 0 && (
                                <div className="mt-3 pt-3 border-t border-theme-border">
                                    <p className="text-[10px] text-theme-text-tertiary uppercase tracking-wider mb-2">
                                        Sources ({msg.sources.length})
                                    </p>
                                    <div className="space-y-1.5">
                                        {msg.sources.map((s) => (
                                            <SourceCard key={s.chunk_id} source={s} />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                ))}

                {loading && (
                    <div className="flex justify-start">
                        <div className="glass-card rounded-2xl rounded-bl-md px-5 py-3">
                            <div className="flex gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-brand-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                                <div className="w-2 h-2 rounded-full bg-brand-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                                <div className="w-2 h-2 rounded-full bg-brand-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                            </div>
                        </div>
                    </div>
                )}

                <div ref={scrollRef} />
            </div>

            {/* Input Bar */}
            <div className="glass-card p-2 flex gap-2">
                <input
                    id="ask-input"
                    type="text"
                    placeholder="Ask a question about your meetings..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                    disabled={loading}
                    className="flex-1 input-glow border-0 bg-transparent focus:ring-0"
                />
                <button
                    id="ask-send-btn"
                    onClick={() => handleSend()}
                    disabled={loading || !input.trim()}
                    className="btn-primary px-6 py-3"
                >
                    Send
                </button>
            </div>
        </div>
    );
}

function SourceCard({ source }: { source: SourceChunk }) {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="rounded-lg bg-theme-overlay border border-theme-border overflow-hidden">
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full text-left px-3 py-2 flex items-center justify-between hover:bg-theme-muted transition-colors"
            >
                <div>
                    <Link
                        href={`/transcripts/${source.transcript_id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs text-brand-400 hover:text-brand-300 font-medium"
                    >
                        {source.meeting_title}
                    </Link>
                    <p className="text-[10px] text-theme-text-muted">
                        {new Date(source.meeting_date).toLocaleDateString()} · {Math.round(source.similarity * 100)}% match
                    </p>
                </div>
                <span className="text-theme-text-muted text-xs">{expanded ? '▲' : '▼'}</span>
            </button>
            {expanded && (
                <div className="px-3 pb-2 animate-slide-up">
                    <p className="text-xs text-theme-text-secondary whitespace-pre-wrap border-l-2 border-brand-500/30 pl-2">
                        {source.text.length > 300 ? source.text.slice(0, 300) + '...' : source.text}
                    </p>
                </div>
            )}
        </div>
    );
}
