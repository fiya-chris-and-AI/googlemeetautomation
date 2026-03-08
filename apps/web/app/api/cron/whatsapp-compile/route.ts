/**
 * WhatsApp session compiler — Vercel Cron Job.
 *
 * GET /api/cron/whatsapp-compile
 *
 * Runs on a schedule (defined in vercel.json) to compile idle WhatsApp
 * message buffers into transcript sessions. This replaces the setInterval
 * approach used in the Express worker since Vercel is serverless.
 *
 * Protected by CRON_SECRET to prevent unauthorized invocations.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '../../../../lib/supabase';
import { processUpload } from '../../../../lib/upload-pipeline';
import { autoExtractActionItems } from '../../../../lib/auto-extract';
import { autoExtractDecisions } from '../../../../lib/auto-extract-decisions';
import crypto from 'crypto';

const SESSION_IDLE_TIMEOUT_MINUTES = parseInt(
    process.env.WHATSAPP_SESSION_IDLE_TIMEOUT_MINUTES ?? '120',
    10,
);

// ── Types ───────────────────────────────────────────────────────────

interface RawMessage {
    id: string;
    group_id: string;
    group_name: string;
    sender_name: string;
    message_type: string;
    message_text: string | null;
    quoted_message_id: string | null;
    timestamp: string;
}

// ── Core compilation logic ──────────────────────────────────────────

/**
 * Split messages into sessions based on idle gaps.
 * A new session starts when the gap between consecutive messages
 * exceeds the idle timeout.
 */
function splitIntoSessions(
    messages: RawMessage[],
    idleTimeoutMs: number,
): RawMessage[][] {
    if (messages.length === 0) return [];

    const sessions: RawMessage[][] = [[]];

    for (let i = 0; i < messages.length; i++) {
        if (i > 0) {
            const gap =
                new Date(messages[i].timestamp).getTime() -
                new Date(messages[i - 1].timestamp).getTime();
            if (gap > idleTimeoutMs) {
                sessions.push([]);
            }
        }
        sessions[sessions.length - 1].push(messages[i]);
    }

    return sessions;
}

/**
 * Check if a session is "complete" — the last message is older than
 * the idle timeout, meaning the conversation has gone quiet.
 */
function isSessionComplete(
    session: RawMessage[],
    idleTimeoutMs: number,
): boolean {
    if (session.length === 0) return false;
    const lastTimestamp = new Date(session[session.length - 1].timestamp).getTime();
    return Date.now() - lastTimestamp > idleTimeoutMs;
}

/**
 * Compile messages into a readable transcript string.
 */
function compileTranscript(
    messages: RawMessage[],
    groupName: string,
): string {
    const participants = [...new Set(messages.map((m) => m.sender_name))].sort();
    const firstDate = messages[0]?.timestamp
        ? new Date(messages[0].timestamp)
        : new Date();

    const lines: string[] = [
        `WhatsApp Group: ${groupName}`,
        `Date: ${firstDate.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        })}`,
        `Participants: ${participants.join(', ')}`,
        `Messages: ${messages.length}`,
        '',
    ];

    for (const msg of messages) {
        const time = new Date(msg.timestamp).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        });

        let content = msg.message_text ?? '[media]';

        // If it's a reply, prefix with the quoted context indicator
        if (msg.message_type === 'reply' && msg.quoted_message_id) {
            content = `↳ ${content}`;
        }

        lines.push(`[${time}] ${msg.sender_name}: ${content}`);
    }

    return lines.join('\n');
}

/**
 * Generate a deterministic session ID from group + time window.
 */
function generateSessionId(groupId: string, firstTimestamp: string): string {
    const hash = crypto
        .createHash('sha256')
        .update(`${groupId}:${firstTimestamp}`)
        .digest('hex')
        .slice(0, 16);
    return `wa_${hash}`;
}

// ── Route handler ───────────────────────────────────────────────────

export async function GET(request: NextRequest) {
    // Verify the request is from Vercel Cron (production)
    // or allow in development
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getServerSupabase();
    const idleTimeoutMs = SESSION_IDLE_TIMEOUT_MINUTES * 60 * 1000;

    // Find groups with unprocessed messages
    const { data: rawGroups, error: groupError } = await supabase
        .from('whatsapp_messages')
        .select('group_id')
        .eq('processed', false);

    if (groupError) {
        console.error('[whatsapp:cron] Failed to fetch groups:', groupError.message);
        return NextResponse.json({ error: groupError.message }, { status: 500 });
    }

    const groupIds = [...new Set((rawGroups ?? []).map((r) => r.group_id as string))];

    if (groupIds.length === 0) {
        return NextResponse.json({ compiled: 0, message: 'No unprocessed messages' });
    }

    let totalCompiled = 0;

    for (const groupId of groupIds) {
        // Fetch all unprocessed messages for this group
        const { data: messages, error: msgError } = await supabase
            .from('whatsapp_messages')
            .select('*')
            .eq('group_id', groupId)
            .eq('processed', false)
            .order('timestamp', { ascending: true });

        if (msgError || !messages?.length) continue;

        const sessions = splitIntoSessions(messages as RawMessage[], idleTimeoutMs);

        for (const session of sessions) {
            // Only process sessions that have gone quiet (complete)
            if (!isSessionComplete(session, idleTimeoutMs)) continue;

            const groupName = session[0].group_name || groupId;
            const sessionId = generateSessionId(groupId, session[0].timestamp);
            const transcript = compileTranscript(session, groupName);
            const participants = [...new Set(session.map((m) => m.sender_name))];

            // Insert the compiled session
            const { error: sessionError } = await supabase
                .from('whatsapp_sessions')
                .upsert(
                    {
                        session_id: sessionId,
                        group_id: groupId,
                        group_name: groupName,
                        session_start: session[0].timestamp,
                        session_end: session[session.length - 1].timestamp,
                        message_count: session.length,
                        participants,
                        compiled_transcript: transcript,
                    },
                    { onConflict: 'session_id', ignoreDuplicates: true },
                );

            if (sessionError) {
                console.error(`[whatsapp:cron] Session insert failed:`, sessionError.message);
                continue;
            }

            // Push through the transcript pipeline (chunking + embeddings)
            try {
                const title = `WhatsApp: ${groupName}`;
                const date = new Date(session[0].timestamp);

                const result = await processUpload({
                    text: transcript,
                    title,
                    date,
                    extractionMethod: 'whatsapp',
                });

                // Auto-extract action items and decisions
                autoExtractActionItems(result.transcript_id).catch(() => { });
                autoExtractDecisions(result.transcript_id).catch(() => { });
            } catch (err) {
                console.error('[whatsapp:cron] Pipeline failed:', err);
            }

            // Mark source messages as processed
            const messageIds = session.map((m) => m.id);
            await supabase
                .from('whatsapp_messages')
                .update({ processed: true, session_id: sessionId })
                .in('id', messageIds);

            totalCompiled++;
            console.log(`[whatsapp:cron] Compiled session ${sessionId} — ${session.length} messages from "${groupName}"`);
        }
    }

    return NextResponse.json({
        compiled: totalCompiled,
        groupsChecked: groupIds.length,
    });
}
