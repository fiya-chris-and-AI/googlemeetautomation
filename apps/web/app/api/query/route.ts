import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getServerSupabase } from '../../../lib/supabase';
import type { QueryResponse, SourceChunk } from '@meet-pipeline/shared';

/**
 * POST /api/query — RAG query endpoint.
 *
 * Flow:
 * 1. Embed the user's question using OpenAI
 * 2. Search for the top 10 matching chunks via match_chunks()
 * 3. Send chunks + question to Claude for a grounded answer
 * 4. Return the answer with source citations
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const question: string = body.question;
        const transcriptId: string | undefined = body.transcript_id;

        if (!question?.trim()) {
            return NextResponse.json({ error: 'Question is required' }, { status: 400 });
        }

        // Step 1: Embed the question
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
        const embeddingRes = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: question,
        });
        const queryEmbedding = embeddingRes.data[0].embedding;

        // Step 2: Search for matching chunks
        const supabase = getServerSupabase();
        const { data: chunks, error: rpcError } = await supabase.rpc('match_chunks', {
            query_embedding: queryEmbedding,
            match_count: 10,
            match_threshold: 0.7,
            filter_transcript_id: transcriptId ?? null,
        });

        if (rpcError) {
            console.error('match_chunks RPC error:', rpcError.message);
            return NextResponse.json({ error: 'Search failed' }, { status: 500 });
        }

        const matchedChunks = (chunks ?? []) as Array<{
            id: string;
            transcript_id: string;
            meeting_title: string;
            meeting_date: string;
            text: string;
            similarity: number;
        }>;

        // Step 3: Build context and call Claude
        const context = matchedChunks
            .map((c, i) => `[Source ${i + 1}: ${c.meeting_title} (${new Date(c.meeting_date).toLocaleDateString()})]\n${c.text}`)
            .join('\n\n---\n\n');

        const systemPrompt = `You are a helpful assistant that answers questions about meeting transcripts.
Use ONLY the provided context to answer. If the context doesn't contain enough information, say so.
Cite your sources by referencing the meeting title and date.
Be concise but thorough.`;

        const userPrompt = context
            ? `Context from meeting transcripts:\n\n${context}\n\n---\n\nQuestion: ${question}`
            : `No relevant meeting transcripts were found for this question.\n\nQuestion: ${question}`;

        // Use Anthropic Claude via the REST API
        const anthropicKey = process.env.ANTHROPIC_API_KEY;
        let answer: string;

        if (anthropicKey) {
            const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': anthropicKey,
                    'anthropic-version': '2023-06-01',
                },
                body: JSON.stringify({
                    model: 'claude-sonnet-4-20250514',
                    max_tokens: 2048,
                    system: systemPrompt,
                    messages: [{ role: 'user', content: userPrompt }],
                }),
            });

            const anthropicData = await anthropicRes.json();
            answer = anthropicData.content?.[0]?.text ?? 'I could not generate an answer.';
        } else {
            // Fallback: if no Anthropic key, return a summary of the chunks
            answer = matchedChunks.length > 0
                ? `Found ${matchedChunks.length} relevant transcript segments. Configure ANTHROPIC_API_KEY for AI-generated answers.\n\nTop match: "${matchedChunks[0].text.slice(0, 200)}..."`
                : 'No relevant transcripts found for your question.';
        }

        // Step 4: Build response
        const sources: SourceChunk[] = matchedChunks.map((c) => ({
            chunk_id: c.id,
            transcript_id: c.transcript_id,
            meeting_title: c.meeting_title,
            meeting_date: c.meeting_date,
            text: c.text,
            similarity: c.similarity,
        }));

        const response: QueryResponse = { answer, sources };
        return NextResponse.json(response);
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error('Query API error:', msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
