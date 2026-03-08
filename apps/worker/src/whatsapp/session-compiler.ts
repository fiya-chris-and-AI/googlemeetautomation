/**
 * Session compiler — aggregates buffered WhatsApp messages into
 * conversation sessions and feeds them into the transcript pipeline.
 *
 * Triggered on a configurable interval (default: every 30 minutes).
 * Groups messages by WhatsApp group + idle timeout (default: 2 hours).
 *
 * Pipeline: messages → session → compiled transcript → transcripts table
 *           → chunking → embeddings → RAG-searchable
 */

import slugify from 'slugify';
import { getSupabaseClient } from '../db/supabase.js';
import { chunkTranscript } from '../chunking/chunker.js';
import { generateEmbeddings } from '../embedding/embedder.js';
import { insertTranscript, insertChunks, logProcessing } from '../db/queries.js';
import { getGroupsWithUnprocessedMessages, getUnprocessedMessages, markMessagesProcessed } from './store.js';

// ── Types ───────────────────────────────────────────────────────────

interface BufferedMessage {
    id: string;
    group_id: string;
    group_name: string;
    sender_phone: string;
    sender_name: string;
    message_type: string;
    message_text: string | null;
    quoted_message_id: string | null;
    media_caption: string | null;
    timestamp: string;
}

interface CompiledSession {
    id: string;
    group_id: string;
    group_name: string;
    participants: string[];
    session_start: string;
    session_end: string;
    message_count: number;
    compiled_transcript: string;
    word_count: number;
    message_ids: string[];
}

// ── Main entry point ────────────────────────────────────────────────

/**
 * Top-level session compiler — scans all groups with unprocessed messages,
 * detects idle gaps, compiles sessions, and pushes them through the pipeline.
 *
 * Called on a periodic interval from index.ts.
 */
export async function runSessionCompiler(
    idleTimeoutMinutes: number = 120,
): Promise<number> {
    const groupIds = await getGroupsWithUnprocessedMessages();

    if (groupIds.length === 0) return 0;

    console.log(`[whatsapp:compiler] Found ${groupIds.length} group(s) with unprocessed messages`);

    let compiledCount = 0;

    for (const groupId of groupIds) {
        const messages = await getUnprocessedMessages(groupId);
        if (messages.length === 0) continue;

        // Split messages into sessions based on idle gaps
        const sessions = splitIntoSessions(messages as BufferedMessage[], idleTimeoutMinutes);

        // Only process sessions that appear "complete" (idle timeout has passed)
        const now = Date.now();
        const idleMs = idleTimeoutMinutes * 60 * 1000;

        for (const sessionMsgs of sessions) {
            const lastMsgTime = new Date(sessionMsgs[sessionMsgs.length - 1].timestamp).getTime();
            const timeSinceLast = now - lastMsgTime;

            // Skip sessions that are still "active" (haven't hit idle timeout)
            if (timeSinceLast < idleMs) {
                console.log(`[whatsapp:compiler] Skipping active session in ${groupId} — last message ${Math.round(timeSinceLast / 60000)}m ago`);
                continue;
            }

            try {
                const compiled = compileSession(sessionMsgs, groupId);
                await processCompiledSession(compiled);
                compiledCount++;
                console.log(`[whatsapp:compiler] ✓ Compiled session ${compiled.id} — ${compiled.message_count} messages`);
            } catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err);
                console.error(`[whatsapp:compiler] ✗ Failed to compile session in ${groupId}:`, errMsg);
            }
        }
    }

    return compiledCount;
}

// ── Session splitting ───────────────────────────────────────────────

/**
 * Split a chronologically sorted list of messages into conversation
 * sessions. A new session starts when the gap between consecutive
 * messages exceeds `idleTimeoutMinutes`.
 */
function splitIntoSessions(
    messages: BufferedMessage[],
    idleTimeoutMinutes: number,
): BufferedMessage[][] {
    if (messages.length === 0) return [];

    const idleMs = idleTimeoutMinutes * 60 * 1000;
    const sessions: BufferedMessage[][] = [[messages[0]]];

    for (let i = 1; i < messages.length; i++) {
        const prevTime = new Date(messages[i - 1].timestamp).getTime();
        const currTime = new Date(messages[i].timestamp).getTime();
        const gap = currTime - prevTime;

        if (gap >= idleMs) {
            // Start a new session
            sessions.push([messages[i]]);
        } else {
            // Append to current session
            sessions[sessions.length - 1].push(messages[i]);
        }
    }

    return sessions;
}

// ── Compilation ─────────────────────────────────────────────────────

/**
 * Compile a group of messages into a structured transcript format.
 */
