-- Add thumbnail_url to presentations and replace dev samples with branded demo content.

ALTER TABLE tbl_presentations ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

-- Remove generic dev samples
DELETE FROM tbl_presentations WHERE title IN ('Sample PDF (dev)', 'Sample PPTX (dev)');

-- NeoSleep branded presentation
INSERT INTO tbl_presentations (title, url, file_type, thumbnail_url)
SELECT
  'NeoSleep — Sleep Therapy Program',
  'https://www.africau.edu/images/default/sample.pdf',
  'pdf',
  'https://picsum.photos/seed/neosleep-med/600/300'
WHERE NOT EXISTS (SELECT 1 FROM tbl_presentations WHERE title = 'NeoSleep — Sleep Therapy Program');

-- OrthApnea branded presentation
INSERT INTO tbl_presentations (title, url, file_type, thumbnail_url)
SELECT
  'OrthApnea — Mandibular Advancement Device',
  'https://www.africau.edu/images/default/sample.pdf',
  'pdf',
  'https://picsum.photos/seed/orthoapnea-med/600/300'
WHERE NOT EXISTS (SELECT 1 FROM tbl_presentations WHERE title = 'OrthApnea — Mandibular Advancement Device');

-- Clinical evidence deck
INSERT INTO tbl_presentations (title, url, file_type, thumbnail_url)
SELECT
  'Clinical Evidence — Sleep-Disordered Breathing',
  'https://www.africau.edu/images/default/sample.pdf',
  'pdf',
  'https://picsum.photos/seed/clinical-evidence/600/300'
WHERE NOT EXISTS (SELECT 1 FROM tbl_presentations WHERE title = 'Clinical Evidence — Sleep-Disordered Breathing');

-- Patient diagnosis guide
INSERT INTO tbl_presentations (title, url, file_type, thumbnail_url)
SELECT
  'HCP Guide — Diagnosing Obstructive Sleep Apnea',
  'https://www.africau.edu/images/default/sample.pdf',
  'pdf',
  'https://picsum.photos/seed/sleep-apnea-guide/600/300'
WHERE NOT EXISTS (SELECT 1 FROM tbl_presentations WHERE title = 'HCP Guide — Diagnosing Obstructive Sleep Apnea');
