-- =============================================================================
-- Migration 002: Seed data
-- Neo CRM — initial reference data and NeoSleep tenant configuration.
--
-- What this seeds:
--   1. platform.companies  → NeoSleep (the first Neo CRM client)
--   2. platform.tenants    → neosleep (PL + MX in one schema)
--   3. platform.lookups    → global reference data (7 types × 4 locales)
--   4. neosleep.*          → app_config, territories, products, feature flags
--
-- Idempotent: all inserts use ON CONFLICT DO NOTHING or DO UPDATE.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Companies — NeoSleep (client 1) + FourSeasons (client 2)
-- ---------------------------------------------------------------------------
INSERT INTO platform.companies (slug, name, plan, status) VALUES
  ('neosleep',    'NeoSleep',     'mvp', 'active'),
  ('fourseasons', 'Four Seasons', 'mvp', 'trial')
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Tenants — one schema per company, country_codes[] for markets
-- ---------------------------------------------------------------------------
INSERT INTO platform.tenants (company_id, slug, db_schema, country_codes, default_locale, status)
SELECT id, 'neosleep', 'neosleep', ARRAY['PL','MX'], 'en', 'active'
FROM platform.companies WHERE slug = 'neosleep'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO platform.tenants (company_id, slug, db_schema, country_codes, default_locale, status)
SELECT id, 'fourseasons', 'fourseasons', ARRAY['TH'], 'en', 'provisioning'
FROM platform.companies WHERE slug = 'fourseasons'
ON CONFLICT (slug) DO NOTHING;

-- Provision FourSeasons schema
SELECT create_tenant_schema('fourseasons');

