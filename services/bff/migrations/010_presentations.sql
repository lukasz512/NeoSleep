-- Presentations: files (PDF, PPTX) for rep app. Can later link to Google Drive folder.
-- Run from repo root: docker compose exec -T postgres psql -U neosleep -d neosleep < services/bff/migrations/010_presentations.sql

CREATE TABLE IF NOT EXISTS tbl_presentations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  title        TEXT NOT NULL,
  url          TEXT NOT NULL,
  file_type    TEXT NOT NULL DEFAULT 'pdf',  -- pdf | pptx
  source       TEXT DEFAULT 'static'          -- static | google_drive | ...
);

CREATE INDEX IF NOT EXISTS idx_presentations_file_type ON tbl_presentations (file_type);

-- Dev seed: public sample files for styling
INSERT INTO tbl_presentations (title, url, file_type)
SELECT 'Sample PDF (dev)', 'https://www.africau.edu/images/default/sample.pdf', 'pdf'
WHERE NOT EXISTS (SELECT 1 FROM tbl_presentations LIMIT 1);

INSERT INTO tbl_presentations (title, url, file_type)
SELECT 'Sample PPTX (dev)', 'https://www.learningcontainer.com/wp-content/uploads/2020/05/sample-pptx-file.pptx', 'pptx'
WHERE (SELECT COUNT(*) FROM tbl_presentations) < 2;
