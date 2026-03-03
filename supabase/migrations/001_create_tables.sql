-- Enable pgvector extension (Supabase already has this available)
CREATE EXTENSION IF NOT EXISTS vector;

-- ──────────────────────────────────────────────
-- Full transcripts
-- ──────────────────────────────────────────────
CREATE TABLE transcripts (
  id TEXT PRIMARY KEY,
  meeting_title TEXT NOT NULL,
  meeting_date TIMESTAMPTZ NOT NULL,
  participants TEXT[],
  raw_transcript TEXT NOT NULL,
  source_email_id TEXT UNIQUE NOT NULL,
  extraction_method TEXT,
  word_count INTEGER,
  processed_at TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────────────────────
-- Chunked + embedded for RAG
-- ──────────────────────────────────────────────
CREATE TABLE transcript_chunks (
  id TEXT PRIMARY KEY,
  transcript_id TEXT REFERENCES transcripts(id) ON DELETE CASCADE,
  meeting_title TEXT,
  meeting_date TIMESTAMPTZ,
  participants TEXT[],
  chunk_index INTEGER,
  total_chunks INTEGER,
  text TEXT NOT NULL,
  embedding VECTOR(1536),
  token_estimate INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- IVFFlat index for fast cosine similarity search
CREATE INDEX idx_transcript_chunks_embedding
  ON transcript_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- ──────────────────────────────────────────────
-- Processing log
-- ──────────────────────────────────────────────
CREATE TABLE processing_log (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  source_email_id TEXT NOT NULL,
  email_subject TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'skipped', 'error')),
  extraction_method TEXT,
  error_message TEXT,
  processed_at TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────────────────────
-- Similarity search function
-- ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION match_chunks(
  query_embedding VECTOR(1536),
  match_count INT DEFAULT 10,
  match_threshold FLOAT DEFAULT 0.7,
  filter_transcript_id TEXT DEFAULT NULL
)
RETURNS TABLE (
  id TEXT,
  transcript_id TEXT,
  meeting_title TEXT,
  meeting_date TIMESTAMPTZ,
  text TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    tc.id,
    tc.transcript_id,
    tc.meeting_title,
    tc.meeting_date,
    tc.text,
    1 - (tc.embedding <=> query_embedding) AS similarity
  FROM transcript_chunks tc
  WHERE 1 - (tc.embedding <=> query_embedding) > match_threshold
    AND (filter_transcript_id IS NULL OR tc.transcript_id = filter_transcript_id)
  ORDER BY tc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
