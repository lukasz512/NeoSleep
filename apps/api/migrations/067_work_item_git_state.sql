-- =============================================================================
-- Migration 067: the work board knows where a ticket's code is (CORE-221,
-- decision board-statuses-r1)
--
-- docs/stories/core-221-board-statuses-git-state.md. GitHub Actions reads git and
-- reports through POST /platform/work/git-state; the board shows the marker and, after
-- a green prod smoke test, closes Needs Review tickets that are on prod.
-- Platform schema only, so create_tenant_schema() is not regenerated.
--
--   work_item.git_state       NULL = never checked, 'none' = nothing merged,
--                             'dev' = on dev, 'prod' = on prod
--   work_item.git_sha         newest commit citing the ticket
--   work_item.git_checked_at  when the report arrived
--   label 'hold'              keeps a ticket in Needs Review; set here on the three
--                             tickets left open on purpose in the 2026-11-16 review
--
-- ROLLBACK (manual): ALTER TABLE platform.work_item DROP COLUMN git_state,
--   DROP COLUMN git_sha, DROP COLUMN git_checked_at; remove 'hold' from labels.
-- =============================================================================

ALTER TABLE platform.work_item ADD COLUMN IF NOT EXISTS git_state TEXT
  CHECK (git_state IN ('none', 'dev', 'prod'));
ALTER TABLE platform.work_item ADD COLUMN IF NOT EXISTS git_sha TEXT;
ALTER TABLE platform.work_item ADD COLUMN IF NOT EXISTS git_checked_at TIMESTAMPTZ;

WITH held AS (
  UPDATE platform.work_item
     SET labels = array_append(labels, 'hold'), updated_at = now()
   WHERE (team_key, number) IN (('CORE', 25), ('CORE', 26), ('NEO', 190))
     AND status = 'needs_review'
     AND NOT ('hold' = ANY (labels))
  RETURNING id
)
INSERT INTO platform.work_item_event (item_id, kind, body, actor, actor_kind)
SELECT id, 'edit', 'labels', 'migration-067', 'import' FROM held;
