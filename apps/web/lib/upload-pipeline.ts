import OpenAI from 'openai';
import { getServerSupabase } from './supabase';
import type { MeetingTranscript, TranscriptChunk, ExtractionMethod } from '@meet-pipeline/shared';

/** Simple slug helper — avoids adding slugify as a dependency. */
function slugify(text: string): string {
    return text
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
}

// ── Parsers (copied from worker — pure functions, no deps) ──────────

/** Strip VTT formatting: timecodes, headers, cue IDs. Preserve speaker tags. */
export function parseVtt(raw: string): string {
    const lines = raw.split('\n');
    const result: string[] = [];

    for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed === 'WEBVTT' || trimmed === '' || trimmed.startsWith('NOTE')) continue;
        if (/^\d{2}:\d{2}/.test(trimmed) && trimmed.includes('-->')) continue;
        if (/^\d+$/.test(trimmed)) continue;

        const speakerMatch = /<v\s+([^>]+)>(.*)/.exec(trimmed);
        if (speakerMatch) {
            const speaker = speakerMatch[1].trim();
            const text = speakerMatch[2].replace(/<\/v>/g, '').trim();
            result.push(`${speaker}: ${text}`);
        } else {
            const cleaned = trimmed.replace(/<[^>]+>/g, '').trim();
            if (cleaned) result.push(cleaned);
        }
    }

    return result.join('\n');
}

/** Strip SBV timecodes, preserve text lines. */
export function parseSbv(raw: string): string {
    const lines = raw.split('\n');
    const result: string[] = [];

    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === '') continue;
        if (/^\d+:\d{2}:\d{2}\.\d{3},\d+:\d{2}:\d{2}\.\d{3}$/.test(trimmed)) continue;
        result.push(trimmed);
    }

    return result.join('\n');
}

// ── Normalization helpers ───────────────────────────────────────────

/** Parse unique speaker names from "Speaker: text" lines. */
export function extractParticipants(text: string): string[] {
    const speakers = new Set<string>();
    const lines = text.split('\n');

    for (const line of lines) {
        const match = /^([A-Z][a-zA-Z' .-]+?)[\s]*[:–—-]\s+\S/.exec(line.trim());
        if (match?.[1]) {
            const name = match[1].trim();
            if (name.length >= 2 && name.length <= 50) {
                speakers.add(name);
            }
        }
    }

    return Array.from(speakers).sort();
}

/** Generate canonical transcript ID: YYYY-MM-DD_meeting-title-slug */
export function generateTranscriptId(title: string, date: Date): string {
    const dateStr = date.toISOString().split('T')[0];
    const slug = slugify(title);
    return `${dateStr}_${slug}`;
}

// ── Chunker (copied from worker — pure functions, no deps) ──────────

const TARGET_CHUNK_SIZE = 2000;
const OVERLAP_SIZE = 400;

function splitBySpeakerTurns(text: string): string[] {
    const segments: string[] = [];
    const lines = text.split('\n');
    let currentSegment: string[] = [];

    for (const line of lines) {
        const isSpeakerTurn = /^[A-Z][a-zA-Z' .-]+?\s*[:–—-]\s+\S/.test(line.trim());
        if (isSpeakerTurn && currentSegment.length > 0) {
            segments.push(currentSegment.join('\n'));
            currentSegment = [line];
        } else {
            currentSegment.push(line);
        }
    }

    if (currentSegment.length > 0) segments.push(currentSegment.join('\n'));
    return segments;
}

function splitByParagraphs(text: string): string[] {
    return text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
}

function splitBySentences(text: string): string[] {
    const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z\n])/).filter((s) => s.trim().length > 0);
    return sentences.length > 0 ? sentences : [text];
}

function mergeSegmentsIntoChunks(segments: string[]): string[] {
    const chunks: string[] = [];
    let currentChunk = '';

    for (const segment of segments) {
        if (currentChunk.length > 0 && currentChunk.length + segment.length > TARGET_CHUNK_SIZE) {
            chunks.push(currentChunk.trim());
            const overlapText = currentChunk.slice(-OVERLAP_SIZE);
            currentChunk = overlapText + '\n' + segment;
        } else {
            currentChunk += (currentChunk ? '\n' : '') + segment;
        }
    }

    if (currentChunk.trim().length > 0) chunks.push(currentChunk.trim());
    return chunks;
}

interface TextChunk {
    text: string;
    index: number;
    totalChunks: number;
    tokenEstimate: number;
}

export function chunkTranscript(text: string): TextChunk[] {
    const speakerTurns = splitBySpeakerTurns(text);

    const paragraphs: string[] = [];
    for (const turn of speakerTurns) {
        if (turn.length > TARGET_CHUNK_SIZE) {
            paragraphs.push(...splitByParagraphs(turn));
        } else {
            paragraphs.push(turn);
        }
    }

    const smallSegments: string[] = [];
    for (const para of paragraphs) {
        if (para.length > TARGET_CHUNK_SIZE) {
            smallSegments.push(...splitBySentences(para));
        } else {
            smallSegments.push(para);
        }
    }

    const rawChunks = mergeSegmentsIntoChunks(smallSegments);

    return rawChunks.map((text, index) => ({
        text,
        index,
        totalChunks: rawChunks.length,
        tokenEstimate: Math.ceil(text.length / 4),
    }));
}

// ── Embedder (adapted from worker — uses process.env directly) ──────

