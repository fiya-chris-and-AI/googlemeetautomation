'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
    format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
    eachDayOfInterval, isSameMonth, isToday, isWeekend,
    addMonths, subMonths, parseISO,
} from 'date-fns';
import { de, enUS } from 'date-fns/locale';
import type { DayMeetingSummary, ScoreboardMetrics, CumulativeStats } from '@meet-pipeline/shared';
import { useLocale } from '../../lib/locale';
import type { TranslationKey } from '../../lib/translations';

// ── Helpers ──────────────────────────────────────

/** Derive a human-readable cadence label from average meetings per week. */
function getCadenceLabelKey(avg: number): TranslationKey {
    if (avg >= 5) return 'calendar.cadence.daily';
    if (avg >= 3.5) return 'calendar.cadence.nearDaily';
    if (avg >= 2) return 'calendar.cadence.several';
    if (avg >= 1) return 'calendar.cadence.weekly';
    if (avg >= 0.5) return 'calendar.cadence.biweekly';
    return 'calendar.cadence.occasional';
}

/** Heatmap intensity class based on meeting count. */
function heatmapClass(count: number): string {
    if (count === 0) return 'bg-theme-muted/30';
    if (count === 1) return 'bg-brand-500/20';
    if (count === 2) return 'bg-brand-500/40';
    return 'bg-brand-500/70';
}

// ── Types for API response ───────────────────────

interface CalendarData {
    days: DayMeetingSummary[];
    scoreboard: ScoreboardMetrics;
    cumulative: CumulativeStats;
}

// ── Main page component ──────────────────────────

