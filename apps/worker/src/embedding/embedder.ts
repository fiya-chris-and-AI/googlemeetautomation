import OpenAI from 'openai';
import { config } from '../config.js';

let openaiClient: OpenAI | null = null;

function getClient(): OpenAI {
    if (!openaiClient) {
        openaiClient = new OpenAI({ apiKey: config.openai.apiKey });
    }
    return openaiClient;
}

/** Maximum texts per single API call. */
const BATCH_SIZE = 20;

/** Base delay for exponential backoff (ms). */
const BASE_DELAY = 1000;

/** Max retry attempts per batch. */
const MAX_RETRIES = 5;

/**
 * Sleep for the specified number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate embeddings for a batch of texts with retry + exponential backoff.
 */
async function embedBatchWithRetry(texts: string[]): Promise<number[][]> {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            const response = await getClient().embeddings.create({
                model: 'text-embedding-3-small',
                input: texts,
            });

            return response.data.map((d) => d.embedding);
        } catch (err) {
            const isRetryable =
                err instanceof Error &&
                ('status' in err) &&
                ((err as { status: number }).status === 429 || (err as { status: number }).status >= 500);

            if (!isRetryable || attempt === MAX_RETRIES - 1) {
                throw err;
            }

            const delay = BASE_DELAY * Math.pow(2, attempt);
            console.warn(`[embedder] Retry ${attempt + 1}/${MAX_RETRIES} after ${delay}ms`);
            await sleep(delay);
        }
    }

    // Unreachable, but TypeScript needs it
    throw new Error('Exhausted retries');
}

/**
 * Generate 1536-dimensional embeddings for an array of texts.
 * Automatically batches in groups of 20 and retries on failures.
 *
 * @param texts - Array of text strings to embed
 * @returns Array of embedding vectors, one per input text
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
        const batch = texts.slice(i, i + BATCH_SIZE);
        console.log(`[embedder] Embedding batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(texts.length / BATCH_SIZE)}`);

        const embeddings = await embedBatchWithRetry(batch);
        allEmbeddings.push(...embeddings);
    }

    return allEmbeddings;
}

/**
 * Embed a single text query (used for search queries).
 */
export async function embedQuery(text: string): Promise<number[]> {
    const [embedding] = await embedBatchWithRetry([text]);
    return embedding;
}
