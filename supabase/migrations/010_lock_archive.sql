-- 24-hour TTL with lock/archive support for action items and decisions

-- ── Action Items ────────────────────────────────────────
ALTER TABLE action_items
  ADD COLUMN is_locked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN locked_by TEXT,            -- 'Lutfiya Miller' | 'Chris Müller'
  ADD COLUMN locked_at TIMESTAMPTZ,
  ADD COLUMN archived_at TIMESTAMPTZ;   -- NULL = not archived

CREATE INDEX idx_action_items_locked ON action_items(is_locked) WHERE is_locked = true;
CREATE INDEX idx_action_items_archived ON action_items(archived_at) WHERE archived_at IS NOT NULL;

-- ── Decisions ───────────────────────────────────────────
ALTER TABLE decisions
  ADD COLUMN is_locked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN locked_by TEXT,
  ADD COLUMN locked_at TIMESTAMPTZ,
  ADD COLUMN archived_at TIMESTAMPTZ;

CREATE INDEX idx_decisions_locked ON decisions(is_locked) WHERE is_locked = true;
CREATE INDEX idx_decisions_archived ON decisions(archived_at) WHERE archived_at IS NOT NULL;

-- ── Auto-archive function ───────────────────────────────
-- Archives unlocked items older than 24 hours.
-- Called periodically via cron or API endpoint.
CREATE OR REPLACE FUNCTION archive_expired_items()
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  action_count INT;
  decision_count INT;
BEGIN
  -- Archive unlocked action items past 24h TTL
  -- TTL anchor: created_at for never-unlocked items, updated_at for previously unlocked items
  WITH archived AS (
    UPDATE action_items
    SET archived_at = now(),
        status = 'archived',
        updated_at = now()
    WHERE is_locked = false
      AND archived_at IS NULL
      AND status NOT IN ('dismissed')
      AND created_at < now() - interval '24 hours'
      AND (locked_at IS NULL OR updated_at < now() - interval '24 hours')
    RETURNING id
  )
  SELECT count(*) INTO action_count FROM archived;

  -- Archive unlocked decisions past 24h TTL
  WITH archived AS (
    UPDATE decisions
    SET archived_at = now(),
        status = 'archived',
        updated_at = now()
    WHERE is_locked = false
      AND archived_at IS NULL
      AND created_at < now() - interval '24 hours'
      AND (locked_at IS NULL OR updated_at < now() - interval '24 hours')
    RETURNING id
  )
  SELECT count(*) INTO decision_count FROM archived;

  RETURN json_build_object(
    'action_items_archived', action_count,
    'decisions_archived', decision_count,
    'run_at', now()
  );
END;
$$;
