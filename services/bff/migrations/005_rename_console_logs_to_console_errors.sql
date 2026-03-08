-- Rename tbl_console_logs to tbl_console_errors (for DBs created before this rename).
-- Run from repo root: docker compose exec -T postgres psql -U neosleep -d neosleep < services/bff/migrations/005_rename_console_logs_to_console_errors.sql

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tbl_console_logs') THEN
    ALTER TABLE tbl_console_logs RENAME TO tbl_console_errors;
    DROP INDEX IF EXISTS idx_console_logs_created_at;
    DROP INDEX IF EXISTS idx_console_logs_message_hash;
    DROP INDEX IF EXISTS idx_console_logs_level;
    CREATE INDEX IF NOT EXISTS idx_console_errors_created_at ON tbl_console_errors (created_at);
    CREATE INDEX IF NOT EXISTS idx_console_errors_message_hash ON tbl_console_errors (message_hash);
    CREATE INDEX IF NOT EXISTS idx_console_errors_level ON tbl_console_errors (level);
  END IF;
END $$;
