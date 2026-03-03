'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import type { ActionItem, ActionItemStatus, ActionItemPriority } from '@meet-pipeline/shared';

const COLUMNS: { key: ActionItemStatus; label: string; color: string }[] = [
    { key: 'open', label: 'Open', color: 'from-amber-500 to-amber-600' },
    { key: 'done', label: 'Done', color: 'from-emerald-500 to-emerald-600' },
];

const PRIORITY_DOT: Record<ActionItemPriority, string> = {
    urgent: 'bg-rose-500',
    high: 'bg-amber-500',
    medium: 'bg-brand-400',
    low: 'bg-theme-text-muted',
};

const PRIORITY_LABEL: Record<ActionItemPriority, string> = {
    urgent: 'Urgent',
    high: 'High',
    medium: 'Medium',
    low: 'Low',
};

export default function ActionItemsPage() {
    const [items, setItems] = useState<ActionItem[]>([]);
    const [loading, setLoading] = useState(true);

    // Filters
    const [assigneeFilter, setAssigneeFilter] = useState('all');
    const [priorityFilter, setPriorityFilter] = useState('all');
    const [sourceFilter, setSourceFilter] = useState('all');
    const [search, setSearch] = useState('');

    // Modal state
    const [showCreate, setShowCreate] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    // Create form
    const [newTitle, setNewTitle] = useState('');
    const [newDescription, setNewDescription] = useState('');
    const [newAssignee, setNewAssignee] = useState('');
    const [newPriority, setNewPriority] = useState<ActionItemPriority>('medium');
    const [newDueDate, setNewDueDate] = useState('');

    // Grouping state
    const [viewMode, setViewMode] = useState<'grouped' | 'flat'>('grouped');
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
    const [grouping, setGrouping] = useState(false);
    const [groupError, setGroupError] = useState<string | null>(null);

    const fetchItems = async () => {
        try {
            const r = await fetch('/api/action-items');
            const data = await r.json();
            if (Array.isArray(data)) setItems(data);
        } catch {
            // silently fail
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchItems();
    }, []);

    // Derive unique assignees from data
    const assignees = useMemo(() => {
        const set = new Set<string>();
        items.forEach((i) => { if (i.assigned_to) set.add(i.assigned_to); });
        return [...set].sort();
    }, [items]);

    // Apply filters
    const filtered = useMemo(() => {
        return items.filter((i) => {
            if (i.status === 'dismissed') return false;
            if (assigneeFilter !== 'all' && i.assigned_to !== assigneeFilter) return false;
            if (priorityFilter !== 'all' && i.priority !== priorityFilter) return false;
            if (sourceFilter === 'ai' && i.created_by !== 'ai') return false;
            if (sourceFilter === 'manual' && i.created_by !== 'manual') return false;
            if (search) {
                const q = search.toLowerCase();
                const inTitle = i.title.toLowerCase().includes(q);
                const inDesc = i.description?.toLowerCase().includes(q) ?? false;
                if (!inTitle && !inDesc) return false;
            }
            return true;
        });
    }, [items, assigneeFilter, priorityFilter, sourceFilter, search]);

    // Organize items into groups per column
    const groupedByColumn = useMemo(() => {
        const result: Record<ActionItemStatus, { label: string | null; items: ActionItem[] }[]> = {
            open: [], in_progress: [], done: [], dismissed: [],
        };

        for (const col of COLUMNS) {
            const colItems = filtered.filter(i => i.status === col.key);

            // Bucket items by group_label
            const buckets = new Map<string | null, ActionItem[]>();
            for (const item of colItems) {
                const key = item.group_label ?? null;
                if (!buckets.has(key)) buckets.set(key, []);
                buckets.get(key)!.push(item);
            }

            // Sort: named groups first (alphabetically), then ungrouped (null) last
            const groups = [...buckets.entries()]
                .sort((a, b) => {
                    if (a[0] === null) return 1;
                    if (b[0] === null) return -1;
                    return a[0].localeCompare(b[0]);
                })
                .map(([label, groupItems]) => ({ label, items: groupItems }));

            result[col.key] = groups;
        }

        return result;
    }, [filtered]);

    const toggleGroup = (key: string) => {
        setCollapsedGroups(prev => {
            const next = new Set(prev);
            next.has(key) ? next.delete(key) : next.add(key);
            return next;
        });
    };

    const allGroupKeys = useMemo(() => {
        const keys: string[] = [];
        for (const col of COLUMNS) {
            for (const group of groupedByColumn[col.key]) {
                const label = group.label ?? 'Ungrouped';
                keys.push(`${col.key}::${label}`);
            }
        }
        return keys;
    }, [groupedByColumn]);

    const collapseAll = () => setCollapsedGroups(new Set(allGroupKeys));
    const expandAll = () => setCollapsedGroups(new Set());

    const updateStatus = async (id: string, status: ActionItemStatus) => {
        try {
            const res = await fetch(`/api/action-items/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status }),
            });
            const updated = (await res.json()) as ActionItem;
            if (updated.id) {
                setItems((prev) => prev.map((item) => (item.id === id ? updated : item)));
            }
        } catch { /* keep current state */ }
    };

    const dismissItem = async (id: string) => {
        try {
            const res = await fetch(`/api/action-items/${id}`, { method: 'DELETE' });
            const updated = (await res.json()) as ActionItem;
            if (updated.id) {
                setItems((prev) => prev.map((item) => (item.id === id ? updated : item)));
            }
        } catch { /* keep current state */ }
    };

    const handleCreate = async () => {
        if (!newTitle.trim()) return;
        try {
            const res = await fetch('/api/action-items', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: newTitle.trim(),
                    description: newDescription.trim() || null,
                    assigned_to: newAssignee || null,
                    priority: newPriority,
                    due_date: newDueDate || null,
                    created_by: 'manual',
                }),
            });
            const created = (await res.json()) as ActionItem;
            if (created.id) {
                setItems((prev) => [created, ...prev]);
                setShowCreate(false);
                setNewTitle('');
                setNewDescription('');
                setNewAssignee('');
                setNewPriority('medium');
                setNewDueDate('');
            }
        } catch { /* silently fail */ }
    };

    const handleSmartGroup = async () => {
        setGrouping(true);
        setGroupError(null);
        try {
            const res = await fetch('/api/action-items/group', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ force: true }),
            });
            const result = await res.json();

            if (!res.ok) {
                setGroupError(result.error || 'Grouping failed');
                console.error('[Smart Group] API error:', result);
                return;
            }

            console.log(`[Smart Group] Grouped ${result.updated} items`);
            await fetchItems();
        } catch (err) {
            setGroupError('Network error — could not reach grouping API');
            console.error('[Smart Group] Error:', err);
        } finally {
            setGrouping(false);
        }
    };

    const handleGroupLabelSave = async (id: string, newLabel: string) => {
        const trimmed = newLabel.trim() || null;
        const item = items.find(i => i.id === id);
        if (!item || item.group_label === trimmed) return;

        try {
            const res = await fetch(`/api/action-items/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ group_label: trimmed }),
            });
            const updated = (await res.json()) as ActionItem;
            if (updated.id) {
                setItems((prev) => prev.map((i) => (i.id === id ? updated : i)));
            }
        } catch { /* keep current state */ }
    };

    const isOverdue = (item: ActionItem) => {
        if (!item.due_date || item.status === 'done') return false;
        return new Date(item.due_date) < new Date();
    };

    return (
        <div className="max-w-7xl mx-auto animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-theme-text-primary tracking-tight">Action Items</h1>
                    <p className="text-theme-text-tertiary mt-1">Track and manage tasks from your meetings</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleSmartGroup}
                        disabled={grouping}
                        className="px-5 py-2.5 bg-gradient-to-r from-accent-violet to-purple-600 text-white rounded-xl font-medium text-sm
                           hover:from-accent-violet/90 hover:to-purple-500 transition-all duration-200
                           shadow-lg shadow-accent-violet/20 hover:shadow-accent-violet/30 disabled:opacity-50"
                    >
                        {grouping ? 'Grouping...' : '\u2726 Smart Group'}
                    </button>
                    <button
                        onClick={() => setShowCreate(true)}
                        className="px-5 py-2.5 bg-gradient-to-r from-brand-500 to-brand-600 text-white rounded-xl font-medium text-sm
                           hover:from-brand-400 hover:to-brand-500 transition-all duration-200
                           shadow-lg shadow-brand-500/20 hover:shadow-brand-500/30"
                    >
                        + Add Item
                    </button>
                </div>
            </div>

            {groupError && (
                <p className="text-xs text-rose-400 mt-2">{groupError}</p>
            )}

            {/* Filters Bar */}
            <div className="glass-card p-4 mb-8 flex flex-wrap items-center gap-3">
                <input
                    type="text"
                    placeholder="Search title or description..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="input-glow border-0 bg-transparent focus:ring-0 text-sm flex-1 min-w-[200px]"
                />
                <FilterSelect
                    value={assigneeFilter}
                    onChange={setAssigneeFilter}
                    options={[{ value: 'all', label: 'All Assignees' }, ...assignees.map((a) => ({ value: a, label: a }))]}
                />
                <FilterSelect
                    value={priorityFilter}
                    onChange={setPriorityFilter}
                    options={[
                        { value: 'all', label: 'All Priorities' },
                        { value: 'urgent', label: 'Urgent' },
                        { value: 'high', label: 'High' },
                        { value: 'medium', label: 'Medium' },
                        { value: 'low', label: 'Low' },
                    ]}
                />
                <FilterSelect
                    value={sourceFilter}
                    onChange={setSourceFilter}
                    options={[
                        { value: 'all', label: 'All Sources' },
                        { value: 'ai', label: 'AI Extracted' },
                        { value: 'manual', label: 'Manual' },
                    ]}
                />
                {/* View mode toggle */}
                <div className="flex items-center gap-1 bg-theme-bg-overlay/50 rounded-lg p-0.5">
                    <button
                        onClick={() => setViewMode('grouped')}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${viewMode === 'grouped'
                            ? 'bg-brand-500/20 text-brand-400'
                            : 'text-theme-text-muted hover:text-theme-text-secondary'
                            }`}
                    >
                        Grouped
                    </button>
                    <button
                        onClick={() => setViewMode('flat')}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${viewMode === 'flat'
                            ? 'bg-brand-500/20 text-brand-400'
                            : 'text-theme-text-muted hover:text-theme-text-secondary'
                            }`}
                    >
                        Flat
                    </button>
                </div>
                {viewMode === 'grouped' && allGroupKeys.length > 0 && (
                    <div className="flex items-center gap-1">
                        <button
                            onClick={expandAll}
                            className="px-2.5 py-1 text-xs font-medium text-theme-text-muted hover:text-theme-text-secondary transition-colors"
                        >
                            Expand All
                        </button>
                        <button
                            onClick={collapseAll}
                            className="px-2.5 py-1 text-xs font-medium text-theme-text-muted hover:text-theme-text-secondary transition-colors"
                        >
                            Collapse All
                        </button>
                    </div>
                )}
            </div>

            {/* Kanban Board */}
            {loading ? (
                <div className="p-12 text-center text-theme-text-tertiary">Loading action items...</div>
            ) : (
                <div className="space-y-6">
                    {COLUMNS.map((col) => {
                        const colItems = filtered.filter((i) => i.status === col.key);
                        const groups = groupedByColumn[col.key];
                        return (
                            <div key={col.key}>
                                {/* Section Header */}
                                <div className="glass-card p-4 mb-3 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full bg-gradient-to-r ${col.color}`} />
                                        <h3 className="text-sm font-semibold text-theme-text-primary">{col.label}</h3>
                                    </div>
                                    <span className="text-xs text-theme-text-tertiary font-medium">{colItems.length}</span>
                                </div>

                                {/* Cards — responsive grid */}
                                {colItems.length === 0 ? (
                                    <div className="p-6 text-center text-xs text-theme-text-muted border border-dashed border-theme-border/[0.08] rounded-2xl">
                                        No items
                                    </div>
                                ) : viewMode === 'flat' ? (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {colItems.map((item) => (
                                            <ActionItemCard
                                                key={item.id}
                                                item={item}
                                                isOverdue={isOverdue(item)}
                                                isExpanded={expandedId === item.id}
                                                onToggleExpand={() => setExpandedId(expandedId === item.id ? null : item.id)}
                                                onStatusChange={updateStatus}
                                                onDismiss={dismissItem}
                                                onGroupLabelSave={handleGroupLabelSave}
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {groups.map((group) => {
                                            // Treat null-labelled items the same as named groups
                                            const displayLabel = group.label ?? 'Ungrouped';
                                            const groupKey = `${col.key}::${displayLabel}`;
                                            const isCollapsed = collapsedGroups.has(groupKey);

                                            if (group.label === null) {
                                                // Ungrouped items — render with a collapsible header
                                                return (
                                                    <div key={groupKey} className="border-l-2 border-theme-text-muted/30 rounded-xl overflow-hidden">
                                                        <button
                                                            onClick={() => toggleGroup(groupKey)}
                                                            className="w-full flex items-center justify-between px-4 py-2.5
                                                                bg-theme-bg-overlay/50 hover:bg-theme-bg-overlay/70
                                                                transition-colors cursor-pointer"
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                <span
                                                                    className="text-xs text-theme-text-muted transition-transform duration-200"
                                                                    style={{ display: 'inline-block', transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)' }}
                                                                >
                                                                    &#9654;
                                                                </span>
                                                                <span className="text-sm font-semibold text-theme-text-muted">{displayLabel}</span>
                                                            </div>
                                                            <span className="text-xs text-theme-text-tertiary">{group.items.length}</span>
                                                        </button>
                                                        {!isCollapsed && (
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-2 pt-2">
                                                                {group.items.map((item) => (
                                                                    <ActionItemCard
                                                                        key={item.id}
                                                                        item={item}
                                                                        isOverdue={isOverdue(item)}
                                                                        isExpanded={expandedId === item.id}
                                                                        onToggleExpand={() => setExpandedId(expandedId === item.id ? null : item.id)}
                                                                        onStatusChange={updateStatus}
                                                                        onDismiss={dismissItem}
                                                                        onGroupLabelSave={handleGroupLabelSave}
                                                                    />
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            }

                                            // Named group — uses groupKey and isCollapsed from above

                                            return (
                                                <div key={groupKey} className="border-l-2 border-brand-500/30 rounded-xl overflow-hidden">
                                                    {/* Group header */}
                                                    <button
                                                        onClick={() => toggleGroup(groupKey)}
                                                        className="w-full flex items-center justify-between px-4 py-2.5
                                                            bg-theme-bg-overlay/50 hover:bg-theme-bg-overlay/70
                                                            transition-colors cursor-pointer"
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <span
                                                                className="text-xs text-theme-text-muted transition-transform duration-200"
                                                                style={{ display: 'inline-block', transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)' }}
                                                            >
                                                                &#9654;
                                                            </span>
                                                            <span className="text-sm font-semibold text-theme-text-primary">{group.label}</span>
                                                        </div>
                                                        <span className="text-xs text-theme-text-tertiary">{group.items.length}</span>
                                                    </button>

                                                    {/* Group items — responsive grid inside the group */}
                                                    {!isCollapsed && (
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-2 pt-2">
                                                            {group.items.map((item) => (
                                                                <ActionItemCard
                                                                    key={item.id}
                                                                    item={item}
                                                                    isOverdue={isOverdue(item)}
                                                                    isExpanded={expandedId === item.id}
                                                                    onToggleExpand={() => setExpandedId(expandedId === item.id ? null : item.id)}
                                                                    onStatusChange={updateStatus}
                                                                    onDismiss={dismissItem}
                                                                    onGroupLabelSave={handleGroupLabelSave}
                                                                />
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Create Modal */}
            {showCreate && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="glass-card p-6 w-full max-w-lg mx-4 animate-slide-up">
                        <h2 className="text-lg font-semibold text-theme-text-primary mb-4">New Action Item</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs text-theme-text-tertiary font-medium uppercase tracking-wider block mb-1">Title</label>
                                <input
                                    type="text"
                                    value={newTitle}
                                    onChange={(e) => setNewTitle(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                                    className="input-glow w-full text-sm"
                                    placeholder="What needs to be done?"
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="text-xs text-theme-text-tertiary font-medium uppercase tracking-wider block mb-1">Description</label>
                                <textarea
                                    value={newDescription}
                                    onChange={(e) => setNewDescription(e.target.value)}
                                    className="input-glow w-full text-sm min-h-[80px] resize-y"
                                    placeholder="Additional context (optional)"
                                />
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <label className="text-xs text-theme-text-tertiary font-medium uppercase tracking-wider block mb-1">Assignee</label>
                                    <input
                                        type="text"
                                        value={newAssignee}
                                        onChange={(e) => setNewAssignee(e.target.value)}
                                        className="input-glow w-full text-sm"
                                        placeholder="Name"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-theme-text-tertiary font-medium uppercase tracking-wider block mb-1">Priority</label>
                                    <select
                                        value={newPriority}
                                        onChange={(e) => setNewPriority(e.target.value as ActionItemPriority)}
                                        className="input-glow w-full text-sm"
                                    >
                                        <option value="low">Low</option>
                                        <option value="medium">Medium</option>
                                        <option value="high">High</option>
                                        <option value="urgent">Urgent</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs text-theme-text-tertiary font-medium uppercase tracking-wider block mb-1">Due Date</label>
                                    <input
                                        type="date"
                                        value={newDueDate}
                                        onChange={(e) => setNewDueDate(e.target.value)}
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
                                disabled={!newTitle.trim()}
                                className="px-5 py-2 bg-gradient-to-r from-brand-500 to-brand-600 text-white rounded-xl text-sm font-medium
                                   hover:from-brand-400 hover:to-brand-500 transition-all duration-200 disabled:opacity-50
                                   shadow-lg shadow-brand-500/20"
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

function ActionItemCard({
    item,
    isOverdue,
    isExpanded,
    onToggleExpand,
    onStatusChange,
    onDismiss,
    onGroupLabelSave,
}: {
    item: ActionItem;
    isOverdue: boolean;
    isExpanded: boolean;
    onToggleExpand: () => void;
    onStatusChange: (id: string, status: ActionItemStatus) => void;
    onDismiss: (id: string) => void;
    onGroupLabelSave: (id: string, label: string) => void;
}) {
    const [editGroupLabel, setEditGroupLabel] = useState(item.group_label ?? '');

    // Sync local state when item changes (e.g. after Smart Group)
    useEffect(() => {
        setEditGroupLabel(item.group_label ?? '');
    }, [item.group_label]);

    const transitions: Partial<Record<ActionItemStatus, { label: string; target: ActionItemStatus }[]>> = {
        open: [{ label: 'Done', target: 'done' }],
        done: [{ label: 'Reopen', target: 'open' }],
    };

    return (
        <div className={`glass-card p-4 transition-all duration-200 ${isOverdue ? 'ring-1 ring-rose-500/30' : ''}`}>
            {/* Header */}
            <div className="flex items-start gap-2 cursor-pointer" onClick={onToggleExpand}>
                <span className={`mt-1.5 inline-block w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_DOT[item.priority]}`} />
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-theme-text-primary">{item.title}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {item.assigned_to && (
                            <span className="badge-info text-[10px]">{item.assigned_to}</span>
                        )}
                        <span className={`text-[10px] font-medium ${item.priority === 'urgent' ? 'text-rose-400' :
                            item.priority === 'high' ? 'text-amber-400' :
                                'text-theme-text-muted'
                            }`}>
                            {PRIORITY_LABEL[item.priority]}
                        </span>
                        {item.due_date && (
                            <span className={`text-[10px] ${isOverdue ? 'text-rose-400 font-medium' : 'text-theme-text-muted'}`}>
                                {isOverdue ? 'Overdue · ' : 'Due '}
                                {new Date(item.due_date).toLocaleDateString()}
                            </span>
                        )}
                        {item.created_by === 'ai' && (
                            <span className="text-[10px] text-accent-violet">AI</span>
                        )}
                    </div>
                </div>
            </div>

            {/* Expanded Detail */}
            {isExpanded && (
                <div className="mt-3 pt-3 border-t border-theme-border/[0.06] space-y-3 animate-slide-up">
                    {item.description && (
                        <p className="text-xs text-theme-text-secondary">{item.description}</p>
                    )}
                    {item.source_text && (
                        <div className="bg-theme-muted/30 rounded-lg p-3">
                            <p className="text-[10px] text-theme-text-tertiary uppercase tracking-wider mb-1">Source excerpt</p>
                            <p className="text-xs text-theme-text-secondary italic">&ldquo;{item.source_text}&rdquo;</p>
                        </div>
                    )}
                    {item.transcript_id && (
                        <Link
                            href={`/transcripts/${item.transcript_id}`}
                            className="block text-xs text-brand-400 hover:text-brand-300 transition-colors"
                        >
                            View source transcript &rarr;
                        </Link>
                    )}

                    {/* Group label editor */}
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-theme-text-tertiary uppercase tracking-wider">Group:</span>
                        <input
                            type="text"
                            value={editGroupLabel}
                            onChange={(e) => setEditGroupLabel(e.target.value)}
                            onBlur={() => onGroupLabelSave(item.id, editGroupLabel)}
                            onKeyDown={(e) => e.key === 'Enter' && onGroupLabelSave(item.id, editGroupLabel)}
                            placeholder="Ungrouped"
                            className="text-xs text-theme-text-secondary bg-transparent border-b border-theme-border/[0.1]
                                       focus:border-brand-500/50 focus:outline-none px-1 py-0.5 w-32 transition-colors"
                        />
                    </div>
                </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-theme-border/[0.06]">
                {(transitions[item.status] ?? []).map((t) => (
                    <button
                        key={t.target}
                        onClick={() => onStatusChange(item.id, t.target)}
                        className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-brand-500/10 text-brand-400 hover:bg-brand-500/20 transition-colors"
                    >
                        {t.label}
                    </button>
                ))}
                {item.status !== 'done' && (
                    <button
                        onClick={() => onDismiss(item.id)}
                        className="ml-auto px-2.5 py-1 text-[11px] font-medium rounded-lg text-theme-text-muted hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                    >
                        Dismiss
                    </button>
                )}
            </div>
        </div>
    );
}

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
            className="input-glow text-sm py-2 px-3 border-0 bg-transparent"
        >
            {options.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
        </select>
    );
}
