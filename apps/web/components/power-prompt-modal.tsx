'use client';

import { useState } from 'react';

export interface PowerPromptData {
    prompt: string;
    itemCount: number;
    categories: string[];
    warnings: string[];
    model: string;
    generatedAt: string;
    unifiedPromptId: string | null;
    /** The titles of the selected action items for task chips. */
    itemTitles?: string[];
}

interface PowerPromptModalProps {
    isOpen: boolean;
    onClose: () => void;
    data: PowerPromptData;
    /** Called when user wants to clear selection and close modal. */
    onClearSelection?: () => void;
}

/**
 * Modal for displaying and copying a combined Power Prompt.
 *
 * Features:
 * - Category badges and item count
 * - Task chips showing selected item titles
 * - Scrollable prompt display
 * - Copy to clipboard with visual feedback
 * - Feedback (useful / not useful)
 * - Export as Markdown
 * - Warnings display (if any)
 */
export function PowerPromptModal({ isOpen, onClose, data, onClearSelection }: PowerPromptModalProps) {
    const [copied, setCopied] = useState(false);
    const [feedback, setFeedback] = useState<'useful' | 'not_useful' | null>(null);
    const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);

    if (!isOpen) return null;

    const copyToClipboard = async () => {
        try {
            await navigator.clipboard.writeText(data.prompt);
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        } catch {
            // Fallback for non-HTTPS contexts
            const ta = document.createElement('textarea');
            ta.value = data.prompt;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        }
    };

    const handleCopyAndClear = async () => {
        await copyToClipboard();
        // Small delay so the user sees the "Copied" feedback
        setTimeout(() => {
            onClearSelection?.();
        }, 500);
    };

    const handleFeedback = async (value: 'useful' | 'not_useful') => {
        if (!data.unifiedPromptId || feedbackSubmitting) return;
        setFeedbackSubmitting(true);
        try {
            await fetch(`/api/action-items/unified-prompt/${data.unifiedPromptId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ feedback: value }),
            });
            setFeedback(value);
        } catch { /* silently fail */ }
        setFeedbackSubmitting(false);
    };

    const exportAsMarkdown = () => {
        const blob = new Blob([data.prompt], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `power-prompt-${new Date().toISOString().slice(0, 10)}.md`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const promptLines = data.prompt.split('\n');

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="glass-card p-0 w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col animate-slide-up">
                {/* Header */}
                <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-theme-border">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                            <span className="text-lg">⚡</span>
                            <h2 className="text-xl font-bold text-theme-text-primary">
                                Power Prompt
                            </h2>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-lg bg-brand-500/15 text-brand-400">
                                {data.itemCount} item{data.itemCount !== 1 ? 's' : ''} combined
                            </span>
                            {data.categories.map((cat) => (
                                <span
                                    key={cat}
                                    className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20"
                                >
                                    {cat}
                                </span>
                            ))}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="ml-4 p-1.5 text-theme-text-muted hover:text-theme-text-primary transition-colors rounded-lg hover:bg-theme-overlay"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Task chips — scrollable row of selected item titles */}
                {data.itemTitles && data.itemTitles.length > 0 && (
                    <div className="px-6 py-2.5 border-b border-theme-border flex items-center gap-2 overflow-x-auto custom-scrollbar">
                        <span className="text-[10px] text-theme-text-muted uppercase tracking-wider font-semibold shrink-0">Tasks:</span>
                        {data.itemTitles.map((title, i) => (
                            <span
                                key={i}
                                className="inline-flex items-center px-2 py-1 text-[10px] font-medium rounded-lg
                                           bg-theme-overlay border border-theme-border text-theme-text-secondary
                                           whitespace-nowrap shrink-0"
                            >
                                {title.length > 40 ? `${title.slice(0, 40)}…` : title}
                            </span>
                        ))}
                    </div>
                )}

                {/* Warnings (if any) */}
                {data.warnings.length > 0 && (
                    <div className="px-6 py-3 bg-amber-500/5 border-b border-amber-500/10">
                        {data.warnings.map((w, i) => (
                            <p key={i} className="text-[11px] text-amber-400 flex items-start gap-1.5">
                                <span className="mt-0.5">⚠</span>
                                <span>{w}</span>
                            </p>
                        ))}
                    </div>
                )}

                {/* Metadata bar */}
                <div className="flex items-center gap-3 px-6 py-2.5 border-b border-theme-border bg-theme-overlay/30">
                    <span className="text-[10px] text-theme-text-muted uppercase tracking-wider font-semibold">
                        Model: {data.model}
                    </span>
                    <span className="text-theme-text-muted text-[10px]">·</span>
                    <span className="text-[10px] text-theme-text-muted">
                        {new Date(data.generatedAt).toLocaleString()}
                    </span>
                    <span className="text-theme-text-muted text-[10px]">·</span>
                    <span className="text-[10px] text-theme-text-muted">
                        {promptLines.length} lines
                    </span>
                </div>

                {/* Prompt body — scrollable */}
                <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-4">
                    <pre className="text-xs text-theme-text-secondary whitespace-pre-wrap font-mono leading-relaxed">
                        {data.prompt}
                    </pre>
                </div>

                {/* Action bar */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-theme-border bg-theme-overlay/20">
                    <div className="flex items-center gap-3">
                        {/* Feedback buttons */}
                        {data.unifiedPromptId && (
                            <div className="flex items-center gap-1.5">
                                <button
                                    onClick={() => handleFeedback('useful')}
                                    disabled={feedback !== null || feedbackSubmitting}
                                    className={`px-2.5 py-1 text-xs rounded-lg transition-all ${feedback === 'useful'
                                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                            : feedback !== null
                                                ? 'opacity-40 text-theme-text-muted cursor-not-allowed'
                                                : 'text-theme-text-muted hover:bg-theme-overlay hover:text-emerald-400'
                                        }`}
                                >
                                    {feedback === 'useful' ? '✓ Useful' : '👍'}
                                </button>
                                <button
                                    onClick={() => handleFeedback('not_useful')}
                                    disabled={feedback !== null || feedbackSubmitting}
                                    className={`px-2.5 py-1 text-xs rounded-lg transition-all ${feedback === 'not_useful'
                                            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                            : feedback !== null
                                                ? 'opacity-40 text-theme-text-muted cursor-not-allowed'
                                                : 'text-theme-text-muted hover:bg-theme-overlay hover:text-rose-400'
                                        }`}
                                >
                                    {feedback === 'not_useful' ? '✓ Not Useful' : '👎'}
                                </button>
                            </div>
                        )}
                        {/* Export */}
                        <button
                            onClick={exportAsMarkdown}
                            className="px-3 py-1.5 text-xs text-theme-text-muted hover:text-theme-text-secondary transition-colors hover:bg-theme-overlay rounded-lg"
                        >
                            ↓ Export .md
                        </button>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm text-theme-text-secondary hover:text-theme-text-primary transition-colors"
                        >
                            Close
                        </button>
                        <button
                            onClick={handleCopyAndClear}
                            className={`px-5 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${copied
                                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                    : 'btn-primary'
                                }`}
                        >
                            {copied ? '✓ Copied' : 'Copy & Clear Selection'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
