'use client';

import { useState, useRef, useCallback } from 'react';

interface ScreenshotUploadProps {
    /** Current screenshot URL (null if no screenshot). */
    screenshotUrl: string | null;
    /** Current screenshot alt text. */
    screenshotAlt: string | null;
    /** Action item ID for upload endpoint. */
    actionItemId: string;
    /** Called after successful upload or delete with updated data. */
    onUpdate: (data: { screenshot_url: string | null; screenshot_alt: string | null; screenshot_size: number | null }) => void;
    /** Called when thumbnail is clicked (opens lightbox). */
    onOpenLightbox?: () => void;
}

const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

/**
 * Screenshot upload component — three states:
 * 1. Empty: dropzone with upload prompt
 * 2. Uploading: progress indicator
 * 3. Attached: thumbnail with hover controls (delete, view)
 *
 * Supports: drag-drop, click-to-upload, paste from clipboard.
 */
export function ScreenshotUpload({
    screenshotUrl,
    screenshotAlt,
    actionItemId,
    onUpdate,
    onOpenLightbox,
}: ScreenshotUploadProps) {
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const validateFile = (file: File): string | null => {
        if (!ALLOWED_TYPES.includes(file.type)) {
            return 'Only PNG, JPG, and WebP images are allowed';
        }
        if (file.size > MAX_SIZE) {
            return 'File is too large (max 5 MB)';
        }
        return null;
    };

    const uploadFile = useCallback(async (file: File) => {
        const validationError = validateFile(file);
        if (validationError) {
            setError(validationError);
            return;
        }

        setUploading(true);
        setError(null);

        try {
            const formData = new FormData();
            formData.append('file', file);

            const res = await fetch(`/api/action-items/${actionItemId}/screenshot`, {
                method: 'POST',
                body: formData,
            });

            const data = await res.json();
            if (res.ok) {
                onUpdate({
                    screenshot_url: data.screenshot_url,
                    screenshot_alt: data.screenshot_alt,
                    screenshot_size: data.screenshot_size,
                });
            } else {
                setError(data.error || 'Upload failed');
            }
        } catch {
            setError('Upload failed — check your connection');
        }

        setUploading(false);
    }, [actionItemId, onUpdate]);

    const handleDelete = async () => {
        try {
            const res = await fetch(`/api/action-items/${actionItemId}/screenshot`, {
                method: 'DELETE',
            });

            if (res.ok) {
                onUpdate({ screenshot_url: null, screenshot_alt: null, screenshot_size: null });
            }
        } catch { /* silently fail */ }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) uploadFile(file);
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        const items = e.clipboardData.items;
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (file) uploadFile(file);
                break;
            }
        }
    };

    // ── Attached state: show thumbnail ──
    if (screenshotUrl && !uploading) {
        return (
            <div className="group relative w-full rounded-xl overflow-hidden border border-theme-border bg-theme-muted/30">
                <img
                    src={screenshotUrl}
                    alt={screenshotAlt ?? 'Screenshot'}
                    className="w-full h-auto max-h-[200px] object-contain cursor-pointer"
                    onClick={onOpenLightbox}
                />
                {/* Hover controls */}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                    <button
                        onClick={onOpenLightbox}
                        className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                        title="View full size"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                        </svg>
                    </button>
                    <button
                        onClick={handleDelete}
                        className="p-2 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 transition-colors"
                        title="Remove screenshot"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                </div>
                {/* Replace button */}
                <button
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute top-2 right-2 p-1 rounded-md bg-black/40 text-white/80 hover:text-white text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                >
                    Replace
                </button>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept={ALLOWED_TYPES.join(',')}
                    onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])}
                    className="hidden"
                />
            </div>
        );
    }

    // ── Uploading state ──
    if (uploading) {
        return (
            <div className="w-full rounded-xl border border-theme-border bg-theme-muted/30 p-6 flex flex-col items-center justify-center gap-2">
                <span className="inline-block w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-theme-text-muted">Uploading…</span>
            </div>
        );
    }

    // ── Empty state: dropzone ──
    return (
        <div
            className={`w-full rounded-xl border-2 border-dashed p-4 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors ${dragOver
                    ? 'border-brand-500 bg-brand-500/5'
                    : 'border-theme-border hover:border-brand-500/40 hover:bg-theme-overlay/50'
                }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onPaste={handlePaste}
            onClick={() => fileInputRef.current?.click()}
        >
            <svg className="w-6 h-6 text-theme-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-[11px] text-theme-text-muted text-center">
                {dragOver ? 'Drop image here' : 'Drag & drop, click, or paste (PNG, JPG, WebP · 5 MB max)'}
            </span>
            {error && (
                <span className="text-[10px] text-rose-400">{error}</span>
            )}
            <input
                ref={fileInputRef}
                type="file"
                accept={ALLOWED_TYPES.join(',')}
                onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])}
                className="hidden"
            />
        </div>
    );
}
