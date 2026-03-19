-- HCO (healthcare organizations) and HCP (healthcare professionals). Linked to each other and to leads.
-- Run from repo root: docker compose exec -T postgres psql -U neosleep -d neosleep < services/bff/migrations/006_hco_hcp.sql
-- See foundation/docs/LEADS_AND_PARTNERS.md.

-- ---------------------------------------------------------------------------
-- Table: tbl_hco (healthcare organizations – clinics, hospitals, etc.)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tbl_hco (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  name         TEXT NOT NULL,
  type         TEXT NOT NULL DEFAULT 'other',  -- clinic | hospital | practice | other
  address_line1 TEXT,
  address_line2 TEXT,
  city         TEXT,
  state        TEXT,
  postal_code  TEXT,
  country      TEXT,
  region       TEXT NOT NULL DEFAULT '',        -- internal region (e.g. North, Central)
  phone        TEXT,
  email        TEXT,
  website      TEXT,
  status       TEXT NOT NULL DEFAULT 'active',  -- active | inactive | pending
  lead_id      UUID REFERENCES tbl_leads (id) ON DELETE SET NULL,  -- source lead when converted to partner
  notes        TEXT
);

CREATE INDEX IF NOT EXISTS idx_hco_region ON tbl_hco (region);
CREATE INDEX IF NOT EXISTS idx_hco_status ON tbl_hco (status);
CREATE INDEX IF NOT EXISTS idx_hco_lead_id ON tbl_hco (lead_id);

-- ---------------------------------------------------------------------------
-- Table: tbl_hcp (healthcare professionals – doctors, nurses, etc.)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tbl_hcp (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  hco_id       UUID REFERENCES tbl_hco (id) ON DELETE SET NULL,   -- organisation they belong to (optional)
  lead_id      UUID REFERENCES tbl_leads (id) ON DELETE SET NULL,   -- source lead when converted to partner
  name         TEXT NOT NULL,
  email        TEXT,
  phone        TEXT,
  specialty    TEXT,                            -- e.g. neurologist, pulmonologist
  role         TEXT,                             -- e.g. doctor, nurse
  status       TEXT NOT NULL DEFAULT 'active',   -- active | inactive | pending
  region       TEXT NOT NULL DEFAULT '',
  notes        TEXT
);

CREATE INDEX IF NOT EXISTS idx_hcp_hco_id ON tbl_hcp (hco_id);
CREATE INDEX IF NOT EXISTS idx_hcp_lead_id ON tbl_hcp (lead_id);
CREATE INDEX IF NOT EXISTS idx_hcp_region ON tbl_hcp (region);
CREATE INDEX IF NOT EXISTS idx_hcp_status ON tbl_hcp (status);
