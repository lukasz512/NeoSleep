-- =============================================================================
-- Migration 067: work board label catalog (CORE-219, decision D2)
--
-- docs/stories/work-board-labels-and-session-indicators.md. Items keep their
-- labels by name in work_item.labels (TEXT[], migration 059); the catalog beside
-- it gives each label a colour and one place to rename it. A rename updates the
-- catalog row and every item's array in one transaction (db/workBoard.ts). The
-- technical `session` label marks session tickets and is never a catalog label.
-- Platform schema only, so create_tenant_schema() is not regenerated.
--
--   platform.work_label           one row per label (name unique, any case)
--   idx_platform_work_item_labels GIN, for "items that carry this label"
--
-- ROLLBACK (manual): DROP INDEX platform.idx_platform_work_item_labels;
--   DROP TABLE platform.work_label;  (work_item.labels is untouched)
--
-- Idempotent: safe to re-run; the backfill only adds labels the catalog lacks.
-- =============================================================================

CREATE TABLE IF NOT EXISTS platform.work_label (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL CHECK (name = btrim(name) AND length(name) BETWEEN 1 AND 40 AND lower(name) <> 'session'),
  color       TEXT        NOT NULL CHECK (color IN ('blue', 'teal', 'green', 'amber', 'orange', 'red', 'pink', 'purple')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_work_label_name ON platform.work_label (lower(name));

CREATE INDEX IF NOT EXISTS idx_platform_work_item_labels ON platform.work_item USING GIN (labels);

-- Labels already on items, one catalog row per name (first spelling wins), colours in turn.
INSERT INTO platform.work_label (name, color)
SELECT name,
       (ARRAY['blue', 'teal', 'green', 'amber', 'orange', 'red', 'pink', 'purple'])[
         (1 + ((SELECT count(*) FROM platform.work_label) + row_number() OVER (ORDER BY lower(name)) - 1) % 8)::int
       ]
  FROM (
    SELECT DISTINCT ON (lower(btrim(label))) btrim(label) AS name
      FROM platform.work_item, unnest(labels) AS label
     WHERE length(btrim(label)) BETWEEN 1 AND 40 AND lower(btrim(label)) <> 'session'
     ORDER BY lower(btrim(label)), btrim(label)
  ) existing
ON CONFLICT (lower(name)) DO NOTHING;
