-- Demo seed: 3 more HCOs, 8 more HCPs, 9 more leads. Safe to run after 009.
-- Does NOT delete existing data – only appends if records are missing.

-- ---------------------------------------------------------------------------
-- HCOs
-- ---------------------------------------------------------------------------
INSERT INTO tbl_hco (name, type, region, status)
SELECT 'Centrum Pulmonologii Południe', 'hospital', 'South', 'active'
WHERE NOT EXISTS (SELECT 1 FROM tbl_hco WHERE name = 'Centrum Pulmonologii Południe');

INSERT INTO tbl_hco (name, type, region, status)
SELECT 'Klinika Zdrowia Zachód', 'clinic', 'West', 'active'
WHERE NOT EXISTS (SELECT 1 FROM tbl_hco WHERE name = 'Klinika Zdrowia Zachód');

INSERT INTO tbl_hco (name, type, region, status)
SELECT 'ENT & Sleep Clinic Centrum', 'clinic', 'Central', 'active'
WHERE NOT EXISTS (SELECT 1 FROM tbl_hco WHERE name = 'ENT & Sleep Clinic Centrum');

-- ---------------------------------------------------------------------------
-- HCPs (linked to HCOs by name)
-- ---------------------------------------------------------------------------
INSERT INTO tbl_hcp (name, email, specialty, region, hco_id)
SELECT 'Dr Katarzyna Wójcik', 'k.wojcik@pulm-south.example', 'ENT', 'South', id
FROM tbl_hco WHERE name = 'Centrum Pulmonologii Południe' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO tbl_hcp (name, email, specialty, region, hco_id)
SELECT 'Dr Marek Kowalczyk', 'm.kowalczyk@pulm-south.example', 'Pulmonology', 'South', id
FROM tbl_hco WHERE name = 'Centrum Pulmonologii Południe' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO tbl_hcp (name, email, specialty, region, hco_id)
SELECT 'Dr Agnieszka Lewandowska', 'a.lewandowska@klinika-zachod.example', 'Sleep medicine', 'West', id
FROM tbl_hco WHERE name = 'Klinika Zdrowia Zachód' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO tbl_hcp (name, email, specialty, region, hco_id)
SELECT 'Dr Tomasz Dąbrowski', 't.dabrowski@klinika-zachod.example', 'Family medicine', 'West', id
FROM tbl_hco WHERE name = 'Klinika Zdrowia Zachód' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO tbl_hcp (name, email, specialty, region, hco_id)
SELECT 'Dr Ewa Szymańska', 'e.szymanska@entclinic.example', 'Pneumonology', 'Central', id
FROM tbl_hco WHERE name = 'ENT & Sleep Clinic Centrum' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO tbl_hcp (name, email, specialty, region, hco_id)
SELECT 'Dr Robert Wiśniewski', 'r.wisniewski@hospital-north.example', 'ENT', 'North', id
FROM tbl_hco WHERE name = 'City Hospital North' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO tbl_hcp (name, email, specialty, region, hco_id)
SELECT 'Dr Natalia Kaczmarek', 'n.kaczmarek@pulm-south.example', 'Sleep medicine', 'South', id
FROM tbl_hco WHERE name = 'Centrum Pulmonologii Południe' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO tbl_hcp (name, email, specialty, region, hco_id)
SELECT 'Dr Paweł Jankowski', 'p.jankowski@neosleep.example', 'Internal medicine', 'Central', id
FROM tbl_hco WHERE name = 'NeoSleep Care Center' LIMIT 1
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Leads
-- ---------------------------------------------------------------------------
INSERT INTO tbl_leads (name, email, status, region, institution)
SELECT 'Dr Beata Michalska', 'b.michalska@klinika-zachod.example', 'new', 'West', 'Klinika Zdrowia Zachód'
WHERE NOT EXISTS (SELECT 1 FROM tbl_leads WHERE email = 'b.michalska@klinika-zachod.example');

INSERT INTO tbl_leads (name, email, status, region, institution)
SELECT 'Regional Sleep Center', 'contact@regional-sleep.example', 'qualified', 'North', 'Regional Sleep Center'
WHERE NOT EXISTS (SELECT 1 FROM tbl_leads WHERE email = 'contact@regional-sleep.example');

INSERT INTO tbl_leads (name, email, status, region, institution)
SELECT 'Dr Krzysztof Adamski', 'k.adamski@pulm-south.example', 'contacted', 'South', 'Centrum Pulmonologii Południe'
WHERE NOT EXISTS (SELECT 1 FROM tbl_leads WHERE email = 'k.adamski@pulm-south.example');

INSERT INTO tbl_leads (name, email, status, region, institution)
SELECT 'Centrum Medyczne Beta', 'info@centrum-beta.example', 'new', 'Central', 'Centrum Medyczne Beta'
WHERE NOT EXISTS (SELECT 1 FROM tbl_leads WHERE email = 'info@centrum-beta.example');

INSERT INTO tbl_leads (name, email, status, region, institution)
SELECT 'Dr Zofia Wróbel', 'z.wrobel@entclinic.example', 'accepted', 'West', 'ENT & Sleep Clinic Centrum'
WHERE NOT EXISTS (SELECT 1 FROM tbl_leads WHERE email = 'z.wrobel@entclinic.example');

INSERT INTO tbl_leads (name, email, status, region, institution)
SELECT 'Dr Łukasz Mazur', 'l.mazur@hospital-north.example', 'new', 'North', 'City Hospital North'
WHERE NOT EXISTS (SELECT 1 FROM tbl_leads WHERE email = 'l.mazur@hospital-north.example');

INSERT INTO tbl_leads (name, email, status, region, institution)
SELECT 'Hospital Group Gamma', 'info@gamma-hospital.example', 'qualified', 'South', 'Hospital Group Gamma'
WHERE NOT EXISTS (SELECT 1 FROM tbl_leads WHERE email = 'info@gamma-hospital.example');

INSERT INTO tbl_leads (name, email, status, region, institution)
SELECT 'Dr Monika Pawlak', 'm.pawlak@neosleep.example', 'contacted', 'Central', 'NeoSleep Care Center'
WHERE NOT EXISTS (SELECT 1 FROM tbl_leads WHERE email = 'm.pawlak@neosleep.example');

INSERT INTO tbl_leads (name, email, status, region, institution)
SELECT 'Sleep Therapy Clinic', 'contact@sleep-therapy.example', 'accepted', 'West', 'Sleep Therapy Clinic'
WHERE NOT EXISTS (SELECT 1 FROM tbl_leads WHERE email = 'contact@sleep-therapy.example');
