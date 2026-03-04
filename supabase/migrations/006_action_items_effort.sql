-- Add effort estimation column to action_items.
-- Values: 'quick_fix' | 'moderate' | 'significant' | NULL (legacy items).
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS effort TEXT;

-- Partial index for filtering — only covers rows with a known effort level.
CREATE INDEX idx_action_items_effort ON action_items(effort) WHERE effort IS NOT NULL;
