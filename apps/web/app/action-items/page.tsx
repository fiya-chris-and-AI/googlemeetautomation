'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import type { ActionItem, ActionItemStatus, ActionItemPriority, ActionItemEffort } from '@meet-pipeline/shared';
import { useTranslation } from '../../lib/use-translation';
import { LockButton } from '../../components/lock-button';
import { TTLBadge } from '../../components/ttl-badge';
import { ActionPrompt } from '../../components/action-prompt';

const COLUMNS: { key: ActionItemStatus; label: string; color: string }[] = [
    { key: 'open', label: 'Open', color: 'from-amber-500 to-amber-600' },
    { key: 'done', label: 'Done', color: 'from-emerald-500 to-emerald-600' },
];

const ASSIGNEES: { name: string; displayName: string; accent: string }[] = [
    { name: 'Lutfiya Miller', displayName: 'Dr. Lutfiya Miller', accent: 'border-violet-500' },
    { name: 'Chris Müller', displayName: 'Chris Müller', accent: 'border-blue-500' },
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

const EFFORT_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
    quick_fix: { icon: '⚡', label: 'Quick Fix', color: 'text-emerald-400' },
    moderate: { icon: '🔧', label: 'Moderate', color: 'text-brand-400' },
    significant: { icon: '🏗️', label: 'Significant', color: 'text-amber-400' },
};

/** Returns true if the item was created within the last 24 hours. */
function isNewItem(createdAt: string): boolean {
    const created = new Date(createdAt).getTime();
    const now = Date.now();
    return now - created < 24 * 60 * 60 * 1000;
}

