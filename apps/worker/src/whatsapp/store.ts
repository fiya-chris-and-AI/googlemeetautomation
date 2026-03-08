/**
 * WhatsApp message store — handles dedup + persistence in Supabase.
 *
 * Single-responsibility: save messages and query unprocessed ones.
 * Session linkage is handled by the session compiler.
 */

import { getSupabaseClient } from '../db/supabase.js';

interface MessageToSave {
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
    raw_payload: Record<string, unknown>;
}

/**
 * Save a WhatsApp message with dedup by wamid.
 * Returns true if newly inserted, false if it was a duplicate.
 */
export async function saveMessage(msg: MessageToSave): Promise<boolean> {
    const { error } = await getSupabaseClient()
        .from('whatsapp_messages')
        .upsert(
            {
                id: msg.id,
                group_id: msg.group_id,
                group_name: msg.group_name,
                sender_phone: msg.sender_phone,
                sender_name: msg.sender_name,
                message_type: msg.message_type,
                message_text: msg.message_text,
                quoted_message_id: msg.quoted_message_id,
                media_caption: msg.media_caption,
                timestamp: msg.timestamp,
                raw_payload: msg.raw_payload,
                processed: false,
            },
            { onConflict: 'id', ignoreDuplicates: true },
        );

    if (error) {
        console.error(`[whatsapp:store] Failed to save message ${msg.id}:`, error.message);
        return false;
    }

    return true;
}

/**
 * Fetch unprocessed messages for a given group, ordered by timestamp.
 */
export async function getUnprocessedMessages(groupId: string) {
    const { data, error } = await getSupabaseClient()
        .from('whatsapp_messages')
        .select('*')
        .eq('group_id', groupId)
        .eq('processed', false)
        .order('timestamp', { ascending: true });

    if (error) {
        console.error(`[whatsapp:store] Failed to fetch messages for group ${groupId}:`, error.message);
        return [];
    }

    return data ?? [];
}

/**
 * Fetch all distinct group IDs that have unprocessed messages.
 */
export async function getGroupsWithUnprocessedMessages(): Promise<string[]> {
    const { data, error } = await getSupabaseClient()
        .from('whatsapp_messages')
        .select('group_id')
        .eq('processed', false);

    if (error) {
        console.error('[whatsapp:store] Failed to fetch groups:', error.message);
        return [];
    }

    // Deduplicate group_id values
    const groupIds = new Set((data ?? []).map((row) => row.group_id as string));
    return Array.from(groupIds);
}

/**
 * Mark messages as processed and link them to a compiled session.
 */
export async function markMessagesProcessed(
    messageIds: string[],
    sessionId: string,
): Promise<void> {
    const { error } = await getSupabaseClient()
        .from('whatsapp_messages')
        .update({ processed: true, session_id: sessionId })
        .in('id', messageIds);

    if (error) {
        console.error(`[whatsapp:store] Failed to mark messages processed:`, error.message);
    }
}
