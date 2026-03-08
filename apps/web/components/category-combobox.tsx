'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { Category } from '@meet-pipeline/shared';

interface CategoryComboboxProps {
    /** Currently selected categories (controlled). */
    selectedCategories: Category[];
    /** Called when selection changes. */
    onChange: (categories: Category[]) => void;
    /** All available categories (fetched by parent). */
    availableCategories: Category[];
    /** Called when a new category is created. Returns the created category. */
    onCreateCategory: (name: string) => Promise<Category | null>;
}

/**
 * Category combobox — combined dropdown + text input for selecting
 * or creating categories. Displays selected categories as pills.
 *
 * Features:
 * - Type to filter existing categories
 * - "Create «{text}»" option for new categories
 * - Multi-select pill display with × remove
 * - Keyboard navigation (arrows, enter, escape, backspace)
 */
export function CategoryCombobox({
    selectedCategories,
    onChange,
    availableCategories,
    onCreateCategory,
}: CategoryComboboxProps) {
    const [query, setQuery] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [highlightIndex, setHighlightIndex] = useState(0);
    const [creating, setCreating] = useState(false);

    const inputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const selectedIds = new Set(selectedCategories.map(c => c.id));

    /** Filter categories by query, excluding already-selected. */
    const filtered = availableCategories.filter(cat => {
        if (selectedIds.has(cat.id)) return false;
        if (!query) return true;
        return cat.name.toLowerCase().includes(query.toLowerCase());
    });

    /** Whether the typed query matches an existing category name exactly. */
    const exactMatch = availableCategories.some(
        c => c.name.toLowerCase() === query.trim().toLowerCase(),
    );

    /** Show "Create" option if there's a query and no exact match. */
    const showCreateOption = query.trim().length > 0 && !exactMatch;

    /** Total options count (for keyboard navigation). */
    const totalOptions = filtered.length + (showCreateOption ? 1 : 0);

    // Reset highlight when dropdown opens or filter changes
    useEffect(() => {
        setHighlightIndex(0);
    }, [query, isOpen]);

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(e.target as Node) &&
                inputRef.current &&
                !inputRef.current.contains(e.target as Node)
            ) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const addCategory = useCallback((cat: Category) => {
        onChange([...selectedCategories, cat]);
        setQuery('');
        setIsOpen(false);
        inputRef.current?.focus();
    }, [selectedCategories, onChange]);

    const removeCategory = useCallback((id: string) => {
        onChange(selectedCategories.filter(c => c.id !== id));
    }, [selectedCategories, onChange]);

    const handleCreateNew = async () => {
        const name = query.trim();
        if (!name || creating) return;
        setCreating(true);
        try {
            const created = await onCreateCategory(name);
            if (created) {
                addCategory(created);
            }
        } finally {
            setCreating(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!isOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            setIsOpen(true);
            e.preventDefault();
            return;
        }

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setHighlightIndex(prev => Math.min(prev + 1, totalOptions - 1));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setHighlightIndex(prev => Math.max(prev - 1, 0));
                break;
            case 'Enter':
                e.preventDefault();
                if (!isOpen) {
                    setIsOpen(true);
                    return;
                }
                if (highlightIndex < filtered.length) {
                    addCategory(filtered[highlightIndex]);
                } else if (showCreateOption) {
                    handleCreateNew();
                }
                break;
            case 'Escape':
                setIsOpen(false);
                break;
            case 'Backspace':
                if (!query && selectedCategories.length > 0) {
                    removeCategory(selectedCategories[selectedCategories.length - 1].id);
                }
                break;
        }
    };

    return (
        <div className="relative">
            {/* Selected pills + input */}
            <div
                className="flex flex-wrap items-center gap-1.5 p-2 rounded-xl border border-theme-border
                           bg-theme-overlay hover:border-brand-500/30 transition-colors
                           focus-within:ring-2 focus-within:ring-brand-500/30 focus-within:border-brand-500/40"
                onClick={() => inputRef.current?.focus()}
            >
                {selectedCategories.map((cat) => (
                    <span
                        key={cat.id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium
                                   rounded-full border border-theme-border bg-theme-muted text-theme-text-secondary"
                    >
                        {cat.color && (
                            <span
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{ backgroundColor: cat.color }}
                            />
                        )}
                        {cat.name}
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                removeCategory(cat.id);
                            }}
                            className="ml-0.5 text-theme-text-muted hover:text-rose-400 transition-colors"
                        >
                            ×
                        </button>
                    </span>
                ))}
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setIsOpen(true);
                    }}
                    onFocus={() => setIsOpen(true)}
                    onKeyDown={handleKeyDown}
                    placeholder={selectedCategories.length === 0 ? 'Add category...' : ''}
                    className="flex-1 min-w-[100px] bg-transparent border-0 outline-none
                               text-sm text-theme-text-primary placeholder:text-theme-text-muted"
                />
            </div>

            {/* Dropdown */}
            {isOpen && totalOptions > 0 && (
                <div
                    ref={dropdownRef}
                    className="absolute z-50 mt-1.5 w-full max-h-[220px] overflow-y-auto
                               rounded-xl border border-theme-border bg-theme-bg-card
                               shadow-lg custom-scrollbar animate-slide-up"
                >
                    {filtered.map((cat, i) => (
                        <button
                            key={cat.id}
                            type="button"
                            onClick={() => addCategory(cat)}
                            className={`w-full flex items-center justify-between px-3 py-2 text-left text-sm
                                       transition-colors cursor-pointer
                                       ${i === highlightIndex ? 'bg-brand-500/10 text-brand-400' : 'text-theme-text-secondary hover:bg-theme-overlay'}
                                       ${i === 0 ? 'rounded-t-xl' : ''}
                                       ${i === filtered.length - 1 && !showCreateOption ? 'rounded-b-xl' : ''}`}
                        >
                            <div className="flex items-center gap-2">
                                {cat.color && (
                                    <span
                                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: cat.color }}
                                    />
                                )}
                                <span>{cat.name}</span>
                            </div>
                            <span className="text-[10px] text-theme-text-muted">{cat.usage_count}</span>
                        </button>
                    ))}

                    {showCreateOption && (
                        <button
                            type="button"
                            onClick={handleCreateNew}
                            disabled={creating}
                            className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm
                                       transition-colors cursor-pointer rounded-b-xl
                                       ${highlightIndex === filtered.length
                                    ? 'bg-violet-500/10 text-violet-400'
                                    : 'text-theme-text-secondary hover:bg-theme-overlay'}`}
                        >
                            <span className="text-xs">+</span>
                            <span>
                                {creating ? 'Creating...' : `Create "${query.trim()}"`}
                            </span>
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