-- ---------------------------------------------------------------------------
-- 3. Feature flags — NeoSleep
-- ---------------------------------------------------------------------------
INSERT INTO platform.feature_flags (tenant_id, feature_key, enabled, locked)
SELECT t.id, f.key, f.enabled, f.locked
FROM platform.tenants t
CROSS JOIN (VALUES
  ('push_notifications', true,  false),
  ('messaging_module',   false, false),
  ('msl_mode',           false, false),
  ('visit_plan',         true,  false),
  ('target_tracking',    false, false),
  ('sample_module',      true,  false),
  ('medical_events',     true,  false),
  ('segmentation',       false, false),
  ('patient_module',     false, true),   -- locked off until Stage 4
  ('hcp_portal',         false, true)    -- locked off until Stage 5
) AS f(key, enabled, locked)
WHERE t.slug = 'neosleep'
ON CONFLICT (tenant_id, feature_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3b. Feature flags — FourSeasons (minimal set for trial)
-- ---------------------------------------------------------------------------
INSERT INTO platform.feature_flags (tenant_id, feature_key, enabled, locked)
SELECT t.id, f.key, f.enabled, f.locked
FROM platform.tenants t
CROSS JOIN (VALUES
  ('push_notifications', false, false),
  ('messaging_module',   false, false),
  ('msl_mode',           false, false),
  ('visit_plan',         true,  false),
  ('target_tracking',    false, false),
  ('sample_module',      false, false),
  ('medical_events',     false, false),
  ('segmentation',       false, false),
  ('patient_module',     false, true),
  ('hcp_portal',         false, true)
) AS f(key, enabled, locked)
WHERE t.slug = 'fourseasons'
ON CONFLICT (tenant_id, feature_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Global lookups
-- type, key, locale, value, sort_order, locked
-- Locales: en (global default), pl (Poland), es (Mexico/Latin America), th (Thailand)
-- ---------------------------------------------------------------------------

-- ·· specialty ···············~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
INSERT INTO platform.lookups (type, key, locale, value, sort_order, locked) VALUES
  ('specialty','pulmonologist','en','Pulmonologist',       10,true),
  ('specialty','pulmonologist','pl','Pulmonolog',          10,true),
  ('specialty','pulmonologist','es','Neumólogo',           10,true),
  ('specialty','pulmonologist','th','แพทย์ระบบทางเดินหายใจ',10,true),
  ('specialty','ent',          'en','ENT Specialist',      20,true),
  ('specialty','ent',          'pl','Laryngolog',          20,true),
  ('specialty','ent',          'es','Otorrinolaringólogo', 20,true),
  ('specialty','ent',          'th','แพทย์หู คอ จมูก',    20,true),
  ('specialty','gp',           'en','General Practitioner',30,true),
  ('specialty','gp',           'pl','Lekarz rodzinny',    30,true),
  ('specialty','gp',           'es','Médico general',     30,true),
  ('specialty','gp',           'th','แพทย์ทั่วไป',        30,true),
  ('specialty','neurologist',  'en','Neurologist',         40,true),
  ('specialty','neurologist',  'pl','Neurolog',            40,true),
  ('specialty','neurologist',  'es','Neurólogo',           40,true),
  ('specialty','neurologist',  'th','แพทย์ระบบประสาท',    40,true),
  ('specialty','psychiatrist', 'en','Psychiatrist',        50,true),
  ('specialty','psychiatrist', 'pl','Psychiatra',          50,true),
  ('specialty','psychiatrist', 'es','Psiquiatra',          50,true),
  ('specialty','psychiatrist', 'th','จิตแพทย์',            50,true),
  ('specialty','cardiologist', 'en','Cardiologist',        60,true),
  ('specialty','cardiologist', 'pl','Kardiolog',           60,true),
  ('specialty','cardiologist', 'es','Cardiólogo',          60,true),
  ('specialty','cardiologist', 'th','แพทย์หัวใจ',          60,true),
  ('specialty','dentist',      'en','Dentist',             70,true),
  ('specialty','dentist',      'pl','Stomatolog',          70,true),
  ('specialty','dentist',      'es','Dentista',            70,true),
  ('specialty','dentist',      'th','ทันตแพทย์',           70,true),
  ('specialty','internist',    'en','Internist',           80,false),
  ('specialty','internist',    'pl','Internista',          80,false),
  ('specialty','internist',    'es','Internista',          80,false),
  ('specialty','internist',    'th','อายุรแพทย์',           80,false),
  ('specialty','other',        'en','Other',               99,true),
  ('specialty','other',        'pl','Inna',                99,true),
  ('specialty','other',        'es','Otra',                99,true),
  ('specialty','other',        'th','อื่นๆ',               99,true)
ON CONFLICT (type, key, locale) DO NOTHING;

-- ·· encounter_type ··········~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
INSERT INTO platform.lookups (type, key, locale, value, sort_order, locked) VALUES
  ('encounter_type','visit',   'en','In-person visit',        10,true),
  ('encounter_type','visit',   'pl','Wizyta osobista',        10,true),
  ('encounter_type','visit',   'es','Visita en persona',      10,true),
  ('encounter_type','visit',   'th','การเยี่ยมแบบพบหน้า',    10,true),
  ('encounter_type','call',    'en','Phone call',             20,true),
  ('encounter_type','call',    'pl','Rozmowa telefoniczna',   20,true),
  ('encounter_type','call',    'es','Llamada telefónica',     20,true),
  ('encounter_type','call',    'th','โทรศัพท์',               20,true),
  ('encounter_type','email',   'en','Email',                  30,true),
  ('encounter_type','email',   'pl','E-mail',                 30,true),
  ('encounter_type','email',   'es','Correo electrónico',     30,true),
  ('encounter_type','email',   'th','อีเมล',                  30,true),
  ('encounter_type','congress','en','Congress / Conference',  40,true),
  ('encounter_type','congress','pl','Kongres / Konferencja',  40,true),
  ('encounter_type','congress','es','Congreso / Conferencia', 40,true),
  ('encounter_type','congress','th','การประชุม / คอนเฟอเรนซ์',40,true),
  ('encounter_type','webinar', 'en','Webinar',                50,true),
  ('encounter_type','webinar', 'pl','Webinar',                50,true),
  ('encounter_type','webinar', 'es','Webinar',                50,true),
  ('encounter_type','webinar', 'th','เว็บบินาร์',             50,true),
  ('encounter_type','other',   'en','Other',                  99,true),
  ('encounter_type','other',   'pl','Inne',                   99,true),
  ('encounter_type','other',   'es','Otro',                   99,true),
  ('encounter_type','other',   'th','อื่นๆ',                  99,true)
ON CONFLICT (type, key, locale) DO NOTHING;

-- ·· influence_tier ··········~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
INSERT INTO platform.lookups (type, key, locale, value, sort_order, locked) VALUES
  ('influence_tier','A','en','Tier A — Key Opinion Leader',      10,true),
  ('influence_tier','A','pl','Poziom A — Kluczowy lider opinii', 10,true),
  ('influence_tier','A','es','Nivel A — Líder de opinión clave', 10,true),
  ('influence_tier','A','th','ระดับ A — ผู้นำทางความคิด',       10,true),
  ('influence_tier','B','en','Tier B — High Prescriber',         20,true),
  ('influence_tier','B','pl','Poziom B — Wysoki przepisywacz',   20,true),
  ('influence_tier','B','es','Nivel B — Alto prescriptor',       20,true),
  ('influence_tier','B','th','ระดับ B — ผู้สั่งจ่ายยาสูง',      20,true),
  ('influence_tier','C','en','Tier C — Regular',                 30,true),
  ('influence_tier','C','pl','Poziom C — Standardowy',           30,true),
  ('influence_tier','C','es','Nivel C — Regular',                30,true),
  ('influence_tier','C','th','ระดับ C — ทั่วไป',                30,true),
  ('influence_tier','D','en','Tier D — Inactive / Low value',    40,true),
  ('influence_tier','D','pl','Poziom D — Nieaktywny',            40,true),
  ('influence_tier','D','es','Nivel D — Inactivo',               40,true),
  ('influence_tier','D','th','ระดับ D — ไม่ใช้งาน',             40,true)
ON CONFLICT (type, key, locale) DO NOTHING;

-- ·· lead_status ·············~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
INSERT INTO platform.lookups (type, key, locale, value, sort_order, locked) VALUES
  ('lead_status','new',      'en','New',           10,true),
  ('lead_status','new',      'pl','Nowy',          10,true),
  ('lead_status','new',      'es','Nuevo',         10,true),
  ('lead_status','new',      'th','ใหม่',          10,true),
  ('lead_status','contacted','en','Contacted',     20,true),
  ('lead_status','contacted','pl','Skontaktowano', 20,true),
  ('lead_status','contacted','es','Contactado',    20,true),
  ('lead_status','contacted','th','ติดต่อแล้ว',    20,true),
  ('lead_status','qualified','en','Qualified',     30,true),
  ('lead_status','qualified','pl','Zakwalifikowany',30,true),
  ('lead_status','qualified','es','Calificado',    30,true),
  ('lead_status','qualified','th','คัดกรองแล้ว',  30,true),
  ('lead_status','converted','en','Converted',     40,true),
  ('lead_status','converted','pl','Przekonwertowany',40,true),
  ('lead_status','converted','es','Convertido',    40,true),
  ('lead_status','converted','th','แปลงแล้ว',      40,true),
  ('lead_status','inactive', 'en','Inactive',      90,true),
  ('lead_status','inactive', 'pl','Nieaktywny',    90,true),
  ('lead_status','inactive', 'es','Inactivo',      90,true),
  ('lead_status','inactive', 'th','ไม่ใช้งาน',    90,true)
ON CONFLICT (type, key, locale) DO NOTHING;

-- ·· organization_type ·······~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
INSERT INTO platform.lookups (type, key, locale, value, sort_order, locked) VALUES
  ('organization_type','clinic',  'en','Clinic',           10,true),
  ('organization_type','clinic',  'pl','Przychodnia',      10,true),
  ('organization_type','clinic',  'es','Clínica',          10,true),
  ('organization_type','clinic',  'th','คลินิก',           10,true),
  ('organization_type','hospital','en','Hospital',         20,true),
  ('organization_type','hospital','pl','Szpital',          20,true),
  ('organization_type','hospital','es','Hospital',         20,true),
  ('organization_type','hospital','th','โรงพยาบาล',        20,true),
  ('organization_type','pharmacy','en','Pharmacy',         30,true),
  ('organization_type','pharmacy','pl','Apteka',           30,true),
  ('organization_type','pharmacy','es','Farmacia',         30,true),
  ('organization_type','pharmacy','th','ร้านขายยา',        30,true),
  ('organization_type','practice','en','Private practice', 40,true),
  ('organization_type','practice','pl','Gabinet prywatny', 40,true),
  ('organization_type','practice','es','Consultorio privado',40,true),
  ('organization_type','practice','th','คลินิกเอกชน',      40,true),
  ('organization_type','other',   'en','Other',            99,true),
  ('organization_type','other',   'pl','Inne',             99,true),
  ('organization_type','other',   'es','Otro',             99,true),
  ('organization_type','other',   'th','อื่นๆ',            99,true)
ON CONFLICT (type, key, locale) DO NOTHING;

-- ·· engagement_level ········~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
INSERT INTO platform.lookups (type, key, locale, value, sort_order, locked) VALUES
  ('engagement_level','champion','en','Champion',   10,true),
  ('engagement_level','champion','pl','Champion',   10,true),
  ('engagement_level','champion','es','Campeón',    10,true),
  ('engagement_level','champion','th','แชมเปี้ยน',  10,true),
  ('engagement_level','neutral', 'en','Neutral',    20,true),
  ('engagement_level','neutral', 'pl','Neutralny',  20,true),
  ('engagement_level','neutral', 'es','Neutral',    20,true),
  ('engagement_level','neutral', 'th','เป็นกลาง',  20,true),
  ('engagement_level','skeptic', 'en','Skeptic',    30,true),
  ('engagement_level','skeptic', 'pl','Sceptyk',    30,true),
  ('engagement_level','skeptic', 'es','Escéptico',  30,true),
  ('engagement_level','skeptic', 'th','สงสัย',      30,true),
  ('engagement_level','unknown', 'en','Unknown',    99,true),
  ('engagement_level','unknown', 'pl','Nieznany',   99,true),
  ('engagement_level','unknown', 'es','Desconocido',99,true),
  ('engagement_level','unknown', 'th','ไม่ทราบ',    99,true)
ON CONFLICT (type, key, locale) DO NOTHING;

-- ·· user_role ···············~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
INSERT INTO platform.lookups (type, key, locale, value, sort_order, locked) VALUES
  ('user_role','rep',  'en','Medical Representative',  10,true),
  ('user_role','rep',  'pl','Przedstawiciel medyczny', 10,true),
  ('user_role','rep',  'es','Representante médico',    10,true),
  ('user_role','rep',  'th','ตัวแทนทางการแพทย์',      10,true),
  ('user_role','kam',  'en','Key Account Manager',     20,true),
  ('user_role','kam',  'pl','Key Account Manager',     20,true),
  ('user_role','kam',  'es','Key Account Manager',     20,true),
  ('user_role','kam',  'th','ผู้จัดการบัญชีหลัก',     20,true),
  ('user_role','ffm',  'en','Field Force Manager',     30,true),
  ('user_role','ffm',  'pl','Field Force Manager',     30,true),
  ('user_role','ffm',  'es','Field Force Manager',     30,true),
  ('user_role','ffm',  'th','ผู้จัดการภาคสนาม',       30,true),
  ('user_role','msl',  'en','Medical Science Liaison', 40,true),
  ('user_role','msl',  'pl','Medical Science Liaison', 40,true),
  ('user_role','msl',  'es','Medical Science Liaison', 40,true),
  ('user_role','msl',  'th','ผู้ประสานงานวิทยาศาสตร์',40,true),
  ('user_role','admin','en','Tenant Administrator',    50,true),
  ('user_role','admin','pl','Administrator',           50,true),
  ('user_role','admin','es','Administrador',           50,true),
  ('user_role','admin','th','ผู้ดูแลระบบ',             50,true)
ON CONFLICT (type, key, locale) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. neosleep — app_config
-- One config row for the entire NeoSleep tenant.
-- Country-specific settings live in i18n_overrides / user preferences.
-- ---------------------------------------------------------------------------
INSERT INTO neosleep.app_config (
  singleton,
  primary_color, secondary_color,
  primary_color_dark, secondary_color_dark,
  surface_color, surface_color_dark,
  border_radius, hero_container_style, color_scheme,
  tenant_name, pwa_theme_color,
  default_language, timezone, currency, date_format,
  support_email, privacy_policy_url, terms_url,
  social_links,
  notification_defaults,
  integrations
) VALUES (
  'config',
  '#1565C0', '#00695C',
  '#42A5F5', '#4DB6AC',
  '#F5F5F5', '#121212',
  '8px', 'compact', 'light',
  'NeoSleep', '#1565C0',
  'en', 'Europe/Warsaw', 'PLN', 'DD/MM/YYYY',
  'support@neosleepcare.com',
  'https://neosleepcare.com/privacy',
  'https://neosleepcare.com/terms',
  '{"instagram": "", "linkedin": "", "facebook": ""}'::jsonb,
  '{"push": true, "email": true, "sms": false}'::jsonb,
  '{"ga4": {"measurementId": ""}, "sentry": {"dsn": ""}, "whatsapp_business": {"phone_number_id": ""}, "twilio": {"account_sid": ""}}'::jsonb
)
ON CONFLICT (singleton) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6. neosleep — territories
-- Poland (PL) and Mexico (MX) in the same schema — country_code differentiates.
-- ---------------------------------------------------------------------------

-- Poland
INSERT INTO neosleep.territory (name, code, country_code) VALUES
  ('Polska',              'PL',     'PL'),
  ('Mazowieckie',         'PL-MZ',  'PL'),
  ('Małopolskie',         'PL-MA',  'PL'),
  ('Śląskie',             'PL-SL',  'PL'),
  ('Wielkopolskie',       'PL-WP',  'PL'),
  ('Dolnośląskie',        'PL-DS',  'PL'),
  ('Łódzkie',             'PL-LD',  'PL'),
  ('Pomorskie',           'PL-PM',  'PL'),
  ('Kujawsko-Pomorskie',  'PL-KP',  'PL')
ON CONFLICT (code) DO NOTHING;

UPDATE neosleep.territory
SET parent_id = (SELECT id FROM neosleep.territory WHERE code = 'PL')
WHERE country_code = 'PL' AND code != 'PL' AND parent_id IS NULL;

-- Mexico
INSERT INTO neosleep.territory (name, code, country_code) VALUES
  ('México',              'MX',      'MX'),
  ('CDMX',                'MX-CDMX', 'MX'),
  ('Estado de México',    'MX-MEX',  'MX'),
  ('Nuevo León',          'MX-NL',   'MX'),
  ('Jalisco',             'MX-JAL',  'MX'),
  ('Puebla',              'MX-PUE',  'MX'),
  ('Guanajuato',          'MX-GTO',  'MX'),
  ('Querétaro',           'MX-QRO',  'MX')
ON CONFLICT (code) DO NOTHING;

UPDATE neosleep.territory
SET parent_id = (SELECT id FROM neosleep.territory WHERE code = 'MX')
WHERE country_code = 'MX' AND code != 'MX' AND parent_id IS NULL;

-- ---------------------------------------------------------------------------
-- 7. neosleep — products
-- One product family for now; more added via future migrations (003_+).
-- Same codes, different names per market — locale handled in app i18n.
-- ---------------------------------------------------------------------------
INSERT INTO neosleep.product (name, code, category, description, keywords, is_active) VALUES
  (
    'NeoSleep CPAP Therapy',
    'NEO-CPAP-01',
    'device',
    'Continuous Positive Airway Pressure therapy system for OSA treatment',
    ARRAY['cpap','sleep apnea','OSA','SAOS','OBS','therapy','device'],
    true
  ),
  (
    'NeoSleep Sleep Study Kit',
    'NEO-STUDY-01',
    'device',
    'Home sleep apnea test kit for HCP-ordered diagnostic studies',
    ARRAY['sleep study','diagnostic','home test','PSG','polysomnography'],
    true
  )
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 8. neosleep — i18n_overrides (product-specific strings not in global i18n)
-- ---------------------------------------------------------------------------
INSERT INTO neosleep.i18n_overrides (locale, key, value) VALUES
  ('en', 'product.neo_cpap_01.tagline',   'Effective sleep therapy for OSA patients'),
  ('pl', 'product.neo_cpap_01.tagline',   'Skuteczna terapia snu dla pacjentów z OBS'),
  ('es', 'product.neo_cpap_01.tagline',   'Terapia efectiva del sueño para pacientes con SAOS'),
  ('th', 'product.neo_cpap_01.tagline',   'การรักษาการนอนหลับที่มีประสิทธิภาพสำหรับผู้ป่วย OSA'),
  ('en', 'product.neo_study_01.tagline',  'Diagnose sleep disorders from home'),
  ('pl', 'product.neo_study_01.tagline',  'Diagnostyka zaburzeń snu w domu'),
  ('es', 'product.neo_study_01.tagline',  'Diagnostica trastornos del sueño desde casa'),
  ('th', 'product.neo_study_01.tagline',  'วินิจฉัยความผิดปกติของการนอนหลับจากที่บ้าน')
ON CONFLICT (locale, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- ---------------------------------------------------------------------------
-- FourSeasons — app_config (minimal, can be customized via admin panel later)
-- ---------------------------------------------------------------------------
INSERT INTO fourseasons.app_config (
  singleton,
  primary_color, secondary_color,
  primary_color_dark, secondary_color_dark,
  surface_color, surface_color_dark,
  border_radius, hero_container_style, color_scheme,
  tenant_name, pwa_theme_color,
  default_language, timezone, currency, date_format,
  support_email,
  integrations
) VALUES (
  'config',
  '#B8860B', '#2E4057',
  '#DAA520', '#4A6FA5',
  '#FAFAFA', '#121212',
  '4px', 'wide', 'light',
  'Four Seasons', '#B8860B',
  'en', 'Asia/Bangkok', 'THB', 'DD/MM/YYYY',
  'support@fourseasons-crm.com',
  '{"ga4": {"measurementId": ""}, "sentry": {"dsn": ""}}'::jsonb
)
ON CONFLICT (singleton) DO NOTHING;

-- FourSeasons — territories (Thailand, starter set)
INSERT INTO fourseasons.territory (name, code, country_code) VALUES
  ('Thailand',        'TH',      'TH'),
  ('Bangkok',         'TH-BKK',  'TH'),
  ('Chiang Mai',      'TH-CNX',  'TH'),
  ('Phuket',          'TH-HKT',  'TH'),
  ('Pattaya',         'TH-PTV',  'TH'),
  ('Khon Kaen',       'TH-KKN',  'TH')
ON CONFLICT (code) DO NOTHING;

UPDATE fourseasons.territory
SET parent_id = (SELECT id FROM fourseasons.territory WHERE code = 'TH')
WHERE country_code = 'TH' AND code != 'TH' AND parent_id IS NULL;

-- ---------------------------------------------------------------------------
-- 9. Admin user — Łukasz Ostrowski (production admin, NeoSleep tenant)
--
-- Three records required:
--   a) platform.users  — Neo CRM product-level owner account
--   b) neosleep.identities — person record in the NeoSleep tenant schema
--   c) neosleep.users      — tenant auth record (force_password_change on first login)
--   d) neosleep.user_roles — admin role assignment
--
-- Password is NOT seeded here. BFF reads ADMIN_DEFAULT_PASSWORD env var and
-- sets the bcrypt hash on first startup via auth.ts's ensureAdminBootstrap()
-- call (server.ts, runs after runMigrations() on every startup; no-op once
-- a real password_hash exists).
-- force_password_change = true forces a reset on the very first login.
--
-- Idempotent: all inserts use ON CONFLICT DO NOTHING.
-- ---------------------------------------------------------------------------

