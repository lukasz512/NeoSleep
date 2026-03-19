-- Seed data for tbl_hco and tbl_hcp. Run after 006_hco_hcp.sql.
-- HCO first (no dependencies), then HCP (references HCO via hco_id).

-- HCO seed (accounts)
INSERT INTO tbl_hco (name, type, region, status)
SELECT 'City Hospital North', 'hospital', 'North', 'active'
WHERE NOT EXISTS (SELECT 1 FROM tbl_hco LIMIT 1);

INSERT INTO tbl_hco (name, type, region, status)
SELECT 'NeoSleep Care Center', 'clinic', 'Central', 'active'
WHERE (SELECT COUNT(*) FROM tbl_hco) < 2;

INSERT INTO tbl_hco (name, type, region, status)
SELECT 'University Medical Center', 'hospital', 'Central', 'active'
WHERE (SELECT COUNT(*) FROM tbl_hco) < 3;

INSERT INTO tbl_hco (name, type, region, status)
SELECT 'Regional Sleep Lab', 'clinic', 'South', 'active'
WHERE (SELECT COUNT(*) FROM tbl_hco) < 4;

INSERT INTO tbl_hco (name, type, region, status)
SELECT 'City Hospital South', 'hospital', 'South', 'active'
WHERE (SELECT COUNT(*) FROM tbl_hco) < 5;

-- HCP seed (contacts) – link to HCO by name lookup
INSERT INTO tbl_hcp (name, email, specialty, region, hco_id)
SELECT 'Dr Anna Kowalska', 'a.kowalska@hospital.example', 'Pulmonology', 'North', (SELECT id FROM tbl_hco WHERE name = 'City Hospital North' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM tbl_hcp LIMIT 1);

INSERT INTO tbl_hcp (name, email, specialty, region, hco_id)
SELECT 'Dr Piotr Nowak', 'p.nowak@neosleep.example', 'Sleep medicine', 'Central', (SELECT id FROM tbl_hco WHERE name = 'NeoSleep Care Center' LIMIT 1)
WHERE (SELECT COUNT(*) FROM tbl_hcp) < 2;

INSERT INTO tbl_hcp (name, email, specialty, region, hco_id)
SELECT 'Dr Maria Wiśniewska', 'm.wisniewska@umc.example', 'Neurology', 'Central', (SELECT id FROM tbl_hco WHERE name = 'University Medical Center' LIMIT 1)
WHERE (SELECT COUNT(*) FROM tbl_hcp) < 3;

INSERT INTO tbl_hcp (name, email, specialty, region, hco_id)
SELECT 'Dr Jan Zieliński', 'j.zielinski@hospital.example', 'Internal medicine', 'North', (SELECT id FROM tbl_hco WHERE name = 'City Hospital North' LIMIT 1)
WHERE (SELECT COUNT(*) FROM tbl_hcp) < 4;

INSERT INTO tbl_hcp (name, email, specialty, region, hco_id)
SELECT 'Dr Ewa Dąbrowska', 'e.dabrowska@sleeplab.example', 'Sleep medicine', 'South', (SELECT id FROM tbl_hco WHERE name = 'Regional Sleep Lab' LIMIT 1)
WHERE (SELECT COUNT(*) FROM tbl_hcp) < 5;

INSERT INTO tbl_hcp (name, email, specialty, region, hco_id)
SELECT 'Dr Tomasz Lewandowski', 't.lewandowski@umc.example', 'Pulmonology', 'Central', (SELECT id FROM tbl_hco WHERE name = 'University Medical Center' LIMIT 1)
WHERE (SELECT COUNT(*) FROM tbl_hcp) < 6;
