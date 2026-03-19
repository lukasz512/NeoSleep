-- Tenant-configurable dropdown options (regions, specialties, institution types).
-- Managers can add/edit/delete their own tenant's options via the settings panel.

CREATE TABLE IF NOT EXISTS tbl_config_options (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  type       TEXT        NOT NULL,   -- 'region' | 'specialty' | 'institution_type'
  value      TEXT        NOT NULL,
  label      TEXT        NOT NULL,
  sort_order INT         NOT NULL DEFAULT 0,
  tenant_id  TEXT        NOT NULL DEFAULT 'neosleep',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (type, value, tenant_id)
);

-- Default NeoSleep options
INSERT INTO tbl_config_options (type, value, label, sort_order) VALUES
  ('region',    'North',           'North',            1),
  ('region',    'Central',         'Central',          2),
  ('region',    'South',           'South',            3),
  ('region',    'West',            'West',             4),
  ('specialty', 'Pulmonology',     'Pulmonology',      1),
  ('specialty', 'Sleep medicine',  'Sleep medicine',   2),
  ('specialty', 'Neurology',       'Neurology',        3),
  ('specialty', 'ENT',             'ENT',              4),
  ('specialty', 'Internal medicine','Internal medicine',5),
  ('specialty', 'Family medicine', 'Family medicine',  6)
ON CONFLICT (type, value, tenant_id) DO NOTHING;
