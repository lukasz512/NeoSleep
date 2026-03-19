-- Add 2 extra branded presentations for demo.

INSERT INTO tbl_presentations (title, url, file_type, thumbnail_url)
SELECT
  'Patient Journey — From Diagnosis to Treatment',
  'https://www.africau.edu/images/default/sample.pdf',
  'pdf',
  'https://picsum.photos/seed/patient-journey-sleep/600/300'
WHERE NOT EXISTS (SELECT 1 FROM tbl_presentations WHERE title = 'Patient Journey — From Diagnosis to Treatment');

INSERT INTO tbl_presentations (title, url, file_type, thumbnail_url)
SELECT
  'NeoSleep Pro — Advanced CPAP Solutions',
  'https://www.africau.edu/images/default/sample.pdf',
  'pdf',
  'https://picsum.photos/seed/cpap-advanced/600/300'
WHERE NOT EXISTS (SELECT 1 FROM tbl_presentations WHERE title = 'NeoSleep Pro — Advanced CPAP Solutions');