-- a) Platform owner account (Neo CRM product team)
INSERT INTO platform.users (email, name, role, is_active)
VALUES ('lukasz.ostrowski@neosleepcare.com', 'Łukasz Ostrowski', 'owner', true)
ON CONFLICT (email) DO NOTHING;

-- b) Identity record in neosleep tenant schema
INSERT INTO neosleep.identities (first_name, last_name, email, language, timezone)
VALUES ('Łukasz', 'Ostrowski', 'lukasz.ostrowski@neosleepcare.com', 'en', 'Europe/Warsaw')
ON CONFLICT (email) DO NOTHING;

-- c) Tenant user record — linked to the identity above
-- ON CONFLICT (identity_id): identity_id is UNIQUE on users — idempotent re-run safe.
INSERT INTO neosleep.users (identity_id, force_password_change, status, country_code)
SELECT id, true, 'active', 'PL'
FROM neosleep.identities
WHERE email = 'lukasz.ostrowski@neosleepcare.com'
ON CONFLICT (identity_id) DO NOTHING;

-- d) Admin role in the neosleep tenant
-- user_roles UNIQUE(user_id, role, scope): defaults to scope='global' here
-- (see 001_tenant_schema.sql / 013_user_roles_scope.sql), so ON CONFLICT
-- (user_id, role, scope) would work — kept as WHERE NOT EXISTS anyway to
-- match this file's existing idempotency style.
INSERT INTO neosleep.user_roles (user_id, role)
SELECT u.id, 'admin'
FROM neosleep.users u
JOIN neosleep.identities i ON i.id = u.identity_id
WHERE i.email = 'lukasz.ostrowski@neosleepcare.com'
  AND NOT EXISTS (
    SELECT 1 FROM neosleep.user_roles ur
    JOIN neosleep.users u2 ON u2.id = ur.user_id
    JOIN neosleep.identities i2 ON i2.id = u2.identity_id
    WHERE i2.email = 'lukasz.ostrowski@neosleepcare.com'
      AND ur.role = 'admin'
      AND ur.scope = 'global'
  );