export default function ActionItemsPage() {
    const [items, setItems] = useState<ActionItem[]>([]);
    const [loading, setLoading] = useState(true);

    // Filters
    const [assigneeFilter, setAssigneeFilter] = useState('all');
    const [priorityFilter, setPriorityFilter] = useState('all');
    const [sourceFilter, setSourceFilter] = useState('all');
    const [duplicateFilter, setDuplicateFilter] = useState<'hidden' | 'shown'>('hidden');
    const [search, setSearch] = useState('');
    const [effortFilter, setEffortFilter] = useState('all');
    const [lockFilter, setLockFilter] = useState<'all' | 'locked' | 'unlocked'>('all');

    // Modal state
    const [showCreate, setShowCreate] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    // Create form
    const [newTitle, setNewTitle] = useState('');
    const [newDescription, setNewDescription] = useState('');
    const [newAssignee, setNewAssignee] = useState('');
    const [newPriority, setNewPriority] = useState<ActionItemPriority>('medium');
    const [newEffort, setNewEffort] = useState<ActionItemEffort | ''>('');
    const [newDueDate, setNewDueDate] = useState('');

    // Grouping state
    const [viewMode, setViewMode] = useState<'grouped' | 'flat'>('grouped');
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());


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

    // Apply all filters except lock status (so lock stats stay stable)
    const baseFiltered = useMemo(() => {
        return items.filter((i) => {
            if (i.status === 'dismissed') return false;
            if (i.status === 'archived') return false;
            if (i.archived_at) return false;
            if (duplicateFilter === 'hidden' && i.is_duplicate) return false;
            if (assigneeFilter !== 'all' && i.assigned_to !== assigneeFilter) return false;
            if (priorityFilter !== 'all' && i.priority !== priorityFilter) return false;
            if (effortFilter !== 'all' && i.effort !== effortFilter) return false;
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
    }, [items, assigneeFilter, priorityFilter, effortFilter, sourceFilter, duplicateFilter, search]);

    // Apply lock filter on top of baseFiltered
    const filtered = useMemo(() => {
        if (lockFilter === 'all') return baseFiltered;
        const wantLocked = lockFilter === 'locked';
        return baseFiltered.filter(i => i.is_locked === wantLocked);
    }, [baseFiltered, lockFilter]);

    // Detect shared items — tasks assigned to both people from the same meeting
    const sharedItemIds = useMemo(() => {
        const shared = new Set<string>();
        const lutfiyaItems = items.filter(i => i.assigned_to === 'Lutfiya Miller');
        const chrisItems = items.filter(i => i.assigned_to === 'Chris Müller');
        for (const li of lutfiyaItems) {
            const match = chrisItems.find(ci =>
                ci.title.trim().toLowerCase() === li.title.trim().toLowerCase() &&
                ci.transcript_id === li.transcript_id
            );
            if (match) { shared.add(li.id); shared.add(match.id); }
        }
        return shared;
    }, [items]);

    // ── Lock / archive stats (active items only, excludes done) ──
    const lockStats = useMemo(() => {
        const active = baseFiltered.filter(i => i.status === 'open');
        const done = baseFiltered.filter(i => i.status === 'done').length;
        const locked = active.filter(i => i.is_locked).length;
        const unlocked = active.length - locked;
        const perAssignee: Record<string, { total: number; locked: number; unlocked: number; done: number }> = {};
        for (const a of ASSIGNEES) {
            const assigneeAll = baseFiltered.filter(i => i.assigned_to === a.name);
            const assigneeActive = assigneeAll.filter(i => i.status === 'open');
            const assigneeDone = assigneeAll.filter(i => i.status === 'done').length;
            const aLocked = assigneeActive.filter(i => i.is_locked).length;
            perAssignee[a.name] = { total: assigneeActive.length, locked: aLocked, unlocked: assigneeActive.length - aLocked, done: assigneeDone };
        }
        return { active: active.length, locked, unlocked, subjectToArchive: unlocked, done, perAssignee };
    }, [baseFiltered]);

    // Items with no assignee — shown below both columns
    const unassignedItems = useMemo(() =>
        filtered.filter(i => !i.assigned_to), [filtered]);

    // Organize items by assignee → status → group_label
    const groupedByAssignee = useMemo(() => {
        const result: Record<string, Record<ActionItemStatus, { label: string | null; items: ActionItem[] }[]>> = {};

        for (const assignee of ASSIGNEES) {
            const assigneeItems = filtered.filter(i => i.assigned_to === assignee.name);
            result[assignee.name] = { open: [], in_progress: [], done: [], dismissed: [], archived: [] };

            for (const col of COLUMNS) {
                const colItems = assigneeItems.filter(i => i.status === col.key);

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

                result[assignee.name][col.key] = groups;
            }
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
        for (const assignee of ASSIGNEES) {
            const assigneeGroups = groupedByAssignee[assignee.name];
            if (!assigneeGroups) continue;
            for (const col of COLUMNS) {
                for (const group of assigneeGroups[col.key]) {
                    const label = group.label ?? 'Ungrouped';
                    keys.push(`${assignee.name}::${col.key}::${label}`);
                }
            }
        }
        return keys;
    }, [groupedByAssignee]);

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

    /** Optimistic lock/unlock toggle — updates local state immediately. */
    const handleLockChange = (id: string, locked: boolean) => {
        setItems((prev) => prev.map((item) =>
            item.id === id
                ? { ...item, is_locked: locked, locked_by: locked ? 'Lutfiya Miller' : null, locked_at: locked ? new Date().toISOString() : null }
                : item
        ));
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
                    effort: newEffort || null,
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
                setNewEffort('');
                setNewDueDate('');
            }
        } catch { /* silently fail */ }
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

    // Translate all action item titles in one batch
    const allTitles = useMemo(() => items.map((i) => i.title), [items]);
    const { translated: translatedTitles } = useTranslation(allTitles, { entityType: 'action_item' });
    const titleMap = useMemo(() => {
        const map = new Map<string, string>();
        items.forEach((item, idx) => map.set(item.id, translatedTitles[idx] ?? item.title));
        return map;
    }, [items, translatedTitles]);

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
                        onClick={() => setShowCreate(true)}
                        className="btn-primary px-5 py-2.5"
                    >
                        + Add Item
                    </button>
                </div>
            </div>



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
                    value={effortFilter}
                    onChange={setEffortFilter}
                    options={[
                        { value: 'all', label: 'All Effort Levels' },
                        { value: 'quick_fix', label: '⚡ Quick Fix' },
                        { value: 'moderate', label: '🔧 Moderate' },
                        { value: 'significant', label: '🏗️ Significant' },
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
                {/* Duplicate toggle */}
                <button
                    onClick={() => setDuplicateFilter(duplicateFilter === 'hidden' ? 'shown' : 'hidden')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${duplicateFilter === 'shown'
                        ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                        : 'border-theme-border text-theme-text-muted hover:text-theme-text-secondary'
                        }`}
                >
                    {duplicateFilter === 'shown' ? '◈ Hiding Duplicates' : '◇ Show Duplicates'}
                </button>
                {/* View mode toggle */}
                <div className="flex items-center gap-1 bg-theme-overlay rounded-lg p-0.5">
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

            {/* Lock Status Summary Bar */}
            <div className="glass-card p-4 mb-8 flex flex-wrap items-center gap-4">
                <span className="text-xs font-semibold uppercase tracking-wider text-theme-text-tertiary mr-1">Lock Status</span>
                <button
                    onClick={() => setLockFilter(lockFilter === 'locked' ? 'all' : 'locked')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all duration-200 cursor-pointer ${lockFilter === 'locked'
                        ? 'border-amber-500 bg-amber-500/20 ring-2 ring-amber-500/40'
                        : 'border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/15'
                        }`}
                >
                    <span className="text-sm">🔒</span>
                    <span className="text-sm font-semibold text-amber-400">{lockStats.locked}</span>
                    <span className="text-xs text-amber-400/80">Locked</span>
                </button>
                <button
                    onClick={() => setLockFilter(lockFilter === 'unlocked' ? 'all' : 'unlocked')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all duration-200 cursor-pointer ${lockFilter === 'unlocked'
                        ? 'border-theme-text-secondary bg-theme-muted ring-2 ring-theme-text-muted/40'
                        : 'border-theme-border bg-theme-overlay hover:bg-theme-muted'
                        }`}
                >
                    <span className="text-sm">🔓</span>
                    <span className="text-sm font-semibold text-theme-text-secondary">{lockStats.unlocked}</span>
                    <span className="text-xs text-theme-text-muted">Unlocked</span>
                </button>
                <button
                    onClick={() => setLockFilter(lockFilter === 'unlocked' ? 'all' : 'unlocked')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all duration-200 cursor-pointer ${lockFilter === 'unlocked'
                        ? 'border-rose-500 bg-rose-500/20 ring-2 ring-rose-500/40'
                        : 'border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/15'
                        }`}
                >
                    <span className="text-sm">⏳</span>
                    <span className="text-sm font-semibold text-rose-400">{lockStats.subjectToArchive}</span>
                    <span className="text-xs text-rose-400/80">Subject to Archive</span>
                </button>
                {lockFilter !== 'all' && (
                    <button
                        onClick={() => setLockFilter('all')}
                        className="text-xs text-theme-text-muted hover:text-theme-text-secondary transition-colors ml-1 cursor-pointer"
                    >
                        ✕ Clear
                    </button>
                )}
                {/* Done count — separate from active metrics */}
                <div className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10">
                    <span className="text-sm">✅</span>
                    <span className="text-sm font-semibold text-emerald-400">{lockStats.done}</span>
                    <span className="text-xs text-emerald-400/80">Done</span>
                </div>
            </div>

            {/* Two-Column Assignee Board */}
            {loading ? (
                <div className="p-12 text-center text-theme-text-tertiary">Loading action items...</div>
            ) : (
                <div className="space-y-6">
                    {/* Main two-column grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {ASSIGNEES.map((assignee) => {
                            const assigneeGroups = groupedByAssignee[assignee.name];
                            const assigneeItemCount = filtered.filter(i => i.assigned_to === assignee.name).length;

                            return (
                                <div key={assignee.name} className="space-y-4">
                                    {/* Assignee column header */}
                                    <div className={`glass-card p-4 border-l-4 ${assignee.accent} flex items-center justify-between sticky top-0 z-10`}>
                                        <h2 className="text-lg font-semibold text-theme-text-primary">{assignee.displayName}</h2>
                                        <div className="flex items-center gap-3">
                                            <span className="text-sm text-theme-text-tertiary font-medium">{lockStats.perAssignee[assignee.name]?.total ?? assigneeItemCount}</span>
                                            {lockStats.perAssignee[assignee.name] && (
                                                <span className="text-[11px] text-theme-text-muted">
                                                    🔒 {lockStats.perAssignee[assignee.name].locked} · 🔓 {lockStats.perAssignee[assignee.name].unlocked}
                                                </span>
                                            )}
                                            {lockStats.perAssignee[assignee.name]?.done > 0 && (
                                                <span className="text-[11px] text-emerald-400">
                                                    ✅ {lockStats.perAssignee[assignee.name].done}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Status sections within this column */}
                                    {COLUMNS.map((col) => {
                                        const groups = assigneeGroups?.[col.key] ?? [];
                                        const statusItemCount = groups.reduce((sum, g) => sum + g.items.length, 0);

                                        return (
                                            <div key={col.key}>
                                                {/* Status header */}
                                                <div className="glass-card p-3 mb-2 flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <div className={`w-2 h-2 rounded-full ${col.key === 'open' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                                                        <h3 className="text-sm font-semibold text-theme-text-primary">{col.label}</h3>
                                                    </div>
                                                    <span className="text-xs text-theme-text-tertiary font-medium">{statusItemCount}</span>
                                                </div>

                                                {/* Cards */}
                                                {statusItemCount === 0 ? (
                                                    <div className="p-4 text-center text-xs text-theme-text-muted border border-dashed border-theme-border rounded-2xl">
                                                        No items
                                                    </div>
                                                ) : viewMode === 'flat' ? (
                                                    <div className="grid grid-cols-1 gap-3">
                                                        {groups.flatMap(g => g.items).map((item) => (
                                                            <ActionItemCard
                                                                key={item.id}
                                                                item={item}
                                                                allItems={items}
                                                                isOverdue={isOverdue(item)}
                                                                isShared={sharedItemIds.has(item.id)}
                                                                isNew={isNewItem(item.created_at)}
                                                                isExpanded={expandedId === item.id}
                                                                onToggleExpand={() => setExpandedId(expandedId === item.id ? null : item.id)}
                                                                onStatusChange={updateStatus}
                                                                onDismiss={dismissItem}
                                                                onGroupLabelSave={handleGroupLabelSave}
                                                                onLockChange={handleLockChange}
                                                                translatedTitle={titleMap.get(item.id)}
                                                            />
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="space-y-3">
                                                        {groups.map((group) => {
                                                            const displayLabel = group.label ?? 'Ungrouped';
                                                            const groupKey = `${assignee.name}::${col.key}::${displayLabel}`;
                                                            const isCollapsed = collapsedGroups.has(groupKey);

                                                            return (
                                                                <div key={groupKey} className={`border-l-2 ${group.label === null ? 'border-theme-text-muted/30' : 'border-brand-500/30'} rounded-xl overflow-hidden`}>
                                                                    <button
                                                                        onClick={() => toggleGroup(groupKey)}
                                                                        className="w-full flex items-center justify-between px-4 py-2.5
                                                                            bg-theme-overlay hover:bg-theme-muted
                                                                            transition-colors cursor-pointer"
                                                                    >
                                                                        <div className="flex items-center gap-2">
                                                                            <span
                                                                                className="text-xs text-theme-text-muted transition-transform duration-200"
                                                                                style={{ display: 'inline-block', transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)' }}
                                                                            >
                                                                                &#9654;
                                                                            </span>
                                                                            <span className={`text-sm font-semibold ${group.label === null ? 'text-theme-text-muted' : 'text-theme-text-primary'}`}>{displayLabel}</span>
                                                                        </div>
                                                                        <span className="text-xs text-theme-text-tertiary">{group.items.length}</span>
                                                                    </button>
                                                                    {!isCollapsed && (
                                                                        <div className="grid grid-cols-1 gap-3 p-2 pt-2">
                                                                            {group.items.map((item) => (
                                                                                <ActionItemCard
                                                                                    key={item.id}
                                                                                    item={item}
                                                                                    allItems={items}
                                                                                    isOverdue={isOverdue(item)}
                                                                                    isShared={sharedItemIds.has(item.id)}
                                                                                    isNew={isNewItem(item.created_at)}
                                                                                    isExpanded={expandedId === item.id}
                                                                                    onToggleExpand={() => setExpandedId(expandedId === item.id ? null : item.id)}
                                                                                    onStatusChange={updateStatus}
                                                                                    onDismiss={dismissItem}
                                                                                    onGroupLabelSave={handleGroupLabelSave}
                                                                                    onLockChange={handleLockChange}
                                                                                    translatedTitle={titleMap.get(item.id)}
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
                            );
                        })}
                    </div>

                    {/* Unassigned items — full width below both columns */}
                    {unassignedItems.length > 0 && (
                        <div className="mt-2">
                            <div className="glass-card p-4 mb-3 border-l-4 border-theme-text-muted/40 flex items-center justify-between">
                                <h2 className="text-lg font-semibold text-theme-text-muted">Unassigned</h2>
                                <span className="text-sm text-theme-text-tertiary font-medium">{unassignedItems.length}</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {unassignedItems.map((item) => (
                                    <ActionItemCard
                                        key={item.id}
                                        item={item}
                                        allItems={items}
                                        isOverdue={isOverdue(item)}
                                        isShared={false}
                                        isNew={isNewItem(item.created_at)}
                                        isExpanded={expandedId === item.id}
                                        onToggleExpand={() => setExpandedId(expandedId === item.id ? null : item.id)}
                                        onStatusChange={updateStatus}
                                        onDismiss={dismissItem}
                                        onGroupLabelSave={handleGroupLabelSave}
                                        onLockChange={handleLockChange}
                                        translatedTitle={titleMap.get(item.id)}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Create Modal */}
            {showCreate && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
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
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
                                    <label className="text-xs text-theme-text-tertiary font-medium uppercase tracking-wider block mb-1">Effort</label>
                                    <select
                                        value={newEffort}
                                        onChange={(e) => setNewEffort(e.target.value as ActionItemEffort | '')}
                                        className="input-glow w-full text-sm"
                                    >
                                        <option value="">None</option>
                                        <option value="quick_fix">⚡ Quick Fix</option>
                                        <option value="moderate">🔧 Moderate</option>
                                        <option value="significant">🏗️ Significant</option>
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

function ActionItemCard({
    item,
    allItems,
    isOverdue,
    isShared,
    isNew = false,
    isExpanded,
    onToggleExpand,
    onStatusChange,
    onDismiss,
    onGroupLabelSave,
    onLockChange,
    translatedTitle,
}: {
    item: ActionItem;
    allItems: ActionItem[];
    isOverdue: boolean;
    isShared?: boolean;
    isNew?: boolean;
    isExpanded: boolean;
    onToggleExpand: () => void;
    onStatusChange: (id: string, status: ActionItemStatus) => void;
    onDismiss: (id: string) => void;
    onGroupLabelSave: (id: string, label: string) => void;
    onLockChange: (id: string, locked: boolean) => void;
    translatedTitle?: string;
}) {
    const [editGroupLabel, setEditGroupLabel] = useState(item.group_label ?? '');

    // Sync local state when item changes (e.g. after Smart Group)
    useEffect(() => {
        setEditGroupLabel(item.group_label ?? '');
    }, [item.group_label]);

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
        if (!q || !item.transcript_id) return;

        setAiMessages((prev) => [...prev, { role: 'user', content: q }]);
        setAiQuestion('');
        setAiLoading(true);

        try {
            const res = await fetch('/api/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    question: `${q} — Context: this is about an action item titled "${item.title}"`,
                    transcript_id: item.transcript_id,
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
        'What was the full discussion about this?',
        'Who else was involved in this decision?',
        'What was the context leading to this action item?',
    ];

    const transitions: Partial<Record<ActionItemStatus, { label: string; target: ActionItemStatus }[]>> = {
        open: [{ label: 'Done', target: 'done' }],
        done: [{ label: 'Reopen', target: 'open' }],
    };

    return (
        <div className={`glass-card p-4 transition-all duration-200 ${isOverdue ? 'ring-1 ring-rose-500/30' : ''}`}>
            {/* Header */}
            <div className="flex items-start gap-2 cursor-pointer" onClick={onToggleExpand}>
                {isNew ? (
                    <span className="relative flex h-2 w-2 shrink-0 mt-1.5" title="New">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                ) : (
                    <span className={`mt-1.5 inline-block w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_DOT[item.priority]}`} />
                )}
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-theme-text-primary">{translatedTitle ?? item.title}</p>
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
                        {item.effort && EFFORT_CONFIG[item.effort] && (
                            <span className={`text-[10px] font-medium ${EFFORT_CONFIG[item.effort].color}`}>
                                {EFFORT_CONFIG[item.effort].icon} {EFFORT_CONFIG[item.effort].label}
                            </span>
                        )}
                        {item.due_date && (
                            <span className={`text-[10px] ${isOverdue ? 'text-rose-400 font-medium' : 'text-theme-text-muted'}`}>
                                {isOverdue ? 'Overdue · ' : 'Due '}
                                {new Date(item.due_date).toLocaleDateString()}
                            </span>
                        )}
                        {item.created_by === 'ai' && (
                            <span className="text-[10px] text-accent-violet">AI</span>
                        )}
                        {item.is_duplicate && (
                            <span className="inline-flex items-center px-1.5 py-0.5 text-[9px] font-medium rounded-full bg-amber-500/10 text-amber-500">
                                Duplicate
                            </span>
                        )}
                        {isShared && (
                            <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-violet-500/10 text-violet-400">
                                🤝 Shared
                            </span>
                        )}
                        <TTLBadge createdAt={item.created_at} isLocked={item.is_locked} />
                    </div>
                </div>
            </div>

            {/* Expanded Detail */}
            {isExpanded && (
                <div className="mt-3 pt-3 border-t border-theme-border space-y-3 animate-slide-up">
                    {item.description && (
                        <p className="text-xs text-theme-text-secondary">{item.description}</p>
                    )}
                    {item.source_text && (
                        <div className="bg-theme-muted/30 rounded-lg p-3">
                            <p className="text-[10px] text-theme-text-tertiary uppercase tracking-wider mb-1">Source excerpt</p>
                            <p className="text-xs text-theme-text-secondary italic">&ldquo;{item.source_text}&rdquo;</p>
                        </div>
                    )}

                    {/* Duplicate reference */}
                    {item.is_duplicate && item.duplicate_of && (
                        <div className="flex items-center gap-1.5 text-xs text-amber-500/80">
                            <span>◈</span>
                            <span>Duplicate of: <DuplicateOfLabel itemId={item.duplicate_of} allItems={allItems} /></span>
                        </div>
                    )}

                    {/* Ask AI button — only when transcript is available */}
                    {item.transcript_id && (
                        <button
                            onClick={() => setShowAskAI((v) => !v)}
                            className={`px-2.5 py-1 text-[11px] font-medium rounded-lg transition-colors ${showAskAI
                                ? 'bg-accent-violet/20 text-accent-violet'
                                : 'bg-accent-violet/10 text-accent-violet hover:bg-accent-violet/20'
                                }`}
                        >
                            ◈ Ask AI
                        </button>
                    )}

                    {/* Inline mini-chat panel */}
                    {showAskAI && item.transcript_id && (
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
                                    placeholder="Ask about this action item..."
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

                    {item.transcript_id && (
                        <Link
                            href={`/transcripts/${item.transcript_id}`}
                            className="block text-xs text-brand-400 hover:text-brand-300 transition-colors"
                        >
                            View source transcript &rarr;
                        </Link>
                    )}

                    {/* Implementation Prompt */}
                    <ActionPrompt
                        actionItemId={item.id}
                        actionItemTitle={item.title}
                        autoLoad
                    />

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
                            className="text-xs text-theme-text-secondary bg-transparent border-b border-theme-border
                                       focus:border-brand-500/50 focus:outline-none px-1 py-0.5 w-32 transition-colors"
                        />
                    </div>
                </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-theme-border">
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
                <LockButton
                    entityType="action_item"
                    entityId={item.id}
                    isLocked={item.is_locked}
                    lockedBy={item.locked_by}
                    currentUser="Lutfiya Miller"
                    onLockChange={(locked) => onLockChange(item.id, locked)}
                />
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

/** Resolves a duplicate_of ID to the original item's title for display. */
function DuplicateOfLabel({ itemId, allItems }: { itemId: string; allItems: ActionItem[] }) {
    const original = allItems.find((i) => i.id === itemId);
    if (!original) return <span className="italic text-theme-text-muted">{itemId.slice(0, 8)}…</span>;
    return <span className="font-medium">{original.title}</span>;
}