function compileSession(
    messages: BufferedMessage[],
    groupId: string,
): CompiledSession {
    const groupName = messages[0].group_name || groupId;
    const sessionStart = messages[0].timestamp;
    const sessionEnd = messages[messages.length - 1].timestamp;
    const date = new Date(sessionStart);

    // Collect unique participants (by sender name)
    const participantSet = new Set<string>();
    for (const msg of messages) {
        participantSet.add(msg.sender_name);
    }
    const participants = Array.from(participantSet).sort();

    // Build a lookup for quoted messages (for reply context)
    const msgById = new Map<string, BufferedMessage>();
    for (const msg of messages) {
        msgById.set(msg.id, msg);
    }

    // Format lines
    const lines: string[] = [
        `WhatsApp Group: ${groupName}`,
        `Date: ${date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`,
        `Participants: ${participants.join(', ')}`,
        '',
    ];

    for (const msg of messages) {
        const time = new Date(msg.timestamp).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        });

        const text = msg.message_text ?? msg.media_caption ?? '';

        // Add reply context if this message quotes another
        if (msg.quoted_message_id) {
            const quoted = msgById.get(msg.quoted_message_id);
            if (quoted) {
                const quotedSnippet = (quoted.message_text ?? quoted.media_caption ?? '').slice(0, 100);
                lines.push(`[${time}] ${msg.sender_name}: ${text}`);
                lines.push(`  ↳ (replying to ${quoted.sender_name}): ${quotedSnippet}`);
            } else {
                lines.push(`[${time}] ${msg.sender_name}: ${text}`);
                lines.push(`  ↳ (replying to a previous message)`);
            }
        } else {
            lines.push(`[${time}] ${msg.sender_name}: ${text}`);
        }
    }

    const compiledTranscript = lines.join('\n');
    const wordCount = compiledTranscript.split(/\s+/).filter(Boolean).length;

    // Generate a deterministic session ID
    const dateStr = date.toISOString().split('T')[0];
    const groupSlug = slugify(groupName, { lower: true, strict: true });
    // Count existing sessions for this group on this date to generate a session number
    const sessionId = `${dateStr}_${groupSlug}_wa`;

    return {
        id: sessionId,
        group_id: groupId,
        group_name: groupName,
        participants,
        session_start: sessionStart,
        session_end: sessionEnd,
        message_count: messages.length,
        compiled_transcript: compiledTranscript,
        word_count: wordCount,
        message_ids: messages.map((m) => m.id),
    };
}

// ── Pipeline integration ────────────────────────────────────────────

/**
 * Process a compiled session: store in whatsapp_sessions, insert into
 * the transcripts table, chunk -> embed -> store chunks.
 */
async function processCompiledSession(session: CompiledSession): Promise<void> {
    const supabase = getSupabaseClient();

    // 1. Deduplicate — check if this session already exists
    const { data: existing } = await supabase
        .from('whatsapp_sessions')
        .select('id')
        .eq('id', session.id)
        .limit(1);

    if (existing && existing.length > 0) {
        console.log(`[whatsapp:compiler] Session ${session.id} already exists — skipping`);
        // Still mark messages as processed so they don't get recompiled
        await markMessagesProcessed(session.message_ids, session.id);
        return;
    }

    // 2. Insert into whatsapp_sessions
    const { error: sessionErr } = await supabase
        .from('whatsapp_sessions')
        .insert({
            id: session.id,
            group_id: session.group_id,
            group_name: session.group_name,
            participants: session.participants,
            session_start: session.session_start,
            session_end: session.session_end,
            message_count: session.message_count,
            compiled_transcript: session.compiled_transcript,
            word_count: session.word_count,
            source_type: 'whatsapp',
            processed_at: new Date().toISOString(),
        });

    if (sessionErr) {
        throw new Error(`Failed to insert whatsapp_session: ${sessionErr.message}`);
    }

    // 3. Insert into the main transcripts table so it flows through RAG
    const transcript = {
        transcript_id: session.id,
        meeting_title: `WhatsApp: ${session.group_name}`,
        meeting_date: session.session_start,
        participants: session.participants,
        raw_transcript: session.compiled_transcript,
        source_email_id: `whatsapp:${session.id}`,
        extraction_method: 'whatsapp' as const,
        word_count: session.word_count,
        processed_at: new Date().toISOString(),
    };

    await insertTranscript(transcript);

    // 4. Chunk and embed for RAG search
    const chunks = chunkTranscript(session.compiled_transcript);
    const chunkTexts = chunks.map((c) => c.text);
    const embeddings = await generateEmbeddings(chunkTexts);

    const chunkRecords = chunks.map((c, i) => ({
        id: `${session.id}_chunk_${c.index}`,
        transcript_id: session.id,
        meeting_title: transcript.meeting_title,
        meeting_date: transcript.meeting_date,
        participants: session.participants,
        chunk_index: c.index,
        total_chunks: c.totalChunks,
        text: c.text,
        embedding: embeddings[i],
        token_estimate: c.tokenEstimate,
        created_at: new Date().toISOString(),
    }));

    await insertChunks(chunkRecords);

    // 5. Mark all source messages as processed
    await markMessagesProcessed(session.message_ids, session.id);

    // 6. Log processing
    await logProcessing({
        sourceEmailId: `whatsapp:${session.id}`,
        emailSubject: `WhatsApp: ${session.group_name}`,
        status: 'success',
        extractionMethod: 'whatsapp',
    });

    console.log(`[whatsapp:compiler] ✓ Session ${session.id}: ${session.message_count} msgs, ${chunks.length} chunks, ${embeddings.length} embeddings`);
}