const BATCH_SIZE = 20;
const BASE_DELAY = 1000;
const MAX_RETRIES = 5;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function getOpenAIClient(): OpenAI {
    return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

async function embedBatchWithRetry(client: OpenAI, texts: string[]): Promise<number[][]> {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            const response = await client.embeddings.create({
                model: 'text-embedding-3-small',
                input: texts,
            });
            return response.data.map((d) => d.embedding);
        } catch (err) {
            const isRetryable =
                err instanceof Error &&
                'status' in err &&
                ((err as { status: number }).status === 429 || (err as { status: number }).status >= 500);

            if (!isRetryable || attempt === MAX_RETRIES - 1) throw err;

            const delay = BASE_DELAY * Math.pow(2, attempt);
            console.warn(`[upload-embedder] Retry ${attempt + 1}/${MAX_RETRIES} after ${delay}ms`);
            await sleep(delay);
        }
    }
    throw new Error('Exhausted retries');
}

async function generateEmbeddings(texts: string[]): Promise<number[][]> {
    const client = getOpenAIClient();
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
        const batch = texts.slice(i, i + BATCH_SIZE);
        const embeddings = await embedBatchWithRetry(client, batch);
        allEmbeddings.push(...embeddings);
    }

    return allEmbeddings;
}

// ── Main pipeline ───────────────────────────────────────────────────

export interface UploadPipelineParams {
    /** Parsed transcript text (after VTT/SBV stripping) */
    text: string;
    /** Meeting title (user-provided or derived from filename) */
    title: string;
    /** Meeting date (defaults to now) */
    date?: Date;
    /** How the transcript was extracted — defaults to 'upload' */
    extractionMethod?: ExtractionMethod;
}

/**
 * Full upload processing pipeline:
 * 1. Build MeetingTranscript record
 * 2. Insert transcript into DB
 * 3. Chunk text
 * 4. Generate embeddings
 * 5. Insert chunks with embeddings
 * 6. Log processing result
 *
 * On failure, cleans up the transcript record and logs the error.
 */
export async function processUpload(params: UploadPipelineParams): Promise<MeetingTranscript> {
    const { text, title, date = new Date(), extractionMethod = 'upload' } = params;
    const supabase = getServerSupabase();

    // Build synthetic source ID unique to this upload
    const randomChars = Math.random().toString(36).substring(2, 10);
    const sourceEmailId = `upload_${Date.now()}_${randomChars}`;

    // PDF-extracted text lacks structured "Speaker: text" lines, so the
    // speaker regex produces false positives on arbitrary sentences.
    const participants = extractionMethod === 'pdf_upload' ? [] : extractParticipants(text);
    const transcriptId = generateTranscriptId(title, date);
    const wordCount = text.split(/\s+/).filter(Boolean).length;

    const transcript: MeetingTranscript = {
        transcript_id: transcriptId,
        meeting_title: title,
        meeting_date: date.toISOString(),
        participants,
        raw_transcript: text,
        source_email_id: sourceEmailId,
        extraction_method: extractionMethod,
        word_count: wordCount,
        processed_at: new Date().toISOString(),
    };

    try {
        // Insert transcript record
        const { error: insertError } = await supabase.from('transcripts').insert({
            id: transcript.transcript_id,
            meeting_title: transcript.meeting_title,
            meeting_date: transcript.meeting_date,
            participants: transcript.participants,
            raw_transcript: transcript.raw_transcript,
            source_email_id: transcript.source_email_id,
            extraction_method: transcript.extraction_method,
            word_count: transcript.word_count,
            processed_at: transcript.processed_at,
        });

        if (insertError) throw new Error(`Failed to insert transcript: ${insertError.message}`);

        // Chunk the text
        const chunks = chunkTranscript(text);

        // Generate embeddings for all chunks
        const chunkTexts = chunks.map((c) => c.text);
        const embeddings = await generateEmbeddings(chunkTexts);

        // Build TranscriptChunk records
        const chunkRows: TranscriptChunk[] = chunks.map((chunk, i) => ({
            id: `${transcriptId}_chunk_${chunk.index}`,
            transcript_id: transcriptId,
            meeting_title: transcript.meeting_title,
            meeting_date: transcript.meeting_date,
            participants: transcript.participants,
            chunk_index: chunk.index,
            total_chunks: chunk.totalChunks,
            text: chunk.text,
            embedding: embeddings[i],
            token_estimate: chunk.tokenEstimate,
            created_at: new Date().toISOString(),
        }));

        // Insert chunks
        const { error: chunksError } = await supabase.from('transcript_chunks').insert(
            chunkRows.map((c) => ({
                id: c.id,
                transcript_id: c.transcript_id,
                meeting_title: c.meeting_title,
                meeting_date: c.meeting_date,
                participants: c.participants,
                chunk_index: c.chunk_index,
                total_chunks: c.total_chunks,
                text: c.text,
                embedding: c.embedding,
                token_estimate: c.token_estimate,
            }))
        );

        if (chunksError) throw new Error(`Failed to insert chunks: ${chunksError.message}`);

        // Log success
        await supabase.from('processing_log').insert({
            source_email_id: sourceEmailId,
            email_subject: title,
            status: 'success',
            extraction_method: extractionMethod,
        });

        // Log activity
        await supabase.from('activity_log').insert({
            event_type: 'transcript_uploaded',
            entity_type: 'transcript',
            entity_id: transcriptId,
            actor: 'user',
            summary: `Uploaded transcript: ${title}`,
            metadata: { word_count: wordCount, chunks: chunks.length, participants },
        });

        return transcript;
    } catch (err) {
        // Clean up: remove partially-inserted transcript
        await supabase.from('transcript_chunks').delete().eq('transcript_id', transcriptId);
        await supabase.from('transcripts').delete().eq('id', transcriptId);

        // Log error
        const errorMessage = err instanceof Error ? err.message : String(err);
        await supabase.from('processing_log').insert({
            source_email_id: sourceEmailId,
            email_subject: title,
            status: 'error',
            extraction_method: extractionMethod,
            error_message: errorMessage,
        });

        throw err;
    }
}
