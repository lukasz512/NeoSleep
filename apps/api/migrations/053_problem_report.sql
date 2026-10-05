-- =============================================================================
-- Migration 053: "Report a problem" + admin Issues view
--
-- docs/stories/report-problem-and-admin-issues.md (decision form
-- report-problem-r1). Platform schema only, no tenant table changes, so
-- create_tenant_schema() is not regenerated.
--
--   platform.problem_report  one row per user report (problem / suggestion /
--                            other), with automatic context and an optional
--                            attachment kept in the private storage bucket.
--                            `number` is the human reference shown to the user.
--   platform.diagnostics     two indexes that back the grouped "Errors" tab:
--                            dedup lookup (env, source, message_hash) and
--                            newest-first listing (last_seen).
--
-- ROLLBACK (manual): DROP TABLE platform.problem_report;
--   DROP INDEX platform.idx_platform_diagnostics_dedup;
--   DROP INDEX platform.idx_platform_diagnostics_last_seen;
-- =============================================================================

CREATE TABLE IF NOT EXISTS platform.problem_report (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  number           BIGSERIAL   UNIQUE,
  tenant_slug      TEXT        NOT NULL,
  env              TEXT        NOT NULL,
  kind             TEXT        NOT NULL DEFAULT 'problem'
                     CHECK (kind IN ('problem', 'suggestion', 'other')),
  description      TEXT        NOT NULL,
  status           TEXT        NOT NULL DEFAULT 'new'
                     CHECK (status IN ('new', 'in_progress', 'resolved', 'dismissed')),
  reporter_user_id TEXT,
  reporter_name    TEXT,
  reporter_email   TEXT,
  reporter_role    TEXT,
  page_url         TEXT,
  app_version      TEXT,
  user_agent       TEXT,
  viewport         TEXT,
  request_ids      TEXT[]      NOT NULL DEFAULT '{}',
  recent_errors    JSONB,
  attachment_path  TEXT,
  attachment_name  TEXT,
  attachment_mime  TEXT,
  attachment_size  INT,
  admin_note       TEXT,
  resolved_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_problem_report_tenant_created
  ON platform.problem_report (tenant_slug, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_problem_report_status
  ON platform.problem_report (status);

CREATE INDEX IF NOT EXISTS idx_platform_diagnostics_dedup
  ON platform.diagnostics (env, source, message_hash);
CREATE INDEX IF NOT EXISTS idx_platform_diagnostics_last_seen
  ON platform.diagnostics (last_seen DESC);
