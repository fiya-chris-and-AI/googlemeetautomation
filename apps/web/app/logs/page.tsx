'use client';

import { useState, useEffect } from 'react';
import type { ProcessingLogEntry } from '@meet-pipeline/shared';
import { useLocale } from '../../lib/locale';

/**
 * Processing Log — table showing every email the worker has processed.
 * Useful for debugging when a transcript doesn't show up.
 */
export default function LogsPage() {
    const [logs, setLogs] = useState<ProcessingLogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const { t } = useLocale();

    useEffect(() => {
        fetch('/api/logs')
            .then((r) => r.json())
            .then((data: ProcessingLogEntry[]) => {
                setLogs(data);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    return (
        <div className="max-w-6xl mx-auto animate-fade-in">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-theme-text-primary tracking-tight">{t('logs.title')}</h1>
                <p className="text-theme-text-tertiary mt-1">{t('logs.subtitle')}</p>
            </div>

            <div className="glass-card overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-theme-border">
                            <th className="text-left px-6 py-3 text-xs font-semibold text-theme-text-tertiary uppercase tracking-wider">
                                {t('logs.table.timestamp')}
                            </th>
                            <th className="text-left px-6 py-3 text-xs font-semibold text-theme-text-tertiary uppercase tracking-wider">
                                {t('logs.table.subject')}
                            </th>
                            <th className="text-left px-6 py-3 text-xs font-semibold text-theme-text-tertiary uppercase tracking-wider">
                                {t('logs.table.status')}
                            </th>
                            <th className="text-left px-6 py-3 text-xs font-semibold text-theme-text-tertiary uppercase tracking-wider">
                                {t('logs.table.method')}
                            </th>
                            <th className="text-left px-6 py-3 text-xs font-semibold text-theme-text-tertiary uppercase tracking-wider">
                                Source
                            </th>
                            <th className="text-left px-6 py-3 text-xs font-semibold text-theme-text-tertiary uppercase tracking-wider">
                                {t('logs.table.error')}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={6} className="px-6 py-12 text-center text-theme-text-tertiary">
                                    {t('logs.loading')}
                                </td>
                            </tr>
                        ) : logs.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-6 py-12 text-center text-theme-text-tertiary">
                                    {t('logs.empty')}
                                </td>
                            </tr>
                        ) : (
                            logs.map((log) => (
                                <tr key={log.id} className="table-row">
                                    <td className="px-6 py-4 text-sm text-theme-text-secondary whitespace-nowrap">
                                        {new Date(log.processed_at).toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-theme-text-primary max-w-xs truncate" title={log.email_subject}>
                                        {log.email_subject}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`${log.status === 'success' ? 'badge-success' :
                                            log.status === 'skipped' ? 'badge-warning' : 'badge-error'
                                            }`}>
                                            {log.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-theme-text-tertiary">
                                        {log.extraction_method ?? '—'}
                                    </td>
                                    <td className="px-6 py-4">
                                        {log.extraction_method === 'whatsapp' ? (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-green-500/15 text-green-400">
                                                💬 WhatsApp
                                            </span>
                                        ) : log.extraction_method && ['upload', 'pdf_upload', 'paste', 'loom_import'].includes(log.extraction_method) ? (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-brand-500/10 text-brand-400">
                                                📤 Upload
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-accent-teal/10 text-accent-teal">
                                                🎥 Gmail
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-rose-400/70 max-w-xs truncate" title={log.error_message ?? ''}>
                                        {log.error_message ?? '—'}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
