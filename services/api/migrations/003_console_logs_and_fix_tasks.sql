-- Console errors (prod) and fix tasks for recurrence-based self-healing.
-- Run from repo root: docker compose exec -T postgres psql -U neosleep -d neosleep < services/bff/migrations/003_console_logs_and_fix_tasks.sql
-- See foundation/docs/CONSOLE_LOGS_AND_SELF_HEALING.md.

-- ---------------------------------------------------------------------------
-- Table: tbl_console_errors
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tbl_console_errors (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  level        TEXT NOT NULL DEFAULT 'error',  -- log | info | warn | error
  message      TEXT NOT NULL,
  message_hash TEXT,                           -- for grouping / recurrence (e.g. hash of normalized message)
  stack        TEXT,
  source       TEXT NOT NULL DEFAULT 'bff',    -- bff | frontend
  env          TEXT NOT NULL DEFAULT 'production',
  user_id      TEXT,
  request_id   TEXT,
  metadata     JSONB
);

CREATE INDEX IF NOT EXISTS idx_console_errors_created_at ON tbl_console_errors (created_at);
CREATE INDEX IF NOT EXISTS idx_console_errors_message_hash ON tbl_console_errors (message_hash);
CREATE INDEX IF NOT EXISTS idx_console_errors_level ON tbl_console_errors (level);

-- ---------------------------------------------------------------------------
-- Table: tbl_fix_tasks
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tbl_fix_tasks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  status            TEXT NOT NULL DEFAULT 'open',  -- open | in_progress | done | dismissed
  title             TEXT NOT NULL,
  description       TEXT,
  log_fingerprint   TEXT NOT NULL,               -- same as message_hash in tbl_console_errors
  recurrence_count  INT NOT NULL DEFAULT 0,
  recurrence_window TEXT,                        -- e.g. 7d, 30d
  suggested_plan    TEXT,                         -- optional: AI or rule-based improvement plan
  resolved_at      TIMESTAMPTZ,
  resolved_by      TEXT
);

CREATE INDEX IF NOT EXISTS idx_fix_tasks_status ON tbl_fix_tasks (status);
CREATE INDEX IF NOT EXISTS idx_fix_tasks_log_fingerprint ON tbl_fix_tasks (log_fingerprint);
