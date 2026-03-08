-- Dev seed: exactly 2 HCOs and 4 HCPs, linked. For styling and dev env.
-- Run after 006. Clears existing HCP/HCO and inserts fresh dev data.

DELETE FROM tbl_hcp;
DELETE FROM tbl_hco;

INSERT INTO tbl_hco (name, type, region, status) VALUES
  ('NeoSleep Care Center', 'clinic', 'Central', 'active'),
  ('City Hospital North', 'hospital', 'North', 'active');

INSERT INTO tbl_hcp (name, email, specialty, region, hco_id)
SELECT 'Dr Anna Kowalska', 'a.kowalska@neosleep.example', 'Pulmonology', 'Central', id FROM tbl_hco WHERE name = 'NeoSleep Care Center' LIMIT 1;

INSERT INTO tbl_hcp (name, email, specialty, region, hco_id)
SELECT 'Dr Piotr Nowak', 'p.nowak@neosleep.example', 'Sleep medicine', 'Central', id FROM tbl_hco WHERE name = 'NeoSleep Care Center' LIMIT 1;

INSERT INTO tbl_hcp (name, email, specialty, region, hco_id)
SELECT 'Dr Maria Wiśniewska', 'm.wisniewska@hospital.example', 'Neurology', 'North', id FROM tbl_hco WHERE name = 'City Hospital North' LIMIT 1;

INSERT INTO tbl_hcp (name, email, specialty, region, hco_id)
SELECT 'Dr Jan Zieliński', 'j.zielinski@hospital.example', 'Internal medicine', 'North', id FROM tbl_hco WHERE name = 'City Hospital North' LIMIT 1;
