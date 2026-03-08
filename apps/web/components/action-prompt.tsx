'use client';

import { useState, useEffect } from 'react';

interface ActionPromptProps {
    actionItemId: string;
    actionItemTitle: string;
    autoLoad?: boolean;
}

/**
 * ActionPrompt — generates an AI implementation prompt/suggestion for a given action item.
 * Displays a collapsible section that shows how to approach the task.
 */
export function ActionPrompt({ actionItemId, actionItemTitle, autoLoad = false }: ActionPromptProps) {
    const [prompt, setPrompt] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const generatePrompt = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    question: `Generate a concise implementation prompt for the following action item. Include concrete next steps and any relevant context:\n\nAction Item: "${actionItemTitle}"`,
                }),
            });
            if (!res.ok) throw new Error('Failed to generate prompt');
            const data = await res.json();
            setPrompt(data.answer ?? data.response ?? 'No prompt generated.');
            setIsOpen(true);
        } catch (err) {
            setError('Failed to generate implementation prompt.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (autoLoad && !prompt && !loading) {
            // Don't auto-load to save API calls — show the button instead
        }
    }, [autoLoad, prompt, loading]);

    if (!isOpen && !prompt) {
        return (
            <button
                onClick={generatePrompt}
                disabled={loading}
                className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300
                           transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-1"
            >
                {loading ? (
                    <>
                        <span className="inline-block w-3 h-3 border border-brand-400 border-t-transparent rounded-full animate-spin" />
                        Generating…
                    </>
                ) : (
                    <>
                        <span className="text-sm">💡</span>
                        Generate Implementation Prompt
                    </>
                )}
            </button>
        );
    }

    return (
        <div className="mt-2">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-1.5 text-xs font-medium text-brand-400 hover:text-brand-300 transition-colors"
            >
                <span
                    className="text-[10px] transition-transform duration-200 inline-block"
                    style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
                >
                    &#9654;
                </span>
                💡 Implementation Prompt
            </button>
            {isOpen && (
                <div className="mt-2 p-3 rounded-xl bg-theme-overlay/50 border border-theme-border/[0.06] text-xs text-theme-text-secondary whitespace-pre-wrap">
                    {error ? (
                        <span className="text-rose-400">{error}</span>
                    ) : (
                        prompt
                    )}
                    <button
                        onClick={generatePrompt}
                        disabled={loading}
                        className="mt-2 text-[10px] text-theme-text-muted hover:text-brand-400 transition-colors disabled:opacity-50"
                    >
                        {loading ? 'Regenerating…' : '↻ Regenerate'}
                    </button>
                </div>
            )}
        </div>
    );
}
