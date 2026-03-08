-- Decision Assignees — attribute each decision to its proposer/champion.

ALTER TABLE decisions
  ADD COLUMN IF NOT EXISTS assigned_to TEXT;

CREATE INDEX IF NOT EXISTS idx_decisions_assigned_to ON decisions(assigned_to);
