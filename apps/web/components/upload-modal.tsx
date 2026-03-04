'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { MeetingTranscript } from '@meet-pipeline/shared';

const ACCEPTED_EXTENSIONS = '.txt,.vtt,.sbv,.pdf';
const VALID_EXTENSIONS = ['.txt', '.vtt', '.sbv', '.pdf'];
const FORMAT_LABELS: Record<string, string> = {
    '.txt': 'Plain Text',
    '.vtt': 'WebVTT',
    '.sbv': 'SubViewer',
    '.pdf': 'PDF',
};

const PROGRESS_STAGES_FILE = [
    'Uploading file...',
    'Extracting text from PDF...',
    'Parsing transcript...',
    'Generating embeddings...',
    'Storing in database...',
];

const PROGRESS_STAGES_PASTE = [
    'Processing text...',
    'Parsing transcript...',
    'Generating embeddings...',
    'Storing in database...',
];

type InputMode = 'file' | 'paste';

/** Derive a title from a filename: strip extension, replace separators, title-case. */
function titleFromFilename(filename: string): string {
    const base = filename.replace(/\.[^.]+$/, '');
    const words = base.replace(/[-_]+/g, ' ').trim().split(/\s+/);
    return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileExtension(filename: string): string {
    return filename.slice(filename.lastIndexOf('.')).toLowerCase();
}

/** Response shape from POST /api/upload */
interface UploadResponse {
    error?: string;
    transcript?: MeetingTranscript;
    detectedDate?: string | null;
}

interface UploadModalProps {
    /** Called after a successful upload with the new transcript */
    onSuccess?: (transcript: MeetingTranscript) => void;
}

// ── Shared Tab Switcher Component ────────────────────────────────────

function TabSwitcher({ mode, onChange, disabled }: { mode: InputMode; onChange: (m: InputMode) => void; disabled: boolean }) {
    return (
        <div className="flex rounded-xl bg-theme-muted p-1 mb-4">
            <button
                type="button"
                onClick={() => onChange('file')}
                disabled={disabled}
                className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${mode === 'file'
                    ? 'bg-white dark:bg-[rgb(var(--color-surface))] text-theme-text-primary shadow-sm'
                    : 'text-theme-text-tertiary hover:text-theme-text-secondary'
                    } disabled:opacity-50`}
            >
                📄 Upload File
            </button>
            <button
                type="button"
                onClick={() => onChange('paste')}
                disabled={disabled}
                className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${mode === 'paste'
                    ? 'bg-white dark:bg-[rgb(var(--color-surface))] text-theme-text-primary shadow-sm'
                    : 'text-theme-text-tertiary hover:text-theme-text-secondary'
                    } disabled:opacity-50`}
            >
                ✏️ Paste Text
            </button>
        </div>
    );
}

// ── Main Upload Modal (header button) ────────────────────────────────

