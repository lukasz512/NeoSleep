-- Link presentations to events (which presentation was shown at which visit).
-- Also adds slide_count to tbl_presentations for future slide-level tracking.
--
-- Run from repo root:
--   docker compose exec -T postgres psql -U neosleep -d neosleep < services/bff/migrations/022_event_presentations.sql

-- ---------------------------------------------------------------------------
-- tbl_presentations: add slide count (needed for future slide temperature MVP)
-- ---------------------------------------------------------------------------
ALTER TABLE tbl_presentations
  ADD COLUMN IF NOT EXISTS slide_count INT,
  ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ NOT NULL DEFAULT now();

-- ---------------------------------------------------------------------------
-- tbl_event_presentations: which presentation was shown at which event
-- ---------------------------------------------------------------------------
-- A single visit (event) can have one presentation shown.
-- We record when it was opened so we can track duration later.

CREATE TABLE IF NOT EXISTS tbl_event_presentations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  event_id        UUID NOT NULL REFERENCES tbl_events (id) ON DELETE CASCADE,
  presentation_id UUID NOT NULL REFERENCES tbl_presentations (id) ON DELETE RESTRICT,
  opened_at       TIMESTAMPTZ,
  closed_at       TIMESTAMPTZ,
  UNIQUE (event_id, presentation_id)
);

CREATE INDEX IF NOT EXISTS idx_event_presentations_event        ON tbl_event_presentations (event_id);
CREATE INDEX IF NOT EXISTS idx_event_presentations_presentation ON tbl_event_presentations (presentation_id);
