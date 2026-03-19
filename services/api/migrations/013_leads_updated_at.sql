-- Add updated_at to tbl_leads for filtering completed leads by age.
-- Run from repo root: docker compose exec -T postgres psql -U neosleep -d neosleep < services/bff/migrations/013_leads_updated_at.sql

ALTER TABLE tbl_leads ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
UPDATE tbl_leads SET updated_at = created_at WHERE updated_at IS NULL;
ALTER TABLE tbl_leads ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE tbl_leads ALTER COLUMN updated_at SET NOT NULL;
