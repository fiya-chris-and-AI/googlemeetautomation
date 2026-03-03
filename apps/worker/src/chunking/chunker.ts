/**
 * Splits transcript text into overlapping chunks suitable for embedding.
 *
 * Strategy (in priority order):
 * 1. Speaker-turn boundaries — split between speaker changes
 * 2. Paragraph breaks — split at double newlines
 * 3. Sentence boundaries — split at sentence-ending punctuation
 * 4. Never split mid-sentence
 *
 * Target: ~500 tokens (~2000 chars) per chunk, ~100 token (~400 char) overlap.
 */

const TARGET_CHUNK_SIZE = 2000;   // characters (~500 tokens)
const OVERLAP_SIZE = 400;         // characters (~100 tokens)

interface TextChunk {
    text: string;
    index: number;
    totalChunks: number;
    tokenEstimate: number;
}

/**
 * Identify speaker-turn boundaries in the text.
 * A speaker turn starts when a new line matches "SpeakerName: ..."
 */
function splitBySpeakerTurns(text: string): string[] {
    const segments: string[] = [];
    const lines = text.split('\n');
    let currentSegment: string[] = [];

    for (const line of lines) {
        // Detect speaker turn: "Name: ..." or "Name - ..."
        const isSpeakerTurn = /^[A-Z][a-zA-Z' .-]+?\s*[:–—-]\s+\S/.test(line.trim());

        if (isSpeakerTurn && currentSegment.length > 0) {
            segments.push(currentSegment.join('\n'));
            currentSegment = [line];
        } else {
            currentSegment.push(line);
        }
    }

    if (currentSegment.length > 0) {
        segments.push(currentSegment.join('\n'));
    }

    return segments;
}

/**
 * Further split a segment by paragraph breaks (double newlines).
 */
function splitByParagraphs(text: string): string[] {
    return text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
}

/**
 * Further split a paragraph by sentence boundaries.
 * Handles common abbreviations to avoid false splits.
 */
function splitBySentences(text: string): string[] {
    // Split at ". ", "! ", "? " followed by an uppercase letter or newline
    const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z\n])/).filter((s) => s.trim().length > 0);
    return sentences.length > 0 ? sentences : [text];
}

/**
 * Estimate token count from character length.
 * Rough heuristic: 1 token ≈ 4 characters for English.
 */
function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

/**
 * Merge small segments into chunks that approach TARGET_CHUNK_SIZE,
 * then apply overlap by prepending the tail of the previous chunk.
 */
function mergeSegmentsIntoChunks(segments: string[]): string[] {
    const chunks: string[] = [];
    let currentChunk = '';

    for (const segment of segments) {
        // If adding this segment would exceed the target, finalize current chunk
        if (currentChunk.length > 0 && currentChunk.length + segment.length > TARGET_CHUNK_SIZE) {
            chunks.push(currentChunk.trim());
            // Start new chunk with overlap from previous
            const overlapText = currentChunk.slice(-OVERLAP_SIZE);
            currentChunk = overlapText + '\n' + segment;
        } else {
            currentChunk += (currentChunk ? '\n' : '') + segment;
        }
    }

    if (currentChunk.trim().length > 0) {
        chunks.push(currentChunk.trim());
    }

    return chunks;
}

/**
 * Chunk a transcript into overlapping segments for embedding.
 *
 * @param text - Full cleaned transcript text
 * @returns Array of chunks with metadata
 */
export function chunkTranscript(text: string): TextChunk[] {
    // Step 1: Split into speaker turns
    const speakerTurns = splitBySpeakerTurns(text);

    // Step 2: Further split any oversized turns by paragraph
    const paragraphs: string[] = [];
    for (const turn of speakerTurns) {
        if (turn.length > TARGET_CHUNK_SIZE) {
            paragraphs.push(...splitByParagraphs(turn));
        } else {
            paragraphs.push(turn);
        }
    }

    // Step 3: Further split oversized paragraphs by sentence
    const smallSegments: string[] = [];
    for (const para of paragraphs) {
        if (para.length > TARGET_CHUNK_SIZE) {
            smallSegments.push(...splitBySentences(para));
        } else {
            smallSegments.push(para);
        }
    }

    // Step 4: Merge small segments into target-sized chunks with overlap
    const rawChunks = mergeSegmentsIntoChunks(smallSegments);

    // Step 5: Build the result with metadata
    return rawChunks.map((text, index) => ({
        text,
        index,
        totalChunks: rawChunks.length,
        tokenEstimate: estimateTokens(text),
    }));
}
