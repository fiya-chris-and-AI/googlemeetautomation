'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import type { Decision, DecisionDomain, DecisionConfidence, DecisionStatus } from '@meet-pipeline/shared';
import { useTranslation } from '../../lib/use-translation';
import { LockButton } from '../../components/lock-button';
import { TTLBadge } from '../../components/ttl-badge';

// ── Domain badge color map ──────────────────────
const DOMAIN_STYLE: Record<DecisionDomain, string> = {
    architecture: 'bg-accent-violet/20 text-accent-violet',
    product: 'badge-info',
    business: 'badge-warning',
    design: 'bg-pink-500/20 text-pink-400',
    infrastructure: 'badge-success',
    operations: 'bg-accent-teal/20 text-accent-teal',
    general: 'bg-theme-bg-muted text-theme-text-muted',
};

const DOMAIN_LABELS: DecisionDomain[] = [
    'architecture', 'product', 'business', 'design',
    'infrastructure', 'operations', 'general',
];

const CONFIDENCE_DOT: Record<DecisionConfidence, string> = {
    high: 'bg-emerald-400',
    medium: 'bg-amber-400',
    low: 'bg-rose-400',
};

const STATUS_STYLE: Record<DecisionStatus, { badge: string; strike: boolean }> = {
    active: { badge: 'badge-success', strike: false },
    superseded: { badge: 'bg-theme-bg-muted text-theme-text-muted', strike: true },
    reversed: { badge: 'badge-error', strike: false },
    under_review: { badge: 'badge-warning', strike: false },
    completed: { badge: 'bg-blue-500/20 text-blue-400', strike: false },
    archived: { badge: 'bg-theme-bg-muted text-theme-text-muted', strike: false },
};

const STATUS_LABELS: { value: string; label: string }[] = [
    { value: 'active', label: 'Active' },
    { value: 'completed', label: 'Completed' },
    { value: 'superseded', label: 'Superseded' },
    { value: 'reversed', label: 'Reversed' },
    { value: 'under_review', label: 'Under Review' },
    { value: 'all', label: 'All' },
];

/** Strip repetitive "We decided to…" style prefixes for cleaner display. */
function stripDecisionPrefix(text: string): string {
    return text.replace(
        /^(we decided (to |that )?|we agreed (to |that )?|the team (decided|agreed) (to |that )?)/i,
        '',
    ).replace(/^./, c => c.toUpperCase()); // Capitalize first letter after strip
}

/** Returns true if the item was created within the last 24 hours. */
function isNewItem(createdAt: string): boolean {
    const created = new Date(createdAt).getTime();
    const now = Date.now();
    return now - created < 24 * 60 * 60 * 1000;
}

