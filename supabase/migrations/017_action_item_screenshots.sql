-- 017: Screenshot attachment for action items
-- Adds columns to store a single screenshot per action item,
-- uploaded to Supabase Storage.

ALTER TABLE action_items
  ADD COLUMN screenshot_path  TEXT     DEFAULT NULL,
  ADD COLUMN screenshot_url   TEXT     DEFAULT NULL,
  ADD COLUMN screenshot_alt   TEXT     DEFAULT NULL,
  ADD COLUMN screenshot_size  INTEGER  DEFAULT NULL;

COMMENT ON COLUMN action_items.screenshot_path IS 'Supabase Storage object path (bucket/folder/filename)';
COMMENT ON COLUMN action_items.screenshot_url  IS 'Signed or public URL for rendering in the UI';
COMMENT ON COLUMN action_items.screenshot_alt  IS 'AI-generated alt text describing the screenshot content';
COMMENT ON COLUMN action_items.screenshot_size IS 'File size in bytes';

-- NOTE: The Supabase Storage bucket must be created separately via
-- the Supabase Dashboard or CLI:
--
--   INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
--   VALUES (
--     'action-item-screenshots',
--     'action-item-screenshots',
--     false,
--     5242880,  -- 5 MB
--     ARRAY['image/png', 'image/jpeg', 'image/webp']
--   );
