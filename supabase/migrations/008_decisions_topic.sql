-- Add short topic label column for pill-style display in the Decision Ledger UI.
-- Populated by AI extraction (2-5 word label like "Auth provider", "Launch timeline").
-- Nullable for backward compatibility with existing decisions.

ALTER TABLE decisions ADD COLUMN IF NOT EXISTS topic TEXT;

-- Index for topic-based search and filtering
CREATE INDEX IF NOT EXISTS idx_decisions_topic ON decisions(topic);
