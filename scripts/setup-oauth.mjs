#!/usr/bin/env node
/**
 * Google OAuth2 Setup Script for Meet Transcript Pipeline
 * 
 * Spins up a temporary localhost server to receive the OAuth callback.
 * Google deprecated the OOB flow, so this is the required approach.
 * 
 * Prerequisites:
 *   - Create OAuth 2.0 Client ID (type: "Web application") at
 *     https://console.cloud.google.com/apis/credentials
 *   - Add http://localhost:3333/callback as an Authorized redirect URI
 *   - Put the Client ID and Client Secret in your .env file
 *   - Enable Gmail API, Google Docs API, and Google Drive API
 * 
 * Usage: node scripts/setup-oauth.mjs
 */

import { google } from 'googleapis';
import * as fs from 'fs';
import * as http from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ENV_PATH = join(__dirname, '..', '.env');

const REDIRECT_URI = 'http://localhost:3333/callback';

const SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/documents.readonly',
    'https://www.googleapis.com/auth/drive.readonly',
];

function readEnvValue(key) {
    const content = fs.readFileSync(ENV_PATH, 'utf-8');
    for (const line of content.split('\n')) {
        const match = new RegExp(`^${key}=(.+)$`).exec(line);
        if (match) return match[1].trim();
    }
    return '';
}

function updateEnvValue(key, value) {
    let content = fs.readFileSync(ENV_PATH, 'utf-8');
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(content)) {
        content = content.replace(regex, `${key}=${value}`);
    } else {
        content += `\n${key}=${value}`;
    }
    fs.writeFileSync(ENV_PATH, content);
}

async function main() {
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║   MeetScript — Google OAuth2 Setup              ║');
    console.log('╚══════════════════════════════════════════════════╝\n');

    const clientId = readEnvValue('GOOGLE_CLIENT_ID');
    const clientSecret = readEnvValue('GOOGLE_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
        console.error('✗ GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in .env first.');
        process.exit(1);
    }

    console.log(`✓ Client ID: ${clientId.slice(0, 20)}...`);

    const oauth2 = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

    const authUrl = oauth2.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent',
    });

    // Start a temporary HTTP server to catch the redirect
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, `http://localhost:3333`);

        if (url.pathname !== '/callback') {
            res.writeHead(404);
            res.end('Not found');
            return;
        }

        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');

        if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`<h1>Error: ${error}</h1><p>Please try again.</p>`);
            server.close();
            process.exit(1);
        }

        if (!code) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end('<h1>No authorization code received</h1>');
            server.close();
            process.exit(1);
        }

        try {
            const { tokens } = await oauth2.getToken(code);

            if (!tokens.refresh_token) {
                res.writeHead(500, { 'Content-Type': 'text/html' });
                res.end('<h1>No refresh token received</h1><p>Try revoking app access at myaccount.google.com and retry.</p>');
                server.close();
                process.exit(1);
            }

            updateEnvValue('GOOGLE_REFRESH_TOKEN', tokens.refresh_token);

            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
        <html><body style="background:#0a0f1e;color:#e5e7eb;font-family:Inter,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
          <div style="text-align:center">
            <h1 style="color:#2dd4bf;font-size:2rem">✓ OAuth Setup Complete!</h1>
            <p style="color:#9ca3af;margin-top:1rem">Refresh token saved to .env</p>
            <p style="color:#6b7280;margin-top:0.5rem">You can close this tab.</p>
          </div>
        </body></html>
      `);

            console.log('\n✓ Refresh token saved to .env');
            console.log('✓ OAuth2 setup complete!\n');

            server.close();
            process.exit(0);
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'text/html' });
            res.end(`<h1>Token exchange failed</h1><p>${err.message}</p>`);
            console.error(`\n✗ Token exchange failed: ${err.message}`);
            server.close();
            process.exit(1);
        }
    });

    server.listen(3333, () => {
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('\n1. Open this URL in your browser:\n');
        console.log(authUrl);
        console.log('\n2. Sign in with solutions@3rdaillc.com');
        console.log('3. Authorize the app — you\'ll be redirected back automatically\n');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log('⏳ Waiting for authorization callback on http://localhost:3333 ...\n');
    });
}

main().catch(console.error);
