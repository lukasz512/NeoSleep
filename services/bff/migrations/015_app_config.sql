-- App-wide configuration (theme, branding) shared by website and rep-app.
-- Run from repo root: docker compose exec -T postgres psql -U neosleep -d neosleep < services/bff/migrations/015_app_config.sql
-- See foundation/docs/BRAND_AND_APP_CONFIG.md.

-- Single row: global theme/config. primary_color is the main brand color; secondary_color is the accent (e.g. green from logo).
CREATE TABLE IF NOT EXISTS tbl_app_config (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  primary_color    TEXT NOT NULL DEFAULT '#1976d2',
  secondary_color  TEXT NOT NULL DEFAULT '#2e7d32',
  border_radius    TEXT NOT NULL DEFAULT '8px',
  logo_url         TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure exactly one row. Use INSERT ... ON CONFLICT or a single seed row.
INSERT INTO tbl_app_config (id, primary_color, secondary_color, border_radius, logo_url)
SELECT gen_random_uuid(), '#1976d2', '#2e7d32', '8px', NULL
WHERE NOT EXISTS (SELECT 1 FROM tbl_app_config LIMIT 1);

-- Optional: trigger to keep updated_at in sync (if you allow UPDATE later)
-- CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
-- BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
-- CREATE TRIGGER tbl_app_config_updated_at BEFORE UPDATE ON tbl_app_config FOR EACH ROW EXECUTE FUNCTION set_updated_at();
