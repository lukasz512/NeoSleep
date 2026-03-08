-- NeoSleep BFF – initial schema
-- Run this on an empty database to create all tables and optional seed data.
-- Usage (from repo root):
--   docker compose exec -T postgres psql -U neosleep -d neosleep < services/bff/migrations/001_initial.sql
-- Or from services/bff:
--   cat migrations/001_initial.sql | docker compose -f ../../docker-compose.yml exec -T postgres psql -U neosleep -d neosleep
--
-- More migrations (003_, 004_, ...) will be added for new tables (e.g. users, samples).
-- See foundation/docs/DATABASE_MIGRATIONS.md.

-- ---------------------------------------------------------------------------
-- Table: tbl_leads
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tbl_leads (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  email      TEXT,
  status     TEXT NOT NULL DEFAULT 'new',
  region     TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Optional seed (only run on fresh DB; safe to skip if you already have data)
INSERT INTO tbl_leads (name, email, status, region)
SELECT 'Dr. Anna Smith', 'anna.smith@hospital.example', 'contacted', 'North'
WHERE NOT EXISTS (SELECT 1 FROM tbl_leads LIMIT 1);

INSERT INTO tbl_leads (name, email, status, region)
SELECT 'Dr. Jan Kowalski', 'j.kowalski@clinic.example', 'new', 'Central'
WHERE (SELECT COUNT(*) FROM tbl_leads) < 2;

INSERT INTO tbl_leads (name, email, status, region)
SELECT 'Medical Center Alpha', 'contact@alpha-med.example', 'qualified', 'South'
WHERE (SELECT COUNT(*) FROM tbl_leads) < 3;
