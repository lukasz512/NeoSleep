-- PCF (Post Call Form) — hardcoded fields for MVP.
-- One PCF per completed event. Rep fills this out after each visit.
--
-- MVP fields are hardcoded here. Future: tbl_pcf_schema (per-tenant configurable fields).
--
-- Business rule: a visit (event) only counts toward rep payment when:
--   1. HCP status = 'active' (manager approved)
--   2. A PCF has been submitted for this event
--
-- Run from repo root:
--   docker compose exec -T postgres psql -U neosleep -d neosleep < services/bff/migrations/023_pcf.sql

CREATE TABLE IF NOT EXISTS tbl_pcf_responses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  event_id        UUID NOT NULL UNIQUE REFERENCES tbl_events (id) ON DELETE CASCADE,
  rep_id          UUID NOT NULL REFERENCES tbl_users (id) ON DELETE CASCADE,

  -- MVP hardcoded fields
  -- How did the visit go overall?
  outcome         TEXT NOT NULL CHECK (outcome IN ('positive', 'neutral', 'negative')),

  -- What is the next planned action?
  next_action     TEXT CHECK (next_action IN ('follow_up_call', 'next_visit', 'send_materials', 'none')),
  next_action_at  TIMESTAMPTZ,

  -- Did the rep leave product samples?
  samples_given   BOOLEAN NOT NULL DEFAULT false,
  samples_notes   TEXT,

  -- Free-form notes from the rep
  notes           TEXT,

  -- When the rep actually submitted the form (NULL = draft/unsaved)
  submitted_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pcf_event_id     ON tbl_pcf_responses (event_id);
CREATE INDEX IF NOT EXISTS idx_pcf_rep_id       ON tbl_pcf_responses (rep_id);
CREATE INDEX IF NOT EXISTS idx_pcf_submitted_at ON tbl_pcf_responses (submitted_at);
CREATE INDEX IF NOT EXISTS idx_pcf_outcome      ON tbl_pcf_responses (outcome);
