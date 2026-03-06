-- Persistent translation cache for dynamic content (EN ↔ DE).
-- Stores Gemini-translated strings so each text is only ever translated once.

CREATE TABLE translation_cache (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  source_text TEXT NOT NULL,
  source_lang TEXT NOT NULL DEFAULT 'en',  -- 'en' | 'de'
  target_lang TEXT NOT NULL,               -- 'en' | 'de'
  translated_text TEXT NOT NULL,
  entity_type TEXT,                        -- 'transcript' | 'action_item' | 'decision' (for debugging)
  entity_id TEXT,                          -- ID of the source record
  field_name TEXT,                         -- 'title' | 'description' | 'decision_text' etc.
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Fast lookup: unique per (text content + target language)
CREATE UNIQUE INDEX idx_translation_cache_lookup
  ON translation_cache (md5(source_text), target_lang);

-- For optional cache invalidation by entity
CREATE INDEX idx_translation_cache_entity
  ON translation_cache (entity_type, entity_id);