export default function CalendarPage() {
    const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
    const [data, setData] = useState<CalendarData | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedDay, setSelectedDay] = useState<string | null>(null);
    const { t, locale } = useLocale();
    const dateFnsLocale = locale === 'de' ? de : enUS;

    const fetchCalendar = useCallback(async (month: Date) => {
        setLoading(true);
        try {
            const y = month.getFullYear();
            const m = month.getMonth() + 1;
            const res = await fetch(`/api/calendar?year=${y}&month=${m}`);
            const json = (await res.json()) as CalendarData;
            setData(json);
        } catch {
            setData(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchCalendar(currentMonth); }, [currentMonth, fetchCalendar]);

    const handlePrev = () => { setCurrentMonth((m) => subMonths(m, 1)); setSelectedDay(null); };
    const handleNext = () => { setCurrentMonth((m) => addMonths(m, 1)); setSelectedDay(null); };

    // Build a lookup from date string → DayMeetingSummary
    const dayMap = useMemo(() => {
        const map = new Map<string, DayMeetingSummary>();
        if (data && Array.isArray(data.days)) {
            for (const d of data.days) map.set(d.date, d);
        }
        return map;
    }, [data]);

    // Calendar grid cells: Mon–Sun, including leading/trailing days
    const calendarDays = useMemo(() => {
        return eachDayOfInterval({
            start: startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 }),
            end: endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 }),
        });
    }, [currentMonth]);

    const scoreboard = data?.scoreboard;
    const cumulative = data?.cumulative ?? null;
    const selectedDayData = selectedDay ? dayMap.get(selectedDay) : null;
    const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

    const DAY_KEYS: TranslationKey[] = [
        'calendar.day.mon', 'calendar.day.tue', 'calendar.day.wed', 'calendar.day.thu',
        'calendar.day.fri', 'calendar.day.sat', 'calendar.day.sun',
    ];

    return (
        <div className="max-w-6xl mx-auto animate-fade-in">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-theme-text-primary tracking-tight">{t('calendar.title')}</h1>
                <p className="text-theme-text-tertiary mt-1">
                    {t('calendar.subtitle')}
                    {scoreboard && (
                        <span className="ml-3 text-theme-text-muted text-sm">
                            · {t('calendar.cadence')} <span className="text-brand-400 font-medium">{t(getCadenceLabelKey(scoreboard.averageMeetingsPerWeek))}</span>
                        </span>
                    )}
                </p>
            </div>

            {/* ── Scoreboard Header ───────────────────── */}
            {loading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="stat-card">
                            <p className="text-xs text-theme-text-tertiary font-medium uppercase tracking-wider">—</p>
                            <p className="text-3xl font-bold text-theme-text-primary mt-2">—</p>
                        </div>
                    ))}
                </div>
            ) : scoreboard && (
                <ScoreboardHeader scoreboard={scoreboard} t={t} />
            )}

            {/* ── All-Time Totals ─────────────────────── */}
            {loading ? (
                <div className="glass-card h-32 animate-pulse bg-theme-muted/20 mb-6" />
            ) : cumulative && (
                <AllTimeTotals cumulative={cumulative} t={t} dateFnsLocale={dateFnsLocale} />
            )}

            {/* ── Month Navigation ────────────────────── */}
            <div className="flex items-center justify-between mb-6">
                <button
                    onClick={handlePrev}
                    className="px-4 py-2 text-sm font-medium text-theme-text-secondary hover:text-theme-text-primary
                               bg-theme-raised hover:bg-theme-overlay rounded-xl border border-theme-border
                               transition-all duration-200"
                >
                    {t('calendar.prev')}
                </button>
                <h2 className="text-xl font-semibold text-theme-text-primary">
                    {format(currentMonth, 'MMMM yyyy', { locale: dateFnsLocale })}
                </h2>
                <button
                    onClick={handleNext}
                    className="px-4 py-2 text-sm font-medium text-theme-text-secondary hover:text-theme-text-primary
                               bg-theme-raised hover:bg-theme-overlay rounded-xl border border-theme-border
                               transition-all duration-200"
                >
                    {t('calendar.next')}
                </button>
            </div>

            {/* ── Calendar Grid ───────────────────────── */}
            <div className="glass-card p-4 mb-8">
                {/* Day headers */}
                <div className="grid grid-cols-7 mb-2">
                    {DAY_KEYS.map((key) => (
                        <div key={key} className="text-center text-xs text-theme-text-muted uppercase tracking-wider font-medium py-2">
                            {t(key)}
                        </div>
                    ))}
                </div>

                {/* Day cells */}
                <div className="grid grid-cols-7 gap-1">
                    {calendarDays.map((day) => {
                        const dateKey = format(day, 'yyyy-MM-dd');
                        const inMonth = isSameMonth(day, currentMonth);
                        const today = isToday(day);
                        const weekend = isWeekend(day);
                        const daySummary = dayMap.get(dateKey);
                        const meetingCount = daySummary?.totalMeetings ?? 0;
                        const isSelected = selectedDay === dateKey;

                        return (
                            <button
                                key={dateKey}
                                onClick={() => meetingCount > 0 && setSelectedDay(isSelected ? null : dateKey)}
                                className={`
                                    relative p-2 rounded-xl text-left min-h-[80px] transition-all duration-200 border
                                    ${!inMonth ? 'opacity-30 pointer-events-none' : ''}
                                    ${today ? 'ring-2 ring-brand-500/40' : ''}
                                    ${isSelected ? 'bg-brand-500/10 border-brand-500/20' : 'border-transparent hover:bg-theme-overlay'}
                                    ${weekend && inMonth ? 'bg-theme-muted/10' : ''}
                                    ${meetingCount > 0 ? 'cursor-pointer' : 'cursor-default'}
                                `}
                            >
                                <span className={`text-xs font-medium ${today ? 'text-brand-400' : 'text-theme-text-secondary'}`}>
                                    {format(day, 'd')}
                                </span>

                                {meetingCount > 0 && (
                                    <div className="mt-1.5">
                                        <div className="flex items-center gap-1">
                                            {Array.from({ length: Math.min(meetingCount, 3) }).map((_, i) => (
                                                <div key={i} className="w-1.5 h-1.5 rounded-full bg-brand-400" />
                                            ))}
                                            {meetingCount > 3 && (
                                                <span className="text-[9px] text-brand-400 font-medium">+{meetingCount - 3}</span>
                                            )}
                                        </div>
                                        <p className="text-[10px] text-theme-text-tertiary mt-1 truncate">
                                            {meetingCount === 1 ? daySummary!.meetings[0].title : `${meetingCount} ${t('calendar.meetings')}`}
                                        </p>
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ── Day Detail Panel ────────────────────── */}
            {selectedDayData && (
                <DayDetailPanel day={selectedDayData} t={t} locale={locale} dateFnsLocale={dateFnsLocale} />
            )}

            {/* ── Activity Heatmap ────────────────────── */}
            {!loading && data && (
                <ActivityHeatmap calendarDays={calendarDays} currentMonth={currentMonth} dayMap={dayMap} t={t} dateFnsLocale={dateFnsLocale} />
            )}

            {/* ── Collaboration Insights ──────────────── */}
            {!loading && scoreboard && (
                <CollaborationInsights scoreboard={scoreboard} t={t} />
            )}

            {/* ── Co-Founder Features ─────────────────── */}
            {!loading && scoreboard && (
                <CoFounderFeatures scoreboard={scoreboard} timezone={timezone} t={t} />
            )}
        </div>
    );
}

// ── Sub-components ───────────────────────────────

function ScoreboardHeader({ scoreboard, t }: { scoreboard: ScoreboardMetrics; t: (key: any) => string }) {
    const cards = [
        { label: t('calendar.scoreboard.meetings'), value: String(scoreboard.totalMeetings) },
        { label: t('calendar.scoreboard.estHours'), value: scoreboard.totalHours.toFixed(1) },
        { label: t('calendar.scoreboard.topics'), value: String(scoreboard.topicsDiscussed.length) },
        { label: t('calendar.scoreboard.actionItems'), value: String(scoreboard.totalActionItems) },
        { label: t('calendar.scoreboard.completion'), value: `${scoreboard.actionItemCompletionRate}%` },
        { label: t('calendar.scoreboard.streak'), value: `${scoreboard.streakDays}d` },
    ];

    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
            {cards.map((card) => (
                <div key={card.label} className="stat-card">
                    <p className="text-xs text-theme-text-tertiary font-medium uppercase tracking-wider">{card.label}</p>
                    <p className="text-3xl font-bold text-theme-text-primary mt-2">{card.value}</p>
                </div>
            ))}
        </div>
    );
}

function DayDetailPanel({ day, t, locale, dateFnsLocale }: { day: DayMeetingSummary; t: (key: any) => string; locale: string; dateFnsLocale: any }) {
    const date = parseISO(day.date);
    const estMinutes = Math.round(day.totalWords / 150);

    return (
        <div className="glass-card p-6 mb-8 animate-slide-up">
            <h3 className="text-lg font-semibold text-theme-text-primary mb-1">
                {format(date, 'EEEE, MMMM d, yyyy', { locale: dateFnsLocale })}
            </h3>
            <p className="text-sm text-theme-text-tertiary mb-4">
                {day.totalMeetings} {day.totalMeetings !== 1 ? t('calendar.meetings') : t('calendar.meeting')} · {day.totalWords.toLocaleString(locale === 'de' ? 'de-DE' : 'en-US')} {t('calendar.words')} · ~{estMinutes} min · {day.uniqueParticipants.length} {t('dashboard.transcripts.participants')}
            </p>

            <div className="space-y-3">
                {day.meetings.map((m) => (
                    <Link
                        key={m.transcript_id}
                        href={`/transcripts/${m.transcript_id}`}
                        className="block glass-card p-4 hover:bg-brand-500/5 transition-colors duration-200"
                    >
                        <p className="text-sm font-medium text-theme-text-primary">{m.title}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                            {m.participants.map((p: string) => (
                                <span key={p} className="badge-info text-[10px]">{p}</span>
                            ))}
                            <span className="text-xs text-theme-text-muted ml-auto">
                                {m.word_count.toLocaleString(locale === 'de' ? 'de-DE' : 'en-US')} {t('calendar.words')}
                            </span>
                            <span className={`text-[10px] font-medium ${m.extraction_method === 'inline' ? 'text-brand-400' :
                                m.extraction_method === 'google_doc' ? 'text-accent-teal' :
                                    m.extraction_method === 'upload' ? 'text-emerald-400' : 'text-accent-violet'
                                }`}>
                                {m.extraction_method}
                            </span>
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    );
}

function ActivityHeatmap({
    calendarDays, currentMonth, dayMap, t, dateFnsLocale,
}: {
    calendarDays: Date[];
    currentMonth: Date;
    dayMap: Map<string, DayMeetingSummary>;
    t: (key: any) => string;
    dateFnsLocale: any;
}) {
    // Only show days that belong to this month
    const monthDays = calendarDays.filter((d) => isSameMonth(d, currentMonth));

    return (
        <div className="glass-card p-6 mb-8">
            <h2 className="text-sm font-semibold text-theme-text-secondary uppercase tracking-wider mb-4">
                {t('calendar.heatmap.title')}
            </h2>
            <div className="flex flex-wrap gap-1.5">
                {monthDays.map((day) => {
                    const dateKey = format(day, 'yyyy-MM-dd');
                    const count = dayMap.get(dateKey)?.totalMeetings ?? 0;
                    return (
                        <div
                            key={dateKey}
                            title={`${format(day, 'MMM d', { locale: dateFnsLocale })}: ${count} ${count !== 1 ? 'meetings' : 'meeting'}`}
                            className={`w-7 h-7 rounded-md ${heatmapClass(count)} transition-colors duration-200`}
                        />
                    );
                })}
            </div>
            <div className="flex items-center gap-3 mt-3 text-[10px] text-theme-text-muted">
                <span>{t('calendar.heatmap.less')}</span>
                <div className="w-4 h-4 rounded bg-theme-muted/30" />
                <div className="w-4 h-4 rounded bg-brand-500/20" />
                <div className="w-4 h-4 rounded bg-brand-500/40" />
                <div className="w-4 h-4 rounded bg-brand-500/70" />
                <span>{t('calendar.heatmap.more')}</span>
            </div>
        </div>
    );
}

function CollaborationInsights({ scoreboard, t }: { scoreboard: ScoreboardMetrics; t: (key: any) => string }) {
    const participantEntries = Object.entries(scoreboard.meetingsByParticipant)
        .sort(([, a], [, b]) => (b as number) - (a as number));
    const maxCount = participantEntries.length > 0 ? (participantEntries[0][1] as number) : 1;

    return (
        <div className="glass-card p-6 mb-8">
            <h2 className="text-sm font-semibold text-theme-text-secondary uppercase tracking-wider mb-4">
                {t('calendar.collaboration.title')}
            </h2>

            {/* Who's Meeting Most — bar chart */}
            {participantEntries.length > 0 && (
                <div className="mb-6">
                    <h3 className="text-xs text-theme-text-tertiary font-medium mb-3">{t('calendar.collaboration.whosMeeting')}</h3>
                    <div className="space-y-2">
                        {participantEntries.slice(0, 8).map(([name, count]) => (
                            <div key={name as string} className="flex items-center gap-3">
                                <span className="text-xs text-theme-text-secondary w-28 truncate flex-shrink-0">{name as string}</span>
                                <div className="flex-1 h-5 bg-theme-muted/20 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-brand-500 rounded-full transition-all duration-500"
                                        style={{ width: `${((count as number) / maxCount) * 100}%` }}
                                    />
                                </div>
                                <span className="text-xs text-theme-text-muted w-6 text-right">{count as number}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Busiest Day */}
            {scoreboard.busiestDay && (
                <div className="mb-6">
                    <h3 className="text-xs text-theme-text-tertiary font-medium mb-2">{t('calendar.collaboration.busiestDay')}</h3>
                    <span className="badge-success text-sm">{scoreboard.busiestDay}</span>
                </div>
            )}

            {/* Topics Discussed */}
            {scoreboard.topicsDiscussed.length > 0 && (
                <div>
                    <h3 className="text-xs text-theme-text-tertiary font-medium mb-2">{t('calendar.collaboration.topics')}</h3>
                    <div className="flex flex-wrap gap-2">
                        {scoreboard.topicsDiscussed.map((topic: string) => (
                            <span key={topic} className="badge-info">{topic}</span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function CoFounderFeatures({
    scoreboard, timezone, t,
}: {
    scoreboard: ScoreboardMetrics;
    timezone: string;
    t: (key: any) => string;
}) {
    const velocityMax = Math.max(scoreboard.actionItemsCreated, scoreboard.actionItemsCompleted, 1);

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {/* Participant Pair Analysis */}
            <div className="glass-card p-6">
                <h2 className="text-sm font-semibold text-theme-text-secondary uppercase tracking-wider mb-4">
                    {t('calendar.cofounder.title')}
                </h2>
                <div className="space-y-3">
                    <PairRow label={t('calendar.cofounder.together')} value={scoreboard.meetingsTogether} color="bg-brand-400" />
                    <PairRow label={t('calendar.cofounder.lutfiyaSolo')} value={scoreboard.lutfiyaSolo} color="bg-accent-teal" />
                    <PairRow label={t('calendar.cofounder.chrisSolo')} value={scoreboard.chrisSolo} color="bg-accent-violet" />
                    <PairRow label={t('calendar.cofounder.external')} value={scoreboard.withExternalGuests} color="bg-amber-400" />
                </div>
            </div>

            {/* Action Item Velocity + Free Days + Timezone */}
            <div className="glass-card p-6">
                <h2 className="text-sm font-semibold text-theme-text-secondary uppercase tracking-wider mb-4">
                    {t('calendar.productivity.title')}
                </h2>

                {/* Action Item Velocity */}
                <div className="mb-5">
                    <p className="text-xs text-theme-text-tertiary mb-2">
                        {t('calendar.productivity.velocity')} — <span className="text-amber-400">{scoreboard.actionItemsCreated} {t('calendar.productivity.created')}</span> · <span className="text-emerald-400">{scoreboard.actionItemsCompleted} {t('calendar.productivity.completed')}</span>
                    </p>
                    <div className="space-y-1.5">
                        <div className="h-3 bg-theme-muted/20 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-amber-500 rounded-full transition-all duration-500"
                                style={{ width: `${(scoreboard.actionItemsCreated / velocityMax) * 100}%` }}
                            />
                        </div>
                        <div className="h-3 bg-theme-muted/20 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                                style={{ width: `${(scoreboard.actionItemsCompleted / velocityMax) * 100}%` }}
                            />
                        </div>
                    </div>
                </div>

                {/* No-Meeting Weekdays */}
                <div className="mb-5">
                    <p className="text-xs text-theme-text-tertiary mb-1">{t('calendar.productivity.freeDays')}</p>
                    <p className="text-2xl font-bold text-theme-text-primary">
                        {scoreboard.freeDays} <span className="text-sm font-normal text-theme-text-muted">{scoreboard.freeDays !== 1 ? t('calendar.productivity.days') : t('calendar.productivity.day')}</span>
                    </p>
                </div>

                {/* Timezone */}
                <div className="pt-3 border-t border-theme-border">
                    <p className="text-[11px] text-theme-text-muted">
                        📍 {t('calendar.timezone')} — <span className="font-medium text-theme-text-tertiary">{timezone}</span>
                    </p>
                </div>
            </div>
        </div>
    );
}

function PairRow({ label, value, color }: { label: string; value: number; color: string }) {
    return (
        <div className="flex items-center gap-3">
            <div className={`w-2.5 h-2.5 rounded-full ${color} flex-shrink-0`} />
            <span className="text-sm text-theme-text-secondary flex-1">{label}</span>
            <span className="text-lg font-bold text-theme-text-primary">{value}</span>
        </div>
    );
}

/** Compact all-time totals section — text-driven, visually distinct from monthly stat cards. */
function AllTimeTotals({ cumulative, t, dateFnsLocale }: { cumulative: CumulativeStats; t: (key: any) => string; dateFnsLocale: any }) {
    const sinceLabel = cumulative.firstMeetingDate
        ? format(parseISO(cumulative.firstMeetingDate), 'MMM yyyy', { locale: dateFnsLocale })
        : null;

    return (
        <div className="glass-card p-6 mb-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-theme-text-secondary uppercase tracking-wider">
                    {t('calendar.allTime.title')}
                </h2>
                {sinceLabel && (
                    <span className="text-xs text-theme-text-muted">
                        {t('calendar.allTime.since')} {sinceLabel}
                    </span>
                )}
            </div>

            {/* Primary stats line */}
            <p className="text-sm text-theme-text-primary leading-relaxed">
                <span className="font-semibold text-brand-400">{cumulative.totalMeetings}</span> {t('calendar.allTime.meetings')}
                {' · ~'}<span className="font-semibold text-accent-teal">{cumulative.totalHours.toFixed(1)}h</span>
                {' · '}<span className="font-semibold text-amber-400">{cumulative.totalActionItems}</span> {t('calendar.allTime.actionItems')}
                {' · '}<span className="font-semibold text-emerald-400">{cumulative.actionItemCompletionRate}%</span> {t('calendar.allTime.completion')}
            </p>

            {/* Secondary stats line */}
            <p className="text-xs text-theme-text-tertiary mt-1.5">
                {cumulative.topicsDiscussed.length} {t('calendar.allTime.topics')}
                {' · '}{cumulative.uniqueParticipants.length} {t('calendar.allTime.participants')}
                {cumulative.busiestDay && <>{' · '}{t('calendar.allTime.busiestDay')} <span className="text-theme-text-secondary">{cumulative.busiestDay}</span></>}
            </p>

            {/* Co-founder mini-stats */}
            <div className="flex flex-wrap gap-3 mt-4">
                <span className="inline-flex items-center gap-1.5 text-xs text-theme-text-secondary bg-brand-500/10 px-2.5 py-1 rounded-lg">
                    <span className="w-2 h-2 rounded-full bg-brand-400" />
                    {t('calendar.allTime.together')} <span className="font-semibold">{cumulative.meetingsTogether}</span>
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs text-theme-text-secondary bg-accent-teal/10 px-2.5 py-1 rounded-lg">
                    <span className="w-2 h-2 rounded-full bg-accent-teal" />
                    {t('calendar.allTime.lutfiyaSolo')} <span className="font-semibold">{cumulative.lutfiyaSolo}</span>
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs text-theme-text-secondary bg-accent-violet/10 px-2.5 py-1 rounded-lg">
                    <span className="w-2 h-2 rounded-full bg-accent-violet" />
                    {t('calendar.allTime.chrisSolo')} <span className="font-semibold">{cumulative.chrisSolo}</span>
                </span>
            </div>

            {/* Footer */}
            <p className="text-xs text-theme-text-muted mt-3 pt-3 border-t border-theme-border">
                {t('calendar.allTime.avg')} <span className="font-medium text-theme-text-tertiary">{cumulative.averageMeetingsPerMonth.toFixed(1)}</span> {t('calendar.allTime.meetingsPerMonth')}
                {' · '}<span className="font-medium text-theme-text-tertiary">{cumulative.totalMonthsActive}</span> {cumulative.totalMonthsActive !== 1 ? t('calendar.allTime.activeMonths') : t('calendar.allTime.activeMonth')}
            </p>
        </div>
    );
}
