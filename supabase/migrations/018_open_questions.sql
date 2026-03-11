-- Open Questions — auto-extracted unresolved questions from meeting transcripts.
-- Follows the same patterns as action_items (002) and decisions (007).

CREATE TABLE IF NOT EXISTS open_questions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  transcript_id TEXT REFERENCES transcripts(id) ON DELETE SET NULL,
  question_text TEXT NOT NULL,                -- The open question itself
  context TEXT,                               -- Background / surrounding discussion
  topic TEXT,                                 -- Category label (same buckets as action items)
  raised_by TEXT,                             -- "Lutfiya Miller" | "Chris Müller" | null
  source_text TEXT,                           -- Exact transcript excerpt
  status TEXT NOT NULL DEFAULT 'open',        -- 'open' | 'resolved' | 'archived'
  resolution TEXT,                            -- How/when the question was resolved (filled later)
  is_locked BOOLEAN NOT NULL DEFAULT false,   -- Admin lock (prevents TTL auto-archival)
  created_by TEXT DEFAULT 'ai',               -- 'ai' | 'manual'
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_open_questions_transcript ON open_questions(transcript_id);
CREATE INDEX idx_open_questions_status ON open_questions(status);
CREATE INDEX idx_open_questions_created_at ON open_questions(created_at DESC);
