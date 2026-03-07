/**
 * Static EN/DE translation dictionary for UI chrome.
 *
 * Why static? The dashboard has ~35 known strings. A hardcoded dictionary
 * costs $0 (no API calls), is instant, and yields predictable results.
 * Dynamic content (transcript titles, participant names) stays untranslated.
 */

export type Locale = 'en' | 'de';

export type TranslationKey = keyof typeof translations.en;

export const translations = {
    en: {
        // Dashboard
        'dashboard.title': 'Dashboard',
        'dashboard.subtitle': 'Your meeting transcript overview',
        'dashboard.search.placeholder': 'Ask a question about your meetings...',
        'dashboard.search.button': 'Ask AI',
        'dashboard.search.loading': 'Searching...',
        'dashboard.stat.total': 'Total Transcripts',
        'dashboard.stat.week': 'This Week',
        'dashboard.stat.month': 'This Month',
        'dashboard.calendar.title': 'This Month at a Glance',
        'dashboard.calendar.meetings': 'meetings',
        'dashboard.calendar.total': 'total',
        'dashboard.calendar.topics': 'topics',
        'dashboard.calendar.completion': 'completion',
        'dashboard.calendar.allTime': 'All-time:',
        'dashboard.calendar.actionItems': 'action items',
        'dashboard.calendar.monthAvg': '/month avg',
        'dashboard.calendar.viewCalendar': 'View Calendar →',
        'dashboard.participants.title': 'Most Frequent Participants',
        'dashboard.transcripts.title': 'Recent Transcripts',
        'dashboard.transcripts.loading': 'Loading...',
        'dashboard.transcripts.empty': 'No transcripts yet. Processed emails will appear here.',
        'dashboard.transcripts.words': 'words',
        'dashboard.transcripts.participants': 'participants',
        'dashboard.actions.title': 'Open Action Items',
        'dashboard.actions.viewAll': 'View All →',
        'dashboard.actions.overdue': 'overdue',
        'dashboard.actions.start': 'Start',
        'dashboard.actions.done': 'Done',
        'dashboard.activity.title': 'Recent Activity',
        'dashboard.sources': 'Sources',

        // Sidebar
        'sidebar.brand': 'Transcript Pipeline',
        'sidebar.upload': 'Upload Transcript',
        'sidebar.nav.dashboard': 'Dashboard',
        'sidebar.nav.calendar': 'Calendar',
        'sidebar.nav.transcripts': 'Transcripts',
        'sidebar.nav.actionItems': 'Action Items',
        'sidebar.nav.decisions': 'Decisions',
        'sidebar.nav.archive': 'Archive',
        'sidebar.nav.askAi': 'Ask AI',
        'sidebar.nav.logs': 'Logs',
        'sidebar.admin': 'Admin',
        'sidebar.logout': 'Logout',

        // Locale toggle — shows the OTHER language
        'locale.toggle': 'Deutsch',
    },

    de: {
        // Dashboard
        'dashboard.title': 'Übersicht',
        'dashboard.subtitle': 'Ihre Besprechungstranskript-Übersicht',
        'dashboard.search.placeholder': 'Stellen Sie eine Frage zu Ihren Besprechungen...',
        'dashboard.search.button': 'KI fragen',
        'dashboard.search.loading': 'Suche...',
        'dashboard.stat.total': 'Transkripte gesamt',
        'dashboard.stat.week': 'Diese Woche',
        'dashboard.stat.month': 'Diesen Monat',
        'dashboard.calendar.title': 'Dieser Monat auf einen Blick',
        'dashboard.calendar.meetings': 'Besprechungen',
        'dashboard.calendar.total': 'gesamt',
        'dashboard.calendar.topics': 'Themen',
        'dashboard.calendar.completion': 'Erledigung',
        'dashboard.calendar.allTime': 'Insgesamt:',
        'dashboard.calendar.actionItems': 'Aufgaben',
        'dashboard.calendar.monthAvg': '/Monat Ø',
        'dashboard.calendar.viewCalendar': 'Kalender anzeigen →',
        'dashboard.participants.title': 'Häufigste Teilnehmer',
        'dashboard.transcripts.title': 'Neueste Transkripte',
        'dashboard.transcripts.loading': 'Wird geladen...',
        'dashboard.transcripts.empty': 'Noch keine Transkripte. Verarbeitete E-Mails erscheinen hier.',
        'dashboard.transcripts.words': 'Wörter',
        'dashboard.transcripts.participants': 'Teilnehmer',
        'dashboard.actions.title': 'Offene Aufgaben',
        'dashboard.actions.viewAll': 'Alle anzeigen →',
        'dashboard.actions.overdue': 'überfällig',
        'dashboard.actions.start': 'Starten',
        'dashboard.actions.done': 'Erledigt',
        'dashboard.activity.title': 'Letzte Aktivitäten',
        'dashboard.sources': 'Quellen',

        // Sidebar
        'sidebar.brand': 'Transkript-Pipeline',
        'sidebar.upload': 'Transkript hochladen',
        'sidebar.nav.dashboard': 'Übersicht',
        'sidebar.nav.calendar': 'Kalender',
        'sidebar.nav.transcripts': 'Transkripte',
        'sidebar.nav.actionItems': 'Aufgaben',
        'sidebar.nav.decisions': 'Entscheidungen',
        'sidebar.nav.archive': 'Archiv',
        'sidebar.nav.askAi': 'KI fragen',
        'sidebar.nav.logs': 'Protokolle',
        'sidebar.admin': 'Admin',
        'sidebar.logout': 'Abmelden',

        // Locale toggle — shows the OTHER language
        'locale.toggle': 'English',
    },
} as const;
