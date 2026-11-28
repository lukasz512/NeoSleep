-- =============================================================================
-- Migration 070: the work board verifies landed tickets (CORE-277, decision core277-r1)
--
-- docs/stories/core-277-worker-verify-stage.md. A Needs Review ticket that reaches dev
-- moves to 'verifying'; GitHub Actions runs the tests and posts the result through
-- POST /platform/work/items/:key/verify-result, which returns the ticket to Needs Review.
-- Platform schema only, so create_tenant_schema() is not regenerated.
--
--   status 'verifying'        waiting for the post-landing test run
--   work_item.verify_state    NULL = never verified, 'pending', 'pass', 'fail'
--   work_item.verify_checked_at  when the result arrived
--   work_item.verify_run_url  the CI run that produced it
--   work_item.verify_results  AC -> test map: [{ac, test, status}]
--   work_item.fix_item        key of the fix ticket created after a failed run
--
-- ROLLBACK (manual): move 'verifying' tickets to needs_review, re-add the old status
--   CHECK without 'verifying', then DROP COLUMN verify_state, verify_checked_at,
--   verify_run_url, verify_results, fix_item.
-- =============================================================================

ALTER TABLE platform.work_item DROP CONSTRAINT IF EXISTS work_item_status_check;
ALTER TABLE platform.work_item ADD CONSTRAINT work_item_status_check
  CHECK (status IN ('triage', 'backlog', 'to_spec', 'spec_ready', 'approved', 'building',
                    'needs_review', 'verifying', 'done', 'canceled'));

ALTER TABLE platform.work_item ADD COLUMN IF NOT EXISTS verify_state TEXT
  CHECK (verify_state IN ('pending', 'pass', 'fail'));
ALTER TABLE platform.work_item ADD COLUMN IF NOT EXISTS verify_checked_at TIMESTAMPTZ;
ALTER TABLE platform.work_item ADD COLUMN IF NOT EXISTS verify_run_url TEXT;
ALTER TABLE platform.work_item ADD COLUMN IF NOT EXISTS verify_results JSONB;
ALTER TABLE platform.work_item ADD COLUMN IF NOT EXISTS fix_item TEXT;
