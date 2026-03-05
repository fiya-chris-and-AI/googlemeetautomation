-- Decision Ledger — auto-extracted decisions from meeting transcripts

CREATE TABLE decisions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  transcript_id TEXT REFERENCES transcripts(id) ON DELETE SET NULL,
  decision_text TEXT NOT NULL,              -- The decision itself (concise)
  context TEXT,                             -- Surrounding discussion context
  domain TEXT DEFAULT 'general',            -- 'architecture' | 'product' | 'business' | 'design' | 'infrastructure' | 'operations' | 'general'
  confidence TEXT DEFAULT 'high',           -- 'high' | 'medium' | 'low'
  participants TEXT[],                      -- Who was present when this was decided
  decided_at TIMESTAMPTZ,                   -- When the decision was made (transcript meeting_date)
  source_text TEXT,                         -- The exact transcript excerpt
  embedding VECTOR(1536),                   -- For semantic similarity search
  superseded_by TEXT REFERENCES decisions(id) ON DELETE SET NULL, -- Self-referencing FK for decision chains
  status TEXT NOT NULL DEFAULT 'active',    -- 'active' | 'superseded' | 'reversed' | 'under_review'
  created_by TEXT DEFAULT 'ai',             -- 'ai' | 'manual'
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_decisions_transcript ON decisions(transcript_id);
CREATE INDEX idx_decisions_domain ON decisions(domain);
CREATE INDEX idx_decisions_status ON decisions(status);
CREATE INDEX idx_decisions_decided_at ON decisions(decided_at DESC);

-- IVFFlat index for fast cosine similarity search on decision embeddings
-- Using fewer lists than transcript_chunks since we'll have fewer decisions
CREATE INDEX idx_decisions_embedding
  ON decisions
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50);

-- RPC function for decision similarity search
CREATE OR REPLACE FUNCTION match_decisions(
  query_embedding VECTOR(1536),
  match_count INT DEFAULT 5,
  match_threshold FLOAT DEFAULT 0.75,
  filter_status TEXT DEFAULT 'active'
)
RETURNS TABLE (
  id TEXT,
  transcript_id TEXT,
  decision_text TEXT,
  context TEXT,
  domain TEXT,
  confidence TEXT,
  decided_at TIMESTAMPTZ,
  source_text TEXT,
  status TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.transcript_id,
    d.decision_text,
    d.context,
    d.domain,
    d.confidence,
    d.decided_at,
    d.source_text,
    d.status,
    1 - (d.embedding <=> query_embedding) AS similarity
  FROM decisions d
  WHERE 1 - (d.embedding <=> query_embedding) > match_threshold
    AND (filter_status IS NULL OR d.status = filter_status)
  ORDER BY d.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