export default function DecisionsPage() {
    const [decisions, setDecisions] = useState<Decision[]>([]);
    const [loading, setLoading] = useState(true);

    // Filters
    const [domainFilter, setDomainFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('active');
    const [confidenceFilter, setConfidenceFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

    // Modal + expand state
    const [showCreate, setShowCreate] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);



    // Create form
    const [newText, setNewText] = useState('');
    const [newContext, setNewContext] = useState('');
    const [newDomain, setNewDomain] = useState<DecisionDomain>('general');
    const [newConfidence, setNewConfidence] = useState<DecisionConfidence>('high');
    const [newDate, setNewDate] = useState(new Date().toISOString().slice(0, 10));

    const fetchDecisions = async () => {
        try {
            const params = new URLSearchParams();
            if (statusFilter !== 'all') params.set('status', statusFilter);
            if (domainFilter !== 'all') params.set('domain', domainFilter);
            if (confidenceFilter !== 'all') params.set('confidence', confidenceFilter);
            if (search) params.set('search', search);
            params.set('order', sortOrder);
            const qs = params.toString();

            const res = await fetch(`/api/decisions${qs ? `?${qs}` : ''}`);
            const data = await res.json();
            if (Array.isArray(data)) setDecisions(data);
        } catch {
            // silently fail
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        setLoading(true);
        fetchDecisions();
    }, [domainFilter, statusFilter, confidenceFilter, search, sortOrder]);

    // Stats
    const stats = useMemo(() => {
        const domainCounts: Partial<Record<DecisionDomain, number>> = {};
        let active = 0;
        let superseded = 0;
        let completed = 0;

        decisions.forEach((d) => {
            domainCounts[d.domain] = (domainCounts[d.domain] ?? 0) + 1;
            if (d.status === 'active') active++;
            if (d.status === 'superseded') superseded++;
            if (d.status === 'completed') completed++;
        });

        return { total: decisions.length, domainCounts, active, superseded, completed };
    }, [decisions]);

    // Split decisions into active (non-completed) and completed lists
    const activeDecisions = useMemo(
        () => decisions.filter((d) => d.status !== 'completed'),
        [decisions],
    );
    const completedDecisions = useMemo(
        () => decisions.filter((d) => d.status === 'completed'),
        [decisions],
    );



    const handleCreate = async () => {
        if (!newText.trim()) return;
        try {
            const res = await fetch('/api/decisions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    decision_text: newText.trim(),
                    context: newContext.trim() || null,
                    domain: newDomain,
                    confidence: newConfidence,
                    decided_at: newDate,
                }),
            });
            const created = await res.json();
            if (created.id) {
                setDecisions((prev) => [created, ...prev]);
                setShowCreate(false);
                setNewText('');
                setNewContext('');
                setNewDomain('general');
                setNewConfidence('high');
                setNewDate(new Date().toISOString().slice(0, 10));
            }
        } catch { /* silently fail */ }
    };

    const handleStatusChange = async (id: string, newStatus: DecisionStatus) => {
        try {
            const res = await fetch(`/api/decisions/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus }),
            });
            const updated = await res.json();
            if (updated.id) {
                setDecisions((prev) => prev.map((d) => (d.id === id ? { ...d, ...updated } : d)));
            }
        } catch { /* keep current state */ }
    };

    /** Optimistic lock/unlock toggle. */
    const handleLockChange = (id: string, locked: boolean) => {
        setDecisions((prev) => prev.map((d) =>
            d.id === id
                ? { ...d, is_locked: locked, locked_by: locked ? 'Lutfiya Miller' : null, locked_at: locked ? new Date().toISOString() : null }
                : d
        ));
    };

    // Translate all decision texts in one batch
    const allTexts = useMemo(() => decisions.map((d) => d.decision_text), [decisions]);
    const { translated: translatedTexts } = useTranslation(allTexts, { entityType: 'decision' });
    const textMap = useMemo(() => {
        const map = new Map<string, string>();
        decisions.forEach((d, idx) => map.set(d.id, translatedTexts[idx] ?? d.decision_text));
        return map;
    }, [decisions, translatedTexts]);

    return (
        <div className="max-w-7xl mx-auto animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-theme-text-primary tracking-tight">Decision Ledger</h1>
                    <p className="text-theme-text-tertiary mt-1">Every decision you&apos;ve made, searchable and surfaced.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowCreate(true)}
                        className="btn-primary px-5 py-2.5"
                    >
                        + Add Decision
                    </button>
                </div>
            </div>



            {/* Stats Bar */}
            <div className="glass-card p-4 mb-6 flex flex-wrap items-center gap-4">
                <span className="text-sm font-medium text-theme-text-primary">{stats.total} decisions</span>
                <span className="text-theme-text-muted">·</span>
                <span className="text-xs text-emerald-400">{stats.active} active</span>
                {stats.completed > 0 && (
                    <>
                        <span className="text-theme-text-muted">·</span>
                        <span className="text-xs text-blue-400">{stats.completed} completed</span>
                    </>
                )}
                {stats.superseded > 0 && (
                    <>
                        <span className="text-theme-text-muted">·</span>
                        <span className="text-xs text-theme-text-muted">{stats.superseded} superseded</span>
                    </>
                )}
                <span className="text-theme-text-muted">·</span>
                <div className="flex items-center gap-1.5 flex-wrap">
                    {DOMAIN_LABELS.map((domain) => {
                        const count = stats.domainCounts[domain];
                        if (!count) return null;
                        return (
                            <span key={domain} className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${DOMAIN_STYLE[domain]}`}>
                                {domain} {count}
                            </span>
                        );
                    })}
                </div>
            </div>

            {/* Filter Bar */}
            <div className="glass-card p-4 mb-8 flex flex-wrap items-center gap-3">
                <input
                    type="text"
                    placeholder="Search decisions..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="input-glow border-0 bg-transparent focus:ring-0 text-sm flex-1 min-w-[200px]"
                />
                <FilterSelect
                    value={domainFilter}
                    onChange={setDomainFilter}
                    options={[
                        { value: 'all', label: 'All Domains' },
                        ...DOMAIN_LABELS.map((d) => ({ value: d, label: d.charAt(0).toUpperCase() + d.slice(1) })),
                    ]}
                />
                <FilterSelect
                    value={statusFilter}
                    onChange={setStatusFilter}
                    options={STATUS_LABELS}
                />
                <FilterSelect
                    value={confidenceFilter}
                    onChange={setConfidenceFilter}
                    options={[
                        { value: 'all', label: 'All Confidence' },
                        { value: 'high', label: 'High' },
                        { value: 'medium', label: 'Medium' },
                        { value: 'low', label: 'Low' },
                    ]}
                />
                <button
                    onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-theme-border text-theme-text-muted hover:text-theme-text-secondary transition-colors whitespace-nowrap"
                >
                    {sortOrder === 'desc' ? '↓ Most Recent' : '↑ Oldest First'}
                </button>
            </div>

            {/* Decision Cards */}
            {loading ? (
                <div className="p-12 text-center text-theme-text-tertiary">Loading decisions...</div>
            ) : decisions.length === 0 ? (
                <div className="glass-card p-12 text-center">
                    <p className="text-theme-text-muted text-lg mb-2">No decisions found</p>
                    <p className="text-theme-text-tertiary text-sm">
                        {statusFilter !== 'all' || domainFilter !== 'all' || search
                            ? 'Try adjusting your filters.'
                            : 'Add a decision manually using the button above, or decisions will be extracted automatically when transcripts are uploaded.'}
                    </p>
                </div>
            ) : (
                <>
                    {/* Active / non-completed decisions */}
                    {activeDecisions.length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {activeDecisions.map((decision) => (
                                <DecisionCard
                                    key={decision.id}
                                    decision={decision}
                                    isExpanded={expandedId === decision.id}
                                    onToggleExpand={() => setExpandedId(expandedId === decision.id ? null : decision.id)}
                                    onStatusChange={handleStatusChange}
                                    onLockChange={handleLockChange}
                                    isNew={isNewItem(decision.created_at)}
                                    translatedText={textMap.get(decision.id)}
                                />
                            ))}
                        </div>
                    )}

                    {/* Completed decisions — separate section */}
                    {completedDecisions.length > 0 && (
                        <div className="mt-10">
                            <div className="flex items-center gap-3 mb-4">
                                <h2 className="text-lg font-semibold text-theme-text-secondary">Completed</h2>
                                <span className="text-xs text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">
                                    {completedDecisions.length}
                                </span>
                                <div className="flex-1 border-t border-theme-border/50" />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 opacity-80">
                                {completedDecisions.map((decision) => (
                                    <DecisionCard
                                        key={decision.id}
                                        decision={decision}
                                        isExpanded={expandedId === decision.id}
                                        onToggleExpand={() => setExpandedId(expandedId === decision.id ? null : decision.id)}
                                        onStatusChange={handleStatusChange}
                                        onLockChange={handleLockChange}
                                        translatedText={textMap.get(decision.id)}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Create Decision Modal */}
            {showCreate && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="glass-card p-6 w-full max-w-lg mx-4 animate-slide-up">
                        <h2 className="text-lg font-semibold text-theme-text-primary mb-4">New Decision</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs text-theme-text-tertiary font-medium uppercase tracking-wider block mb-1">Decision</label>
                                <textarea
                                    value={newText}
                                    onChange={(e) => setNewText(e.target.value)}
                                    className="input-glow w-full text-sm min-h-[80px] resize-y"
                                    placeholder="What was decided?"
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="text-xs text-theme-text-tertiary font-medium uppercase tracking-wider block mb-1">Context</label>
                                <textarea
                                    value={newContext}
                                    onChange={(e) => setNewContext(e.target.value)}
                                    className="input-glow w-full text-sm min-h-[60px] resize-y"
                                    placeholder="What led to this decision? (optional)"
                                />
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <label className="text-xs text-theme-text-tertiary font-medium uppercase tracking-wider block mb-1">Domain</label>
                                    <select
                                        value={newDomain}
                                        onChange={(e) => setNewDomain(e.target.value as DecisionDomain)}
                                        className="input-glow w-full text-sm"
                                    >
                                        {DOMAIN_LABELS.map((d) => (
                                            <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs text-theme-text-tertiary font-medium uppercase tracking-wider block mb-1">Confidence</label>
                                    <select
                                        value={newConfidence}
                                        onChange={(e) => setNewConfidence(e.target.value as DecisionConfidence)}
                                        className="input-glow w-full text-sm"
                                    >
                                        <option value="high">High</option>
                                        <option value="medium">Medium</option>
                                        <option value="low">Low</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs text-theme-text-tertiary font-medium uppercase tracking-wider block mb-1">Date</label>
                                    <input
                                        type="date"
                                        value={newDate}
                                        onChange={(e) => setNewDate(e.target.value)}
                                        className="input-glow w-full text-sm"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <button
                                onClick={() => setShowCreate(false)}
                                className="px-4 py-2 text-sm text-theme-text-secondary hover:text-theme-text-primary transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreate}
                                disabled={!newText.trim()}
                                className="btn-primary px-5 py-2"
                            >
                                Create
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Sub-components ──────────────────────────────

function DecisionCard({
    decision,
    isExpanded,
    onToggleExpand,
    onStatusChange,
    onLockChange,
    isNew = false,
    translatedText,
}: {
    decision: Decision;
    isExpanded: boolean;
    onToggleExpand: () => void;
    onStatusChange: (id: string, status: DecisionStatus) => void;
    onLockChange?: (id: string, locked: boolean) => void;
    isNew?: boolean;
    translatedText?: string;
}) {
    const style = STATUS_STYLE[decision.status] ?? STATUS_STYLE.active;

    // ── Ask AI mini-chat state ──────────────────────
    const [showAskAI, setShowAskAI] = useState(false);
    const [aiQuestion, setAiQuestion] = useState('');
    const [aiMessages, setAiMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
    const [aiLoading, setAiLoading] = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll chat to latest message
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [aiMessages, aiLoading]);

    const handleAskAI = async (question?: string) => {
        const q = question ?? aiQuestion.trim();
        if (!q || !decision.transcript_id) return;

        setAiMessages((prev) => [...prev, { role: 'user', content: q }]);
        setAiQuestion('');
        setAiLoading(true);

        try {
            const res = await fetch('/api/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    question: `${q} — Context: this is about a decision: "${decision.decision_text}"`,
                    transcript_id: decision.transcript_id,
                }),
            });
            const data = await res.json();
            setAiMessages((prev) => [...prev, { role: 'assistant', content: data.answer }]);
        } catch {
            setAiMessages((prev) => [
                ...prev,
                { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' },
            ]);
        } finally {
            setAiLoading(false);
        }
    };

    const suggestedQuestions = [
        'What led to this decision?',
        'Were there alternative options discussed?',
        'Who was involved in making this decision?',
    ];

    return (
        <div className="glass-card p-4 transition-all duration-200 hover:border-theme-border/[0.12]">
            {/* Header — clickable */}
            <div className="flex items-start gap-2 cursor-pointer" onClick={onToggleExpand}>
                {/* Status dot — green pulse for new items, otherwise confidence color */}
                {isNew ? (
                    <span className="relative flex h-2 w-2 shrink-0 mt-1.5" title="New">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                ) : (
                    <span className={`mt-1.5 inline-block w-2 h-2 rounded-full flex-shrink-0 ${CONFIDENCE_DOT[decision.confidence]}`} />
                )}
                <div className="min-w-0 flex-1">
                    {/* Topic pill + short decision text */}
                    <div className="flex items-center gap-2 flex-wrap">
                        {decision.topic && (
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${DOMAIN_STYLE[decision.domain]}`}>
                                {decision.topic}
                            </span>
                        )}
                        <p className={`text-sm text-theme-text-primary ${style.strike ? 'line-through opacity-60' : ''}`}>
                            {stripDecisionPrefix(translatedText ?? decision.decision_text)}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {/* Domain badge (only show if no topic, to avoid redundancy) */}
                        {!decision.topic && (
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${DOMAIN_STYLE[decision.domain]}`}>
                                {decision.domain}
                            </span>
                        )}
                        {/* Status badge */}
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${style.badge}`}>
                            {decision.status.replace('_', ' ')}
                        </span>
                        {/* Date */}
                        <span className="text-[10px] text-theme-text-tertiary">
                            {new Date(decision.decided_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                        <TTLBadge createdAt={decision.created_at} isLocked={decision.is_locked} />
                        {/* Meeting title */}
                        {decision.meeting_title && (
                            <span className="text-[10px] text-theme-text-muted truncate max-w-[200px]">
                                from: {decision.meeting_title}
                            </span>
                        )}
                    </div>
                </div>
                {/* Expand icon */}
                <span
                    className="text-xs text-theme-text-muted transition-transform duration-200 mt-1"
                    style={{ display: 'inline-block', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
                >
                    &#9654;
                </span>
            </div>

            {/* Expanded content */}
            {isExpanded && (
                <div className="mt-4 pt-4 border-t border-theme-border animate-slide-up">
                    {decision.context && (
                        <div className="mb-3">
                            <p className="text-xs text-theme-text-tertiary font-medium uppercase tracking-wider mb-1">Context</p>
                            <p className="text-sm text-theme-text-secondary">{decision.context}</p>
                        </div>
                    )}

                    {decision.source_text && (
                        <div className="mb-3">
                            <p className="text-xs text-theme-text-tertiary font-medium uppercase tracking-wider mb-1">Source</p>
                            <blockquote className="text-sm text-theme-text-muted italic border-l-2 border-brand-500/30 pl-3">
                                {decision.source_text}
                            </blockquote>
                        </div>
                    )}

                    {/* Ask AI button — only when transcript is available */}
                    {decision.transcript_id && (
                        <button
                            onClick={() => setShowAskAI((v) => !v)}
                            className={`mt-3 px-2.5 py-1 text-[11px] font-medium rounded-lg transition-colors ${showAskAI
                                ? 'bg-accent-violet/20 text-accent-violet'
                                : 'bg-accent-violet/10 text-accent-violet hover:bg-accent-violet/20'
                                }`}
                        >
                            ◈ Ask AI
                        </button>
                    )}

                    {/* Inline mini-chat panel */}
                    {showAskAI && decision.transcript_id && (
                        <div className="mt-3 p-3 rounded-xl bg-theme-overlay border border-theme-border">
                            {/* Messages area */}
                            <div className="max-h-[300px] overflow-y-auto custom-scrollbar space-y-2 mb-3">
                                {aiMessages.length === 0 && !aiLoading && (
                                    <div className="space-y-1.5">
                                        <p className="text-[10px] text-theme-text-tertiary uppercase tracking-wider mb-2">
                                            Suggested questions
                                        </p>
                                        {suggestedQuestions.map((q) => (
                                            <button
                                                key={q}
                                                onClick={() => handleAskAI(q)}
                                                className="block w-full text-left text-xs px-3 py-1.5 rounded-lg
                                                           bg-theme-overlay/50 border border-theme-border/[0.04]
                                                           text-theme-text-secondary hover:text-theme-text-primary
                                                           hover:border-theme-border/[0.1] transition-all duration-200"
                                            >
                                                {q}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {aiMessages.map((msg, i) => (
                                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                        <div
                                            className={`max-w-[85%] px-3 py-1.5 text-xs whitespace-pre-wrap ${msg.role === 'user'
                                                ? 'bg-brand-500/15 text-theme-text-primary rounded-xl rounded-br-sm'
                                                : 'glass-card text-theme-text-primary rounded-xl rounded-bl-sm'
                                                }`}
                                        >
                                            {msg.content}
                                        </div>
                                    </div>
                                ))}

                                {aiLoading && (
                                    <div className="flex justify-start">
                                        <div className="glass-card rounded-xl rounded-bl-sm px-3 py-1.5">
                                            <div className="flex gap-1">
                                                <div className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                                                <div className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                                                <div className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div ref={chatEndRef} />
                            </div>

                            {/* Input row */}
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder="Ask about this decision..."
                                    value={aiQuestion}
                                    onChange={(e) => setAiQuestion(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleAskAI()}
                                    disabled={aiLoading}
                                    className="flex-1 input-glow text-xs border-0 bg-transparent focus:ring-0 py-1.5"
                                />
                                <button
                                    onClick={() => handleAskAI()}
                                    disabled={aiLoading || !aiQuestion.trim()}
                                    className="btn-primary px-3 py-1.5 text-xs"
                                >
                                    Send
                                </button>
                            </div>
                        </div>
                    )}

                    {decision.transcript_id && (
                        <Link
                            href={`/transcripts/${decision.transcript_id}`}
                            className="inline-block text-xs text-brand-400 hover:text-brand-300 transition-colors mb-3"
                        >
                            View transcript →
                        </Link>
                    )}

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {decision.status === 'active' && (
                            <>
                                <button
                                    onClick={() => onStatusChange(decision.id, 'completed')}
                                    className="px-2.5 py-1 text-[11px] font-medium rounded-lg border border-blue-500/30 text-blue-400 hover:bg-blue-500/10 transition-colors"
                                >
                                    ✓ Mark Completed
                                </button>
                                <button
                                    onClick={() => onStatusChange(decision.id, 'superseded')}
                                    className="px-2.5 py-1 text-[11px] font-medium rounded-lg border border-theme-border text-theme-text-muted hover:text-theme-text-secondary transition-colors"
                                >
                                    Mark Superseded
                                </button>
                                <button
                                    onClick={() => onStatusChange(decision.id, 'reversed')}
                                    className="px-2.5 py-1 text-[11px] font-medium rounded-lg border border-theme-border text-theme-text-muted hover:text-rose-400 transition-colors"
                                >
                                    Mark Reversed
                                </button>
                                <button
                                    onClick={() => onStatusChange(decision.id, 'under_review')}
                                    className="px-2.5 py-1 text-[11px] font-medium rounded-lg border border-theme-border text-theme-text-muted hover:text-amber-400 transition-colors"
                                >
                                    Under Review
                                </button>
                            </>
                        )}
                        {decision.status !== 'active' && (
                            <button
                                onClick={() => onStatusChange(decision.id, 'active')}
                                className="px-2.5 py-1 text-[11px] font-medium rounded-lg border border-theme-border text-theme-text-muted hover:text-emerald-400 transition-colors"
                            >
                                Reactivate
                            </button>
                        )}
                        {onLockChange && (
                            <LockButton
                                entityType="decision"
                                entityId={decision.id}
                                isLocked={decision.is_locked}
                                lockedBy={decision.locked_by}
                                currentUser="Lutfiya Miller"
                                onLockChange={(locked) => onLockChange(decision.id, locked)}
                            />
                        )}
                    </div>

                </div>
            )}
        </div>
    );
}

/** Reusable filter dropdown — matches the action items page pattern. */
function FilterSelect({
    value,
    onChange,
    options,
}: {
    value: string;
    onChange: (v: string) => void;
    options: { value: string; label: string }[];
}) {
    return (
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="bg-theme-bg-overlay border border-theme-border rounded-lg px-3 py-1.5 text-sm text-theme-text-secondary focus:outline-none focus:border-brand-500/50 transition-colors"
        >
            {options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
            ))}
        </select>
    );
}
