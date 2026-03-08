-- Extend tbl_app_config with theme panel options (Genesis-style: surface, hero style, color scheme).
-- Run from repo root: docker compose exec -T postgres psql -U neosleep -d neosleep < services/bff/migrations/016_app_config_theme.sql

ALTER TABLE tbl_app_config ADD COLUMN IF NOT EXISTS surface_color TEXT NOT NULL DEFAULT '#fafafa';
ALTER TABLE tbl_app_config ADD COLUMN IF NOT EXISTS hero_container_style TEXT NOT NULL DEFAULT 'compact';
ALTER TABLE tbl_app_config ADD COLUMN IF NOT EXISTS color_scheme TEXT NOT NULL DEFAULT 'light';

-- Constrain allowed values (optional; application also validates)
-- hero_container_style: 'compact' | 'wide'
-- color_scheme: 'light' | 'dark'
