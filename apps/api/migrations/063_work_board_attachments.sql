-- 063: work board attachments, assignee and due date (CORE-192,
-- docs/stories/work-board-task-form-attachments.md).
--
-- Screenshots are the fastest bug description, so a work item (and a comment on it) can
-- carry images and PDFs. The bytes live in the private Supabase documents bucket; this
-- table holds only the path. The API hands out short-lived signed URLs, never the path.
-- A screenshot of the PWA can show patient data, so the bucket stays private and a delete
-- removes the object as well as the row.

ALTER TABLE platform.work_item ADD COLUMN IF NOT EXISTS assignee TEXT CHECK (assignee IS NULL OR length(assignee) BETWEEN 3 AND 320);
ALTER TABLE platform.work_item ADD COLUMN IF NOT EXISTS due_date DATE;

CREATE TABLE IF NOT EXISTS platform.work_item_attachment (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id      UUID        NOT NULL REFERENCES platform.work_item (id) ON DELETE CASCADE,
  -- The comment it was posted with; null when it belongs to the item itself.
  event_id     BIGINT      REFERENCES platform.work_item_event (id) ON DELETE SET NULL,
  path         TEXT        NOT NULL UNIQUE,
  filename     TEXT        NOT NULL CHECK (length(filename) BETWEEN 1 AND 200),
  mime_type    TEXT        NOT NULL CHECK (mime_type ~ '^image/[a-z0-9.+-]+$' OR mime_type = 'application/pdf'),
  size_bytes   INT         NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
  uploaded_by  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_work_item_attachment_item
  ON platform.work_item_attachment (item_id, created_at);

ALTER TABLE platform.work_item_event DROP CONSTRAINT IF EXISTS work_item_event_kind_check;
ALTER TABLE platform.work_item_event ADD CONSTRAINT work_item_event_kind_check
  CHECK (kind IN ('created', 'status', 'comment', 'edit', 'link', 'attachment'));
