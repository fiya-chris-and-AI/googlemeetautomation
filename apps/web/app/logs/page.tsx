'use client';

import { useState, useEffect } from 'react';
import type { ProcessingLogEntry } from '@meet-pipeline/shared';

/**
 * Processing Log — table showing every email the worker has processed.
 * Useful for debugging when a transcript doesn't show up.
 */
export default function LogsPage() {
    const [logs, setLogs] = useState<ProcessingLogEntry[]>([]);
    const [loading, setLoading] = useState(true);

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
                <h1 className="text-3xl font-bold text-gray-100 tracking-tight">Processing Log</h1>
                <p className="text-gray-500 mt-1">Track every email processed by the worker</p>
            </div>

            <div className="glass-card overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-white/[0.06]">
                            <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                Timestamp
                            </th>
                            <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                Email Subject
                            </th>
                            <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                Status
                            </th>
                            <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                Method
                            </th>
                            <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                Error
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                                    Loading logs...
                                </td>
                            </tr>
                        ) : logs.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                                    No processing logs yet.
                                </td>
                            </tr>
                        ) : (
                            logs.map((log) => (
                                <tr key={log.id} className="table-row">
                                    <td className="px-6 py-4 text-sm text-gray-400 whitespace-nowrap">
                                        {new Date(log.processed_at).toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-300 max-w-xs truncate" title={log.email_subject}>
                                        {log.email_subject}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`${log.status === 'success' ? 'badge-success' :
                                                log.status === 'skipped' ? 'badge-warning' : 'badge-error'
                                            }`}>
                                            {log.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-500">
                                        {log.extraction_method ?? '—'}
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
