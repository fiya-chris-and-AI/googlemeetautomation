-- 015: Dynamic category assignment for action items
-- Creates a normalized tag system with a junction table for many-to-many
-- relationships between action items and categories.

-- 1. Categories lookup table
CREATE TABLE categories (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    slug        TEXT NOT NULL UNIQUE,
    color       TEXT DEFAULT NULL,
    usage_count INTEGER DEFAULT 0,
    created_by  TEXT DEFAULT 'manual',
    created_at  TIMESTAMPTZ DEFAULT now()
);

COMMENT ON COLUMN categories.slug IS 'Lowercase, hyphenated version of name for URL-safe references';
COMMENT ON COLUMN categories.color IS 'Hex color string for pill display (e.g. #8b5cf6)';
COMMENT ON COLUMN categories.usage_count IS 'Denormalized count of action items using this category';
COMMENT ON COLUMN categories.created_by IS '''ai'' = set during extraction, ''manual'' = user-created';

CREATE INDEX idx_categories_slug ON categories (slug);
CREATE INDEX idx_categories_usage ON categories (usage_count DESC);

-- 2. Junction table: action_items <-> categories (many-to-many)
CREATE TABLE action_item_categories (
    action_item_id UUID NOT NULL REFERENCES action_items(id) ON DELETE CASCADE,
    category_id    UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    assigned_at    TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (action_item_id, category_id)
);

CREATE INDEX idx_aic_action_item ON action_item_categories (action_item_id);
CREATE INDEX idx_aic_category    ON action_item_categories (category_id);

-- 3. Trigger: auto-update usage_count on insert/delete
CREATE OR REPLACE FUNCTION update_category_usage()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE categories SET usage_count = usage_count + 1 WHERE id = NEW.category_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE categories SET usage_count = usage_count - 1 WHERE id = OLD.category_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_category_usage
AFTER INSERT OR DELETE ON action_item_categories
FOR EACH ROW EXECUTE FUNCTION update_category_usage();

-- 4. Seed categories from existing group_label values
INSERT INTO categories (name, slug, created_by)
SELECT DISTINCT
    group_label,
    lower(regexp_replace(group_label, '[^a-zA-Z0-9]+', '-', 'g')),
    'ai'
FROM action_items
WHERE group_label IS NOT NULL
ON CONFLICT (name) DO NOTHING;

-- 5. Backfill junction table from existing group_label
INSERT INTO action_item_categories (action_item_id, category_id)
SELECT ai.id, c.id
FROM action_items ai
JOIN categories c ON c.name = ai.group_label
WHERE ai.group_label IS NOT NULL
ON CONFLICT DO NOTHING;

-- 6. Sync usage counts after backfill
UPDATE categories c
SET usage_count = (
    SELECT COUNT(*) FROM action_item_categories aic WHERE aic.category_id = c.id
);
