-- =============================================================================
-- Migration 054: reporter-side tracking of problem reports
--
-- docs/stories/trackable-feedback-reports.md (decision form feedback-r1).
-- Platform schema only, so create_tenant_schema() is not regenerated.
--
--   tracker_ref    the ticket the report was filed under (e.g. CORE-123),
--                  typed in by an admin (D2: no Linear API integration).
--   reporter_reply the short, PHI-free note the reporter reads when the report
--                  is resolved or won't be fixed (D3). Kept apart from
--                  admin_note, which stays internal.
--   reporter_user_id index: backs "My reports".
--
-- ROLLBACK (manual): ALTER TABLE platform.problem_report
--   DROP COLUMN tracker_ref, DROP COLUMN reporter_reply;
--   DROP INDEX platform.idx_platform_problem_report_reporter;
-- =============================================================================

ALTER TABLE platform.problem_report
  ADD COLUMN IF NOT EXISTS tracker_ref    TEXT,
  ADD COLUMN IF NOT EXISTS reporter_reply TEXT;

CREATE INDEX IF NOT EXISTS idx_platform_problem_report_reporter
  ON platform.problem_report (tenant_slug, reporter_user_id, created_at DESC);
