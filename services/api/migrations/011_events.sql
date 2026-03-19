-- Planner events and communication log. See foundation/specs/SPEC-0043.
-- Run from repo root: docker compose exec -T postgres psql -U neosleep -d neosleep < services/bff/migrations/011_events.sql

-- ---------------------------------------------------------------------------
-- Table: tbl_events (planned meetings – F2F, video)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tbl_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rep_id     UUID NOT NULL REFERENCES tbl_users (id) ON DELETE CASCADE,
  start_at   TIMESTAMPTZ NOT NULL,
  end_at     TIMESTAMPTZ NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('f2f', 'video')),
  title      TEXT,
  location   TEXT,
  video_link TEXT,
  notes      TEXT,
  region     TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show'))
);

CREATE INDEX IF NOT EXISTS idx_events_rep_id ON tbl_events (rep_id);
CREATE INDEX IF NOT EXISTS idx_events_start_at ON tbl_events (start_at);
CREATE INDEX IF NOT EXISTS idx_events_end_at ON tbl_events (end_at);
CREATE INDEX IF NOT EXISTS idx_events_region ON tbl_events (region);
CREATE INDEX IF NOT EXISTS idx_events_status ON tbl_events (status);

-- ---------------------------------------------------------------------------
-- Table: tbl_event_attendees (multi-attendee support)
-- attendee_type + attendee_id reference tbl_hcp, tbl_leads, or tbl_hco
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tbl_event_attendees (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID NOT NULL REFERENCES tbl_events (id) ON DELETE CASCADE,
  attendee_type TEXT NOT NULL CHECK (attendee_type IN ('hcp', 'lead', 'hco')),
  attendee_id   UUID NOT NULL,
  is_primary    BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_event_attendees_event_id ON tbl_event_attendees (event_id);
CREATE INDEX IF NOT EXISTS idx_event_attendees_attendee ON tbl_event_attendees (attendee_type, attendee_id);

-- ---------------------------------------------------------------------------
-- Table: tbl_communication_log (email, etc. – not in planner, for reporting)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tbl_communication_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  rep_id       UUID NOT NULL REFERENCES tbl_users (id) ON DELETE CASCADE,
  contact_type TEXT NOT NULL CHECK (contact_type IN ('hcp', 'lead', 'hco')),
  contact_id   UUID NOT NULL,
  type         TEXT NOT NULL DEFAULT 'email' CHECK (type IN ('email')),
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  subject      TEXT,
  notes        TEXT
);

CREATE INDEX IF NOT EXISTS idx_communication_log_rep_id ON tbl_communication_log (rep_id);
CREATE INDEX IF NOT EXISTS idx_communication_log_contact ON tbl_communication_log (contact_type, contact_id);
CREATE INDEX IF NOT EXISTS idx_communication_log_sent_at ON tbl_communication_log (sent_at);
