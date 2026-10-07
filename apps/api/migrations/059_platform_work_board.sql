-- =============================================================================
-- Migration 059: platform work board (own kanban, replaces Linear)
--
-- docs/stories/platform-work-board.md (CORE-177, decision forms
-- worker-pipeline-r1 + kanban-r1). Platform schema only, so
-- create_tenant_schema() is not regenerated.
--
--   platform.work_team        one row per ticket key: CORE (the platform) and
--                             one per client (NEO, AJM, ...). Teams are data,
--                             never hardcoded. next_number backs KEY-n.
--   platform.work_item        one ticket: KEY-n, Problem / Change / Done when,
--                             status on the board, priority, links (artifact,
--                             PR, CI). linear_identifier keeps the imported key.
--   platform.work_item_event  append-only trail of every create, status move,
--                             comment, field edit and link (change control:
--                             ISO 13485 7.3, IEC 62304 8.2). UPDATE is refused
--                             by a trigger; rows go only with their item.
--
-- ROLLBACK (manual): DROP TABLE platform.work_item_event, platform.work_item,
--   platform.work_team; DROP FUNCTION platform.work_item_event_append_only();
-- =============================================================================

CREATE TABLE IF NOT EXISTS platform.work_team (
  key          TEXT        PRIMARY KEY CHECK (key ~ '^[A-Z][A-Z0-9]{1,9}$'),
  name         TEXT        NOT NULL,
  kind         TEXT        NOT NULL DEFAULT 'client' CHECK (kind IN ('platform', 'client')),
  company_id   UUID        REFERENCES platform.companies (id) ON DELETE SET NULL,
  next_number  INT         NOT NULL DEFAULT 1 CHECK (next_number > 0),
  sort_order   INT         NOT NULL DEFAULT 100,
  archived     BOOLEAN     NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO platform.work_team (key, name, kind, sort_order, company_id) VALUES
  ('CORE', 'NeoCRM Core', 'platform', 10, NULL),
  ('NEO',  'NeoSleep',    'client',   20, (SELECT id FROM platform.companies WHERE slug = 'neosleep')),
  ('AJM',  'AJM',         'client',   30, NULL)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS platform.work_item (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_key          TEXT        NOT NULL REFERENCES platform.work_team (key) ON UPDATE CASCADE,
  number            INT         NOT NULL CHECK (number > 0),
  title             TEXT        NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  problem           TEXT,
  change            TEXT,
  done_when         TEXT,
  status            TEXT        NOT NULL DEFAULT 'backlog'
                      CHECK (status IN ('triage', 'backlog', 'to_spec', 'spec_ready', 'approved',
                                        'building', 'needs_review', 'done', 'canceled')),
  priority          SMALLINT    NOT NULL DEFAULT 0 CHECK (priority BETWEEN 0 AND 4),
  labels            TEXT[]      NOT NULL DEFAULT '{}',
  links             JSONB       NOT NULL DEFAULT '[]'::jsonb,
  branch            TEXT,
  source            TEXT        NOT NULL DEFAULT 'manual'
                      CHECK (source IN ('manual', 'agent', 'linear_import', 'problem_report')),
  linear_identifier TEXT        UNIQUE,
  created_by        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  status_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at      TIMESTAMPTZ,
  UNIQUE (team_key, number)
);

CREATE INDEX IF NOT EXISTS idx_platform_work_item_status
  ON platform.work_item (status, priority, status_changed_at);

CREATE TABLE IF NOT EXISTS platform.work_item_event (
  id           BIGSERIAL   PRIMARY KEY,
  item_id      UUID        NOT NULL REFERENCES platform.work_item (id) ON DELETE CASCADE,
  kind         TEXT        NOT NULL CHECK (kind IN ('created', 'status', 'comment', 'edit', 'link')),
  from_status  TEXT,
  to_status    TEXT,
  body         TEXT,
  actor        TEXT,
  actor_kind   TEXT        NOT NULL CHECK (actor_kind IN ('human', 'agent', 'import')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_work_item_event_item
  ON platform.work_item_event (item_id, created_at);

CREATE OR REPLACE FUNCTION platform.work_item_event_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'platform.work_item_event is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_work_item_event_append_only ON platform.work_item_event;
CREATE TRIGGER trg_work_item_event_append_only
  BEFORE UPDATE ON platform.work_item_event
  FOR EACH ROW EXECUTE FUNCTION platform.work_item_event_append_only();
