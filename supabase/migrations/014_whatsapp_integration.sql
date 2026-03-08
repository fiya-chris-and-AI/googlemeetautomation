-- WhatsApp Integration — tables for message buffering, session compilation,
-- and contact name mapping.
--
-- Messages arrive one at a time via webhook, are buffered in whatsapp_messages,
-- then periodically compiled into whatsapp_sessions and inserted into the
-- existing transcripts pipeline.

-- ── Raw message storage ─────────────────────────────────────────────

CREATE TABLE whatsapp_messages (
    id              TEXT PRIMARY KEY,               -- wamid from WhatsApp
    group_id        TEXT NOT NULL,                   -- WhatsApp group JID
    group_name      TEXT NOT NULL,
    sender_phone    TEXT NOT NULL,
    sender_name     TEXT NOT NULL,                   -- WhatsApp profile name
    message_type    TEXT NOT NULL DEFAULT 'text',    -- text/image/document/reaction/reply
    message_text    TEXT,
    quoted_message_id TEXT,                          -- for reply threading
    media_caption   TEXT,
    timestamp       TIMESTAMPTZ NOT NULL,
    raw_payload     JSONB NOT NULL DEFAULT '{}',     -- full webhook payload for debugging
    session_id      TEXT,                            -- links to whatsapp_sessions once compiled
    processed       BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wa_messages_group_unprocessed
    ON whatsapp_messages (group_id, timestamp)
    WHERE processed = false;

CREATE INDEX idx_wa_messages_session
    ON whatsapp_messages (session_id)
    WHERE session_id IS NOT NULL;

-- ── Aggregated conversation windows ─────────────────────────────────

CREATE TABLE whatsapp_sessions (
    id                  TEXT PRIMARY KEY,            -- YYYY-MM-DD_group-slug_session-N
    group_id            TEXT NOT NULL,
    group_name          TEXT NOT NULL,
    participants        TEXT[] NOT NULL DEFAULT '{}',
    session_start       TIMESTAMPTZ NOT NULL,
    session_end         TIMESTAMPTZ NOT NULL,
    message_count       INTEGER NOT NULL DEFAULT 0,
    compiled_transcript TEXT NOT NULL,               -- formatted conversation text
    word_count          INTEGER NOT NULL DEFAULT 0,
    source_type         TEXT NOT NULL DEFAULT 'whatsapp',
    processed_at        TIMESTAMPTZ,                 -- when AI extraction ran
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wa_sessions_group ON whatsapp_sessions (group_id);
CREATE INDEX idx_wa_sessions_date  ON whatsapp_sessions (session_start DESC);

-- ── Phone-to-name contact mapping ───────────────────────────────────

CREATE TABLE whatsapp_contacts (
    phone_number    TEXT PRIMARY KEY,                -- e.g. +1234567890
    display_name    TEXT NOT NULL,                   -- WhatsApp display name
    canonical_name  TEXT NOT NULL,                   -- maps to normalizeAssignee output
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed the two known team members
INSERT INTO whatsapp_contacts (phone_number, display_name, canonical_name) VALUES
    ('+0000000000', 'Fiya',    'Lutfiya Miller'),
    ('+0000000001', 'Chris M', 'Chris Müller')
ON CONFLICT (phone_number) DO NOTHING;

-- ── Extend transcripts table ────────────────────────────────────────
-- Add source_type so the frontend can filter by source.
-- Default to 'google_meet' for all existing rows.

ALTER TABLE transcripts
    ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'google_meet';

-- Back-fill uploads: any transcript with extraction_method in upload variants
-- gets source_type = 'upload'
UPDATE transcripts
SET source_type = 'upload'
WHERE extraction_method IN ('upload', 'pdf_upload', 'paste', 'loom_import')
  AND source_type = 'google_meet';

-- ── Foreign key from messages → sessions ────────────────────────────

ALTER TABLE whatsapp_messages
    ADD CONSTRAINT fk_wa_messages_session
    FOREIGN KEY (session_id) REFERENCES whatsapp_sessions (id)
    ON DELETE SET NULL;
