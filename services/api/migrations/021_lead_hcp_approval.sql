-- Lead-to-HCP conversion tracking + manager approval workflow for HCP and HCO.
--
-- Business rules:
--   - A lead is a prospect. An HCP is a confirmed contact. They are separate objects.
--   - When a rep converts a lead → HCP, the lead is marked 'converted' (never deleted).
--   - New HCP and HCO records start with status 'pending_approval'.
--   - A manager approves them → status becomes 'active'. Only then do visits count toward rep payment.
--
-- Run from repo root:
--   docker compose exec -T postgres psql -U neosleep -d neosleep < services/bff/migrations/021_lead_hcp_approval.sql

-- ---------------------------------------------------------------------------
-- tbl_leads: add conversion tracking
-- ---------------------------------------------------------------------------

-- Allow 'converted' as a valid lead status
ALTER TABLE tbl_leads
  DROP CONSTRAINT IF EXISTS tbl_leads_status_check;

ALTER TABLE tbl_leads
  ADD CONSTRAINT tbl_leads_status_check
  CHECK (status IN ('new', 'contacted', 'qualified', 'inactive', 'converted'));

-- Link to the HCP record this lead became
ALTER TABLE tbl_leads
  ADD COLUMN IF NOT EXISTS converted_to_hcp_id UUID REFERENCES tbl_hcp (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS converted_at         TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_leads_converted_to_hcp ON tbl_leads (converted_to_hcp_id);

-- ---------------------------------------------------------------------------
-- tbl_hcp: add pending_approval status + manager approval fields
-- ---------------------------------------------------------------------------

-- Extend allowed status values
ALTER TABLE tbl_hcp
  DROP CONSTRAINT IF EXISTS tbl_hcp_status_check;

ALTER TABLE tbl_hcp
  ADD CONSTRAINT tbl_hcp_status_check
  CHECK (status IN ('pending_approval', 'active', 'inactive'));

-- New HCP records default to pending_approval
ALTER TABLE tbl_hcp
  ALTER COLUMN status SET DEFAULT 'pending_approval';

-- Track which lead this HCP was converted from (optional — rep may create HCP directly)
ALTER TABLE tbl_hcp
  ADD COLUMN IF NOT EXISTS converted_from_lead_id UUID REFERENCES tbl_leads (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_by            UUID REFERENCES tbl_users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at            TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_hcp_converted_from_lead ON tbl_hcp (converted_from_lead_id);
CREATE INDEX IF NOT EXISTS idx_hcp_approved_by ON tbl_hcp (approved_by);

-- ---------------------------------------------------------------------------
-- tbl_hco: add pending_approval status + manager approval fields
-- ---------------------------------------------------------------------------

ALTER TABLE tbl_hco
  DROP CONSTRAINT IF EXISTS tbl_hco_status_check;

ALTER TABLE tbl_hco
  ADD CONSTRAINT tbl_hco_status_check
  CHECK (status IN ('pending_approval', 'active', 'inactive'));

ALTER TABLE tbl_hco
  ALTER COLUMN status SET DEFAULT 'pending_approval';

ALTER TABLE tbl_hco
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES tbl_users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_hco_approved_by ON tbl_hco (approved_by);

-- ---------------------------------------------------------------------------
-- tbl_hcp: primary HCO affiliation
-- ---------------------------------------------------------------------------
-- An HCP can work at multiple HCOs (via tbl_event_attendees and future tbl_hcp_hco).
-- primary_hco_id is the default display affiliation.

ALTER TABLE tbl_hcp
  ADD COLUMN IF NOT EXISTS primary_hco_id UUID REFERENCES tbl_hco (id) ON DELETE SET NULL;

-- Migrate existing hco_id → primary_hco_id, then keep hco_id as alias for now
UPDATE tbl_hcp SET primary_hco_id = hco_id WHERE primary_hco_id IS NULL AND hco_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hcp_primary_hco ON tbl_hcp (primary_hco_id);
