-- Add group_label column for AI-powered smart grouping of action items
ALTER TABLE action_items ADD COLUMN group_label TEXT;
CREATE INDEX idx_action_items_group ON action_items(group_label);
