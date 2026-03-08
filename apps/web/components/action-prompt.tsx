'use client';

import { useState, useEffect, useCallback } from 'react';

interface ActionPromptProps {
    actionItemId: string;
    actionItemTitle: string;
    /** Whether to auto-fetch the prompt on mount */
    autoLoad?: boolean;
}

interface PromptData {
    prompt: string;
    model: string;
    generated_at: string;
    version: number;
    feedback: string | null;
}

/**
 * Action Prompt panel — displays the auto-generated IDE prompt for an action item.
 *
 * Features:
 * - Lazy-loads the prompt on expand (or auto-loads if autoLoad is true)
 * - Copy to clipboard with visual feedback
 * - Regenerate with loading state
 * - Feedback buttons (useful / not useful) for self-improvement
 * - Collapsible prompt body for long prompts
 */
export function ActionPrompt({ actionItemId, actionItemTitle, autoLoad = false }: ActionPromptProps) {
    const [promptData, setPromptData] = useState<PromptData | null>(null);
    const [loading, setLoading] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [copied, setCopied] = useState(false);
    const [feedbackSent, setFeedbackSent] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchPrompt = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/action-items/${actionItemId}/prompt`);
            if (res.ok) {
                const data = await res.json();
                setPromptData(data);
            } else if (res.status === 404) {
                // No prompt yet — this is normal
                setPromptData(null);
            }
        } catch {
            setError('Failed to load prompt');
        } finally {
            setLoading(false);
        }
    }, [actionItemId]);

    useEffect(() => {
        if (autoLoad) fetchPrompt();
    }, [autoLoad, fetchPrompt]);

    const generatePrompt = async (force = false) => {
        setGenerating(true);
        setError(null);
        try {
            const res = await fetch(`/api/action-items/${actionItemId}/prompt`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ force }),
            });
            if (res.ok) {
                const data = await res.json();
                setPromptData(data);
                setFeedbackSent(false);
                setExpanded(true);
            } else {
                const err = await res.json();
                setError(err.error || 'Generation failed');
            }
        } catch {
            setError('Failed to generate prompt');
        } finally {
            setGenerating(false);
        }
    };

    const copyToClipboard = async () => {
        if (!promptData?.prompt) return;
        try {
            await navigator.clipboard.writeText(promptData.prompt);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Fallback for non-HTTPS contexts
            const ta = document.createElement('textarea');
            ta.value = promptData.prompt;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const submitFeedback = async (feedback: 'useful' | 'not_useful') => {
        try {
            const res = await fetch(`/api/action-items/${actionItemId}/prompt`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ feedback }),
            });
            if (res.ok) {
                setPromptData(prev => prev ? { ...prev, feedback } : null);
                setFeedbackSent(true);
            }
        } catch {
            // silently fail
        }
    };

    // If no prompt exists and we haven't tried loading yet, show the generate button
    if (!promptData && !loading && !generating) {
        return (
            <div className="flex items-center gap-2">
                <button
                    onClick={() => generatePrompt()}
                    disabled={generating}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-lg
                               bg-violet-500/10 text-violet-400 hover:bg-violet-500/20
                               border border-violet-500/20 hover:border-violet-500/30
                               transition-all duration-200"
                >
                    <span className="text-xs">⚡</span>
                    Generate Prompt
                </button>
                {error && <span className="text-[10px] text-rose-400">{error}</span>}
            </div>
        );
    }

    // Loading state
    if (loading || generating) {
        return (
            <div className="flex items-center gap-2 py-2">
                <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span className="text-[11px] text-violet-400">
                    {generating ? 'Generating implementation prompt…' : 'Loading prompt…'}
                </span>
            </div>
        );
    }

    if (!promptData) return null;

    // Prompt display
    const promptLines = promptData.prompt.split('\n');
    const isLong = promptLines.length > 12;
    const displayPrompt = expanded || !isLong
        ? promptData.prompt
        : promptLines.slice(0, 8).join('\n') + '\n…';

    return (
        <div className="mt-3 rounded-xl border border-violet-500/20 bg-violet-500/5 overflow-hidden">
            {/* Header bar */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-violet-500/10">
                <div className="flex items-center gap-2">
                    <span className="text-xs">⚡</span>
                    <span className="text-[11px] font-semibold text-violet-400 uppercase tracking-wider">
                        Implementation Prompt
                    </span>
                    <span className="text-[10px] text-theme-text-muted">v{promptData.version}</span>
                </div>
                <div className="flex items-center gap-1.5">
                    {/* Copy button */}
                    <button
                        onClick={copyToClipboard}
                        className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all duration-200
                            ${copied
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : 'bg-theme-overlay text-theme-text-secondary hover:text-violet-400 border border-theme-border hover:border-violet-500/30'
                            }`}
                    >
                        {copied ? '✓ Copied' : 'Copy'}
                    </button>
                    {/* Regenerate button */}
                    <button
                        onClick={() => generatePrompt(true)}
                        disabled={generating}
                        title="Regenerate with improved context"
                        className="px-2 py-1 text-[11px] font-medium rounded-md
                                   bg-theme-overlay text-theme-text-muted hover:text-violet-400
                                   border border-theme-border hover:border-violet-500/30
                                   transition-all duration-200"
                    >
                        ↻
                    </button>
                </div>
            </div>

            {/* Prompt body */}
            <div className="px-3 py-2.5">
                <pre className="text-xs text-theme-text-secondary whitespace-pre-wrap font-mono leading-relaxed max-h-[400px] overflow-y-auto custom-scrollbar">
                    {displayPrompt}
                </pre>
                {isLong && (
                    <button
                        onClick={() => setExpanded(!expanded)}
                        className="mt-2 text-[11px] text-violet-400 hover:text-violet-300 transition-colors"
                    >
                        {expanded ? '▲ Show less' : `▼ Show full prompt (${promptLines.length} lines)`}
                    </button>
                )}
            </div>

            {/* Feedback bar */}
            <div className="flex items-center justify-between px-3 py-2 border-t border-violet-500/10 bg-violet-500/[0.02]">
                <span className="text-[10px] text-theme-text-muted">
                    {feedbackSent
                        ? 'Thanks — feedback will improve the next generation'
                        : 'Was this prompt useful?'
                    }
                </span>
                {!feedbackSent && (
                    <div className="flex items-center gap-1.5">
                        <button
                            onClick={() => submitFeedback('useful')}
                            className={`px-2 py-0.5 text-[10px] rounded-md border transition-all duration-200
                                ${promptData.feedback === 'useful'
                                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                    : 'text-theme-text-muted border-theme-border hover:text-emerald-400 hover:border-emerald-500/30'
                                }`}
                        >
                            👍 Useful
                        </button>
                        <button
                            onClick={() => submitFeedback('not_useful')}
                            className={`px-2 py-0.5 text-[10px] rounded-md border transition-all duration-200
                                ${promptData.feedback === 'not_useful'
                                    ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                                    : 'text-theme-text-muted border-theme-border hover:text-rose-400 hover:border-rose-500/30'
                                }`}
                        >
                            👎 Not useful
                        </button>
                    </div>
                )}
                {feedbackSent && promptData.feedback === 'not_useful' && (
                    <button
                        onClick={() => generatePrompt(true)}
                        disabled={generating}
                        className="px-2.5 py-1 text-[10px] font-medium rounded-md
                                   bg-violet-500/10 text-violet-400 border border-violet-500/20
                                   hover:bg-violet-500/20 transition-all duration-200"
                    >
                        ↻ Regenerate (improved)
                    </button>
                )}
            </div>
        </div>
    );
}