export function UploadModal({ onSuccess }: UploadModalProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [mode, setMode] = useState<InputMode>('file');
    const [file, setFile] = useState<File | null>(null);
    const [pastedText, setPastedText] = useState('');
    const [title, setTitle] = useState('');
    const [date, setDate] = useState('');
    const [uploading, setUploading] = useState(false);
    const [progressIndex, setProgressIndex] = useState(0);
    const [result, setResult] = useState<{ type: 'success'; transcript: MeetingTranscript; detectedDate?: string | null } | { type: 'error'; message: string } | null>(null);
    const [dragOver, setDragOver] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const modalRef = useRef<HTMLDivElement>(null);

    const progressStages = mode === 'paste' ? PROGRESS_STAGES_PASTE : PROGRESS_STAGES_FILE;
    const canSubmit = mode === 'file' ? !!file : !!pastedText.trim();

    // Reset state when modal opens
    const openModal = useCallback(() => {
        setMode('file');
        setFile(null);
        setPastedText('');
        setTitle('');
        setDate('');
        setUploading(false);
        setProgressIndex(0);
        setResult(null);
        setDragOver(false);
        setIsOpen(true);
    }, []);

    const closeModal = useCallback(() => {
        if (uploading) return;
        setIsOpen(false);
    }, [uploading]);

    // Close on Escape
    useEffect(() => {
        if (!isOpen) return;
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') closeModal();
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [isOpen, closeModal]);

    // Focus trap
    useEffect(() => {
        if (!isOpen || !modalRef.current) return;
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
            'button, input, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length > 0) focusable[0].focus();
    }, [isOpen, result]);

    // Progress stage cycling during upload
    useEffect(() => {
        if (!uploading) return;
        const interval = setInterval(() => {
            setProgressIndex((prev) => (prev + 1) % progressStages.length);
        }, 2000);
        return () => clearInterval(interval);
    }, [uploading, progressStages.length]);

    const handleFileSelect = (selected: File) => {
        const ext = getFileExtension(selected.name);
        if (!VALID_EXTENSIONS.includes(ext)) return;
        setFile(selected);
        setTitle(titleFromFilename(selected.name));
        setResult(null);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const dropped = e.dataTransfer.files[0];
        if (dropped) handleFileSelect(dropped);
    };

    const handleSubmit = async () => {
        if (!canSubmit) return;

        setUploading(true);
        setProgressIndex(0);
        setResult(null);

        try {
            let res: Response;

            if (mode === 'paste') {
                res = await fetch('/api/upload', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        text: pastedText,
                        title: title.trim() || undefined,
                        date: date ? new Date(date).toISOString() : undefined,
                    }),
                });
            } else {
                const formData = new FormData();
                formData.append('file', file!);
                if (title.trim()) formData.append('title', title.trim());
                if (date) formData.append('date', new Date(date).toISOString());
                res = await fetch('/api/upload', { method: 'POST', body: formData });
            }

            const data = (await res.json()) as UploadResponse;

            if (!res.ok) {
                setResult({ type: 'error', message: data.error || 'Upload failed' });
                return;
            }

            if (data.transcript) {
                setResult({ type: 'success', transcript: data.transcript, detectedDate: data.detectedDate });
                onSuccess?.(data.transcript);
            }
        } catch {
            setResult({ type: 'error', message: 'Network error — please try again' });
        } finally {
            setUploading(false);
        }
    };

    if (!isOpen) {
        return (
            <button
                onClick={openModal}
                className="btn-primary px-4 py-2"
            >
                Upload Transcript
            </button>
        );
    }

    return (
        <div
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
        >
            <div
                ref={modalRef}
                className="glass-card p-6 w-full max-w-lg animate-slide-up"
                role="dialog"
                aria-modal="true"
                aria-label="Upload transcript"
            >
                <div className="flex items-center justify-between mb-5">
                    <h2 className="text-lg font-semibold text-theme-text-primary">Upload Transcript</h2>
                    <button
                        onClick={closeModal}
                        disabled={uploading}
                        className="text-theme-text-muted hover:text-theme-text-primary transition-colors text-xl leading-none disabled:opacity-50"
                        aria-label="Close"
                    >
                        &times;
                    </button>
                </div>

                {/* Success state */}
                {result?.type === 'success' && (
                    <div className="mb-4 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                        <p className="text-sm font-medium text-emerald-400 mb-1">Upload successful!</p>
                        <p className="text-sm text-theme-text-secondary">
                            &ldquo;{result.transcript.meeting_title}&rdquo; has been processed and is now searchable.
                        </p>
                        {result.detectedDate && (
                            <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 mt-2">
                                <span>✓</span>
                                <span>Date auto-detected from PDF</span>
                            </div>
                        )}
                        <a
                            href={`/transcripts/${result.transcript.transcript_id}`}
                            className="inline-block mt-2 text-sm text-brand-400 hover:text-brand-300 transition-colors font-medium"
                        >
                            View transcript →
                        </a>
                    </div>
                )}

                {/* Error state */}
                {result?.type === 'error' && (
                    <div className="mb-4 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20">
                        <p className="text-sm font-medium text-rose-400">Upload failed</p>
                        <p className="text-sm text-theme-text-secondary mt-1">{result.message}</p>
                    </div>
                )}

                {/* Input form */}
                {!result?.type && (
                    <>
                        {/* Tab Switcher */}
                        <TabSwitcher mode={mode} onChange={setMode} disabled={uploading} />

                        {/* File drop zone */}
                        {mode === 'file' && (
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                                onDragLeave={() => setDragOver(false)}
                                onDrop={handleDrop}
                                className={`
                                    border-2 border-dashed rounded-xl p-8 text-center cursor-pointer
                                    transition-all duration-200 mb-4
                                    ${dragOver
                                        ? 'border-brand-500 bg-brand-500/5'
                                        : 'border-theme-border hover:border-theme-border'
                                    }
                                `}
                            >
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept={ACCEPTED_EXTENSIONS}
                                    className="hidden"
                                    onChange={(e) => {
                                        const f = e.target.files?.[0];
                                        if (f) handleFileSelect(f);
                                    }}
                                />

                                {file ? (
                                    <div>
                                        <p className="text-sm font-medium text-theme-text-primary">{file.name}</p>
                                        <p className="text-xs text-theme-text-tertiary mt-1">
                                            {formatFileSize(file.size)} &middot; {FORMAT_LABELS[getFileExtension(file.name)] ?? 'Unknown'}
                                        </p>
                                    </div>
                                ) : (
                                    <div>
                                        <p className="text-sm text-theme-text-secondary">
                                            Drag and drop a transcript file here, or click to browse
                                        </p>
                                        <p className="text-xs text-theme-text-muted mt-2">
                                            Supported: .txt, .vtt, .sbv, .pdf
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Paste text area */}
                        {mode === 'paste' && (
                            <div className="mb-4">
                                <textarea
                                    id="paste-transcript-text"
                                    value={pastedText}
                                    onChange={(e) => setPastedText(e.target.value)}
                                    placeholder="Paste your meeting transcript here..."
                                    rows={8}
                                    className="input-glow w-full resize-y min-h-[120px] max-h-[400px]"
                                />
                                {pastedText.trim() && (
                                    <p className="text-xs text-theme-text-muted mt-1">
                                        {pastedText.trim().split(/\s+/).length.toLocaleString()} words
                                    </p>
                                )}
                            </div>
                        )}

                        {/* Title input */}
                        <div className="mb-3">
                            <label htmlFor="upload-title" className="block text-xs font-medium text-theme-text-secondary mb-1">
                                Meeting Title
                            </label>
                            <input
                                id="upload-title"
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="e.g. Sprint Planning Q1"
                                className="input-glow w-full"
                            />
                        </div>

                        {/* Date input */}
                        <div className="mb-5">
                            <label htmlFor="upload-date" className="block text-xs font-medium text-theme-text-secondary mb-1">
                                Meeting Date <span className="text-theme-text-muted font-normal">(auto-detected if blank)</span>
                            </label>
                            <input
                                id="upload-date"
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                className="input-glow w-full"
                            />
                        </div>

                        {/* Progress indicator */}
                        {uploading && (
                            <div className="mb-4 p-3 rounded-xl bg-brand-500/5 border border-brand-500/10">
                                <div className="flex items-center gap-2">
                                    <div className="w-4 h-4 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
                                    <p className="text-sm text-brand-400 font-medium">{progressStages[progressIndex]}</p>
                                </div>
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={closeModal}
                                disabled={uploading}
                                className="px-4 py-2 text-sm font-medium text-theme-text-secondary hover:text-theme-text-primary transition-colors rounded-xl disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSubmit}
                                disabled={!canSubmit || uploading}
                                className="btn-primary px-5 py-2"
                            >
                                {uploading ? 'Processing...' : mode === 'paste' ? 'Process Text' : 'Upload & Process'}
                            </button>
                        </div>
                    </>
                )}

                {/* Close button after success/error */}
                {result && (
                    <div className="flex justify-end mt-2">
                        <button
                            onClick={closeModal}
                            className="px-4 py-2 text-sm font-medium text-theme-text-secondary hover:text-theme-text-primary transition-colors rounded-xl"
                        >
                            Close
                        </button>
                    </div>
                )}
            </div>
        </div >
    );
}

/**
 * Compact upload button for the sidebar — just an icon + tooltip.
 * Opens the same upload modal.
 */
export function SidebarUploadButton({ onSuccess }: UploadModalProps) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium w-full
                           text-theme-text-secondary hover:text-theme-text-primary hover:bg-theme-muted
                           transition-all duration-200 group"
                title="Upload Transcript"
            >
                <span className="text-lg transition-transform duration-200 group-hover:scale-105">
                    ↑
                </span>
                Upload
            </button>

            {isOpen && (
                <UploadModalPortal
                    onClose={() => setIsOpen(false)}
                    onSuccess={(t) => {
                        onSuccess?.(t);
                        setIsOpen(false);
                    }}
                />
            )}
        </>
    );
}

/**
 * Standalone modal rendered via portal logic — used by the sidebar button
 * where the trigger and modal are separate.
 */
function UploadModalPortal({
    onClose,
    onSuccess,
}: {
    onClose: () => void;
    onSuccess?: (transcript: MeetingTranscript) => void;
}) {
    const [mode, setMode] = useState<InputMode>('file');
    const [file, setFile] = useState<File | null>(null);
    const [pastedText, setPastedText] = useState('');
    const [title, setTitle] = useState('');
    const [date, setDate] = useState('');
    const [uploading, setUploading] = useState(false);
    const [progressIndex, setProgressIndex] = useState(0);
    const [result, setResult] = useState<{ type: 'success'; transcript: MeetingTranscript; detectedDate?: string | null } | { type: 'error'; message: string } | null>(null);
    const [dragOver, setDragOver] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const modalRef = useRef<HTMLDivElement>(null);

    const progressStages = mode === 'paste' ? PROGRESS_STAGES_PASTE : PROGRESS_STAGES_FILE;
    const canSubmit = mode === 'file' ? !!file : !!pastedText.trim();

    // Close on Escape
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !uploading) onClose();
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [onClose, uploading]);

    // Focus trap
    useEffect(() => {
        if (!modalRef.current) return;
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
            'button, input, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length > 0) focusable[0].focus();
    }, [result]);

    // Progress cycling
    useEffect(() => {
        if (!uploading) return;
        const interval = setInterval(() => {
            setProgressIndex((prev) => (prev + 1) % progressStages.length);
        }, 2000);
        return () => clearInterval(interval);
    }, [uploading, progressStages.length]);

    const handleFileSelect = (selected: File) => {
        const ext = getFileExtension(selected.name);
        if (!VALID_EXTENSIONS.includes(ext)) return;
        setFile(selected);
        setTitle(titleFromFilename(selected.name));
        setResult(null);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const dropped = e.dataTransfer.files[0];
        if (dropped) handleFileSelect(dropped);
    };

    const handleSubmit = async () => {
        if (!canSubmit) return;
        setUploading(true);
        setProgressIndex(0);
        setResult(null);

        try {
            let res: Response;

            if (mode === 'paste') {
                res = await fetch('/api/upload', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        text: pastedText,
                        title: title.trim() || undefined,
                        date: date ? new Date(date).toISOString() : undefined,
                    }),
                });
            } else {
                const formData = new FormData();
                formData.append('file', file!);
                if (title.trim()) formData.append('title', title.trim());
                if (date) formData.append('date', new Date(date).toISOString());
                res = await fetch('/api/upload', { method: 'POST', body: formData });
            }

            const data = (await res.json()) as UploadResponse;

            if (!res.ok) {
                setResult({ type: 'error', message: data.error || 'Upload failed' });
                return;
            }

            if (data.transcript) {
                setResult({ type: 'success', transcript: data.transcript, detectedDate: data.detectedDate });
                onSuccess?.(data.transcript);
            }
        } catch {
            setResult({ type: 'error', message: 'Network error — please try again' });
        } finally {
            setUploading(false);
        }
    };

    return (
        <div
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
        >
            <div
                ref={modalRef}
                className="glass-card p-6 w-full max-w-lg animate-slide-up"
                role="dialog"
                aria-modal="true"
                aria-label="Upload transcript"
            >
                <div className="flex items-center justify-between mb-5">
                    <h2 className="text-lg font-semibold text-theme-text-primary">Upload Transcript</h2>
                    <button
                        onClick={onClose}
                        disabled={uploading}
                        className="text-theme-text-muted hover:text-theme-text-primary transition-colors text-xl leading-none disabled:opacity-50"
                        aria-label="Close"
                    >
                        &times;
                    </button>
                </div>

                {result?.type === 'success' && (
                    <div className="mb-4 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                        <p className="text-sm font-medium text-emerald-400 mb-1">Upload successful!</p>
                        <p className="text-sm text-theme-text-secondary">
                            &ldquo;{result.transcript.meeting_title}&rdquo; has been processed and is now searchable.
                        </p>
                        {result.detectedDate && (
                            <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 mt-2">
                                <span>✓</span>
                                <span>Date auto-detected from PDF</span>
                            </div>
                        )}
                        <a
                            href={`/transcripts/${result.transcript.transcript_id}`}
                            className="inline-block mt-2 text-sm text-brand-400 hover:text-brand-300 transition-colors font-medium"
                        >
                            View transcript →
                        </a>
                    </div>
                )}

                {result?.type === 'error' && (
                    <div className="mb-4 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20">
                        <p className="text-sm font-medium text-rose-400">Upload failed</p>
                        <p className="text-sm text-theme-text-secondary mt-1">{result.message}</p>
                    </div>
                )}

                {!result?.type && (
                    <>
                        {/* Tab Switcher */}
                        <TabSwitcher mode={mode} onChange={setMode} disabled={uploading} />

                        {/* File drop zone */}
                        {mode === 'file' && (
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                                onDragLeave={() => setDragOver(false)}
                                onDrop={handleDrop}
                                className={`
                                    border-2 border-dashed rounded-xl p-8 text-center cursor-pointer
                                    transition-all duration-200 mb-4
                                    ${dragOver
                                        ? 'border-brand-500 bg-brand-500/5'
                                        : 'border-theme-border hover:border-theme-border'
                                    }
                                `}
                            >
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept={ACCEPTED_EXTENSIONS}
                                    className="hidden"
                                    onChange={(e) => {
                                        const f = e.target.files?.[0];
                                        if (f) handleFileSelect(f);
                                    }}
                                />
                                {file ? (
                                    <div>
                                        <p className="text-sm font-medium text-theme-text-primary">{file.name}</p>
                                        <p className="text-xs text-theme-text-tertiary mt-1">
                                            {formatFileSize(file.size)} &middot; {FORMAT_LABELS[getFileExtension(file.name)] ?? 'Unknown'}
                                        </p>
                                    </div>
                                ) : (
                                    <div>
                                        <p className="text-sm text-theme-text-secondary">
                                            Drag and drop a transcript file here, or click to browse
                                        </p>
                                        <p className="text-xs text-theme-text-muted mt-2">Supported: .txt, .vtt, .sbv, .pdf</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Paste text area */}
                        {mode === 'paste' && (
                            <div className="mb-4">
                                <textarea
                                    id="portal-paste-transcript-text"
                                    value={pastedText}
                                    onChange={(e) => setPastedText(e.target.value)}
                                    placeholder="Paste your meeting transcript here..."
                                    rows={8}
                                    className="input-glow w-full resize-y min-h-[120px] max-h-[400px]"
                                />
                                {pastedText.trim() && (
                                    <p className="text-xs text-theme-text-muted mt-1">
                                        {pastedText.trim().split(/\s+/).length.toLocaleString()} words
                                    </p>
                                )}
                            </div>
                        )}

                        <div className="mb-3">
                            <label htmlFor="portal-upload-title" className="block text-xs font-medium text-theme-text-secondary mb-1">
                                Meeting Title
                            </label>
                            <input
                                id="portal-upload-title"
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="e.g. Sprint Planning Q1"
                                className="input-glow w-full"
                            />
                        </div>

                        <div className="mb-5">
                            <label htmlFor="portal-upload-date" className="block text-xs font-medium text-theme-text-secondary mb-1">
                                Meeting Date <span className="text-theme-text-muted font-normal">(auto-detected if blank)</span>
                            </label>
                            <input
                                id="portal-upload-date"
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                className="input-glow w-full"
                            />
                        </div>

                        {uploading && (
                            <div className="mb-4 p-3 rounded-xl bg-brand-500/5 border border-brand-500/10">
                                <div className="flex items-center gap-2">
                                    <div className="w-4 h-4 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
                                    <p className="text-sm text-brand-400 font-medium">{progressStages[progressIndex]}</p>
                                </div>
                            </div>
                        )}

                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={onClose}
                                disabled={uploading}
                                className="px-4 py-2 text-sm font-medium text-theme-text-secondary hover:text-theme-text-primary transition-colors rounded-xl disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSubmit}
                                disabled={!canSubmit || uploading}
                                className="btn-primary px-5 py-2"
                            >
                                {uploading ? 'Processing...' : mode === 'paste' ? 'Process Text' : 'Upload & Process'}
                            </button>
                        </div>
                    </>
                )}

                {result && (
                    <div className="flex justify-end mt-2">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-theme-text-secondary hover:text-theme-text-primary transition-colors rounded-xl"
                        >
                            Close
                        </button>
                    </div>
                )}
            </div>
        </div >
    );
}
