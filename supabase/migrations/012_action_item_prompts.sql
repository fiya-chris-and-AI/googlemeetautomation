-- Action Item Prompts — auto-generated IDE prompts for completing action items.
--
-- Each action item gets a generated prompt that can be pasted into an AI IDE
-- (e.g. Claude in Project IDX) to initiate work on the task.
-- Prompts are context-aware: they reference the codebase, meeting discussion,
-- and relevant files.

ALTER TABLE action_items
  ADD COLUMN generated_prompt TEXT,          -- The auto-generated IDE prompt
  ADD COLUMN prompt_model TEXT,              -- Model used to generate the prompt (e.g. 'gemini-2.5-flash')
  ADD COLUMN prompt_generated_at TIMESTAMPTZ, -- When the prompt was last generated
  ADD COLUMN prompt_version INT DEFAULT 1,   -- Increments on regeneration (for tracking improvements)
  ADD COLUMN prompt_feedback TEXT;            -- 'useful' | 'not_useful' | null — user signal for self-improvement

CREATE INDEX idx_action_items_prompt_feedback ON action_items(prompt_feedback)
  WHERE prompt_feedback IS NOT NULL;
