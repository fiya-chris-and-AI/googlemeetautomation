import { google, gmail_v1 } from 'googleapis';
import { config } from '../config.js';

let gmailClient: gmail_v1.Gmail | null = null;

/**
 * Returns a singleton Gmail API client authenticated via OAuth2 refresh token.
 * The refresh token is long-lived and automatically exchanges for short-lived
 * access tokens behind the scenes.
 */
export function getGmailClient(): gmail_v1.Gmail {
    if (!gmailClient) {
        const oauth2 = new google.auth.OAuth2(
            config.google.clientId,
            config.google.clientSecret
        );
        oauth2.setCredentials({ refresh_token: config.google.refreshToken });

        gmailClient = google.gmail({ version: 'v1', auth: oauth2 });
    }
    return gmailClient;
}

/**
 * Returns a Google Docs API client (reuses the same OAuth2 credentials).
 */
export function getDocsClient() {
    const oauth2 = new google.auth.OAuth2(
        config.google.clientId,
        config.google.clientSecret
    );
    oauth2.setCredentials({ refresh_token: config.google.refreshToken });

    return google.docs({ version: 'v1', auth: oauth2 });
}

/**
 * Returns a Google Drive API client for file exports.
 */
export function getDriveClient() {
    const oauth2 = new google.auth.OAuth2(
        config.google.clientId,
        config.google.clientSecret
    );
    oauth2.setCredentials({ refresh_token: config.google.refreshToken });

    return google.drive({ version: 'v3', auth: oauth2 });
}
