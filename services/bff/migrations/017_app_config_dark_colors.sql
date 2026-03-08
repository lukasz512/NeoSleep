-- Add dark mode primary/secondary colors to tbl_app_config.
-- Run from repo root: docker compose exec -T postgres psql -U neosleep -d neosleep < services/bff/migrations/017_app_config_dark_colors.sql

ALTER TABLE tbl_app_config ADD COLUMN IF NOT EXISTS primary_color_dark TEXT NOT NULL DEFAULT '#42a5f5';
ALTER TABLE tbl_app_config ADD COLUMN IF NOT EXISTS secondary_color_dark TEXT NOT NULL DEFAULT '#66bb6a';
