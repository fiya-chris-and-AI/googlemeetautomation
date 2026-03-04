-- Add deduplication tracking columns for bulk action item extraction
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS is_duplicate BOOLEAN DEFAULT FALSE;
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS duplicate_of TEXT REFERENCES action_items(id);
CREATE INDEX idx_action_items_duplicate ON action_items(is_duplicate) WHERE is_duplicate = TRUE;
