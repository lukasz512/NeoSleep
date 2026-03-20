-- ---------------------------------------------------------------------------
-- Migration 001: tbl_clients
-- Replaces the mock patients layer with a real table.
-- A "client" is the end beneficiary (patient referred by an HCP).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tbl_clients (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  salutation   TEXT,                        -- Dr. | Mr. | Ms. | Prof. — nullable
  first_name   TEXT        NOT NULL,
  last_name    TEXT        NOT NULL,
  email        TEXT,
  phone        TEXT,                        -- E.164 format (+52...), single column
  reason       TEXT,                        -- why they're with us (white-label neutral)
  referred_by  TEXT,                        -- free-text: name of referring HCP
  hcp_id       UUID REFERENCES tbl_hcp(id) ON DELETE SET NULL,  -- structured referral (future)
  status       TEXT        NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active', 'follow-up', 'discharged')),
  region       TEXT        NOT NULL DEFAULT '',
  country      TEXT,
  notes        TEXT,
  -- Consent (GDPR Art. 9 — health data)
  data_consent_at           TIMESTAMPTZ,
  data_consent_withdrawn_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_clients_status  ON tbl_clients (status);
CREATE INDEX IF NOT EXISTS idx_clients_region  ON tbl_clients (region);
CREATE INDEX IF NOT EXISTS idx_clients_hcp_id  ON tbl_clients (hcp_id);
