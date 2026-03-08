-- 016: Unified prompts — persisted multi-item power prompts
-- Stores combined prompts generated from multiple selected action items
-- so they can be retrieved, rated, and referenced later.

CREATE TABLE unified_prompts (
    id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    action_item_ids   UUID[] NOT NULL,
    prompt_text       TEXT NOT NULL,
    prompt_model      TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
    version           INTEGER DEFAULT 1,
    feedback          TEXT DEFAULT NULL,
    generated_at      TIMESTAMPTZ DEFAULT now(),
    created_by        TEXT DEFAULT 'manual'
);

COMMENT ON COLUMN unified_prompts.action_item_ids IS 'Ordered array of selected action item IDs';
COMMENT ON COLUMN unified_prompts.feedback IS '''useful'' | ''not_useful'' | NULL';

CREATE INDEX idx_unified_prompts_items ON unified_prompts USING GIN (action_item_ids);
