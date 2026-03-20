-- =============================================================================
-- NeoSleep BFF — consolidated baseline schema (replaces migrations 001–029)
-- Clean slate: all tables, all indexes. No seed data (use scripts/seed-dev.ts).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Migration tracker (must exist before any INSERT into it)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename   TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Neo control plane schema (platform-level, tenant-agnostic)
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS neo;

CREATE TABLE IF NOT EXISTS neo.tenants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active', -- active | suspended | trial
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS neo.tenant_features (
  tenant_id   UUID NOT NULL REFERENCES neo.tenants(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT false,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, feature_key)
);

CREATE TABLE IF NOT EXISTS neo.platform_audit (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id    UUID,
  action      TEXT NOT NULL,
  target_slug TEXT,
  details     JSONB
);

CREATE TABLE IF NOT EXISTS neo.platform_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  tenant_slug  TEXT NOT NULL,
  level        TEXT NOT NULL,
  message      TEXT NOT NULL,
  message_hash TEXT,
  count        INTEGER NOT NULL DEFAULT 1,
  first_seen   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen    TIMESTAMPTZ NOT NULL DEFAULT now(),
  status       TEXT NOT NULL DEFAULT 'open', -- open | done | dismissed
  metadata     JSONB
);

-- ---------------------------------------------------------------------------
-- Table: tbl_leads
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tbl_leads (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  name                 TEXT NOT NULL,
  email                TEXT,
  status               TEXT NOT NULL DEFAULT 'new'
                         CHECK (status IN ('new', 'contacted', 'qualified', 'inactive', 'converted')),
  region               TEXT NOT NULL DEFAULT '',
  institution          TEXT,
  converted_to_hcp_id  UUID, -- FK added after tbl_hcp (see constraint below)
  converted_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_leads_converted_to_hcp ON tbl_leads (converted_to_hcp_id);

-- ---------------------------------------------------------------------------
-- Table: tbl_users
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tbl_users (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  email                  TEXT NOT NULL,
  first_name             TEXT,
  last_name              TEXT,
  name                   TEXT,  -- kept for backward compat; can derive from first_name + last_name
  role                   TEXT NOT NULL DEFAULT 'rep'
                           CHECK (role IN ('admin', 'manager', 'rep')),
  provider               TEXT NOT NULL DEFAULT 'google',
  provider_id            TEXT NOT NULL,
  region                 TEXT,
  territory              TEXT,
  manager_id             UUID REFERENCES tbl_users(id) ON DELETE SET NULL,
  phone                  TEXT,
  avatar_url             TEXT,
  language               TEXT NOT NULL DEFAULT 'pl',
  hire_date              DATE,
  is_active              BOOLEAN NOT NULL DEFAULT true,
  token_version          INTEGER NOT NULL DEFAULT 0,
  -- Staff auth (provider='local')
  password_hash          TEXT,
  force_password_change  BOOLEAN NOT NULL DEFAULT false,
  last_password_change_at TIMESTAMPTZ,
  UNIQUE (provider, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_users_email ON tbl_users (email);
CREATE INDEX IF NOT EXISTS idx_users_role  ON tbl_users (role);

-- ---------------------------------------------------------------------------
-- Table: tbl_hco (healthcare organizations)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tbl_hco (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  name          TEXT NOT NULL,
  type          TEXT NOT NULL DEFAULT 'other',    -- clinic | hospital | practice | other
  address_line1 TEXT,
  address_line2 TEXT,
  city          TEXT,
  state         TEXT,
  postal_code   TEXT,
  country       TEXT,
  region        TEXT NOT NULL DEFAULT '',
  phone         TEXT,
  email         TEXT,
  website       TEXT,
  status        TEXT NOT NULL DEFAULT 'pending_approval'
                  CHECK (status IN ('pending_approval', 'active', 'inactive')),
  lead_id       UUID REFERENCES tbl_leads(id) ON DELETE SET NULL,
  notes         TEXT,
  approved_by   UUID REFERENCES tbl_users(id) ON DELETE SET NULL,
  approved_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_hco_region      ON tbl_hco (region);
CREATE INDEX IF NOT EXISTS idx_hco_status      ON tbl_hco (status);
CREATE INDEX IF NOT EXISTS idx_hco_lead_id     ON tbl_hco (lead_id);
CREATE INDEX IF NOT EXISTS idx_hco_approved_by ON tbl_hco (approved_by);

-- ---------------------------------------------------------------------------
-- Table: tbl_hcp (healthcare professionals) — expanded schema
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tbl_hcp (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  hco_id                    UUID REFERENCES tbl_hco(id) ON DELETE SET NULL,
  primary_hco_id            UUID REFERENCES tbl_hco(id) ON DELETE SET NULL,
  lead_id                   UUID REFERENCES tbl_leads(id) ON DELETE SET NULL,
  converted_from_lead_id    UUID REFERENCES tbl_leads(id) ON DELETE SET NULL,
  -- Identity
  title                     TEXT,          -- Dr. | Prof. | Mgr.
  first_name                TEXT NOT NULL,
  last_name                 TEXT NOT NULL,
  -- Contact
  email                     TEXT,
  phone                     TEXT,
  preferred_contact         TEXT,          -- email | phone | in_person
  preferred_time            TEXT,          -- morning | afternoon | no_preference
  -- Professional
  primary_specialty         TEXT,
  secondary_specialty       TEXT,
  role                      TEXT,          -- doctor | nurse | pharmacist
  license_number            TEXT,
  years_experience          SMALLINT,
  is_key_opinion_leader     BOOLEAN NOT NULL DEFAULT false,
  -- Pharma engagement
  influence_tier            TEXT NOT NULL DEFAULT 'C',  -- A | B | C | D
  prescribing_volume        TEXT,          -- high | medium | low | none
  engagement_level          TEXT NOT NULL DEFAULT 'unknown', -- champion | neutral | skeptic | unknown
  contact_frequency         TEXT,          -- monthly | quarterly | yearly
  -- Relationship tracking
  first_contact_date        DATE,
  visit_count               INTEGER NOT NULL DEFAULT 0,
  last_visit_date           DATE,
  -- Locale
  language                  TEXT,          -- en | pl | es
  region                    TEXT NOT NULL DEFAULT '',
  -- Approval workflow
  status                    TEXT NOT NULL DEFAULT 'pending_approval'
                              CHECK (status IN ('pending_approval', 'active', 'inactive')),
  approved_by               UUID REFERENCES tbl_users(id) ON DELETE SET NULL,
  approved_at               TIMESTAMPTZ,
  -- GDPR
  data_consent_at           TIMESTAMPTZ,
  data_consent_withdrawn_at TIMESTAMPTZ,
  -- Meta
  notes                     TEXT,
  tags                      TEXT[] NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_hcp_hco_id              ON tbl_hcp (hco_id);
CREATE INDEX IF NOT EXISTS idx_hcp_primary_hco         ON tbl_hcp (primary_hco_id);
CREATE INDEX IF NOT EXISTS idx_hcp_lead_id             ON tbl_hcp (lead_id);
CREATE INDEX IF NOT EXISTS idx_hcp_converted_from_lead ON tbl_hcp (converted_from_lead_id);
CREATE INDEX IF NOT EXISTS idx_hcp_region              ON tbl_hcp (region);
CREATE INDEX IF NOT EXISTS idx_hcp_status              ON tbl_hcp (status);
CREATE INDEX IF NOT EXISTS idx_hcp_approved_by         ON tbl_hcp (approved_by);

-- Now add the FK from tbl_leads → tbl_hcp (tbl_hcp now exists)
ALTER TABLE tbl_leads
  ADD CONSTRAINT tbl_leads_converted_to_hcp_fk
  FOREIGN KEY (converted_to_hcp_id) REFERENCES tbl_hcp(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Table: tbl_console_errors
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tbl_console_errors (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  level        TEXT NOT NULL DEFAULT 'error',   -- log | info | warn | error
  message      TEXT NOT NULL,
  message_hash TEXT,
  stack        TEXT,
  source       TEXT NOT NULL DEFAULT 'bff',     -- bff | frontend
  env          TEXT NOT NULL DEFAULT 'production',
  user_id      TEXT,
  request_id   TEXT,
  metadata     JSONB
);

CREATE INDEX IF NOT EXISTS idx_console_errors_created_at   ON tbl_console_errors (created_at);
CREATE INDEX IF NOT EXISTS idx_console_errors_message_hash ON tbl_console_errors (message_hash);
CREATE INDEX IF NOT EXISTS idx_console_errors_level        ON tbl_console_errors (level);

-- ---------------------------------------------------------------------------
-- Table: tbl_fix_tasks
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tbl_fix_tasks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  status           TEXT NOT NULL DEFAULT 'open', -- open | in_progress | done | dismissed
  title            TEXT NOT NULL,
  description      TEXT,
  log_fingerprint  TEXT NOT NULL,
  recurrence_count INT NOT NULL DEFAULT 0,
  recurrence_window TEXT,
  suggested_plan   TEXT,
  resolved_at      TIMESTAMPTZ,
  resolved_by      TEXT
);

CREATE INDEX IF NOT EXISTS idx_fix_tasks_status          ON tbl_fix_tasks (status);
CREATE INDEX IF NOT EXISTS idx_fix_tasks_log_fingerprint ON tbl_fix_tasks (log_fingerprint);

-- ---------------------------------------------------------------------------
-- Table: tbl_presentations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tbl_presentations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  title         TEXT NOT NULL,
  url           TEXT NOT NULL,
  file_type     TEXT NOT NULL DEFAULT 'pdf',  -- pdf | pptx
  source        TEXT DEFAULT 'static',         -- static | google_drive
  thumbnail_url TEXT,
  slide_count   INT
);

CREATE INDEX IF NOT EXISTS idx_presentations_file_type ON tbl_presentations (file_type);

-- ---------------------------------------------------------------------------
-- Table: tbl_events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tbl_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rep_id     UUID NOT NULL REFERENCES tbl_users(id) ON DELETE CASCADE,
  start_at   TIMESTAMPTZ NOT NULL,
  end_at     TIMESTAMPTZ NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('f2f', 'video')),
  title      TEXT,
  location   TEXT,
  video_link TEXT,
  notes      TEXT,
  region     TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL DEFAULT 'scheduled'
               CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show'))
);

CREATE INDEX IF NOT EXISTS idx_events_rep_id   ON tbl_events (rep_id);
CREATE INDEX IF NOT EXISTS idx_events_start_at ON tbl_events (start_at);
CREATE INDEX IF NOT EXISTS idx_events_end_at   ON tbl_events (end_at);
CREATE INDEX IF NOT EXISTS idx_events_region   ON tbl_events (region);
CREATE INDEX IF NOT EXISTS idx_events_status   ON tbl_events (status);

-- ---------------------------------------------------------------------------
-- Table: tbl_event_attendees
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tbl_event_attendees (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID NOT NULL REFERENCES tbl_events(id) ON DELETE CASCADE,
  attendee_type TEXT NOT NULL CHECK (attendee_type IN ('hcp', 'lead', 'hco')),
  attendee_id   UUID NOT NULL,
  is_primary    BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_event_attendees_event_id  ON tbl_event_attendees (event_id);
CREATE INDEX IF NOT EXISTS idx_event_attendees_attendee  ON tbl_event_attendees (attendee_type, attendee_id);

-- ---------------------------------------------------------------------------
-- Table: tbl_event_presentations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tbl_event_presentations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  event_id        UUID NOT NULL REFERENCES tbl_events(id) ON DELETE CASCADE,
  presentation_id UUID NOT NULL REFERENCES tbl_presentations(id) ON DELETE RESTRICT,
  opened_at       TIMESTAMPTZ,
  closed_at       TIMESTAMPTZ,
  UNIQUE (event_id, presentation_id)
);

CREATE INDEX IF NOT EXISTS idx_event_presentations_event        ON tbl_event_presentations (event_id);
CREATE INDEX IF NOT EXISTS idx_event_presentations_presentation ON tbl_event_presentations (presentation_id);

-- ---------------------------------------------------------------------------
-- Table: tbl_communication_log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tbl_communication_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  rep_id       UUID NOT NULL REFERENCES tbl_users(id) ON DELETE CASCADE,
  contact_type TEXT NOT NULL CHECK (contact_type IN ('hcp', 'lead', 'hco')),
  contact_id   UUID NOT NULL,
  type         TEXT NOT NULL DEFAULT 'email' CHECK (type IN ('email')),
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  subject      TEXT,
  notes        TEXT
);

CREATE INDEX IF NOT EXISTS idx_communication_log_rep_id   ON tbl_communication_log (rep_id);
CREATE INDEX IF NOT EXISTS idx_communication_log_contact  ON tbl_communication_log (contact_type, contact_id);
CREATE INDEX IF NOT EXISTS idx_communication_log_sent_at  ON tbl_communication_log (sent_at);

-- ---------------------------------------------------------------------------
-- Table: tbl_audit_log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tbl_audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id     UUID REFERENCES tbl_users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   TEXT,
  metadata    JSONB
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user_id     ON tbl_audit_log (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at  ON tbl_audit_log (created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_action      ON tbl_audit_log (action);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity_type ON tbl_audit_log (entity_type);

-- ---------------------------------------------------------------------------
-- Table: tbl_app_config (consolidated — all columns from 015/016/017/028)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tbl_app_config (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Brand colors (light theme)
  primary_color        TEXT NOT NULL DEFAULT '#1976d2',
  secondary_color      TEXT NOT NULL DEFAULT '#2e7d32',
  -- Brand colors (dark theme)
  primary_color_dark   TEXT NOT NULL DEFAULT '#42a5f5',
  secondary_color_dark TEXT NOT NULL DEFAULT '#66bb6a',
  -- Surface and layout
  surface_color        TEXT NOT NULL DEFAULT '#fafafa',
  border_radius        TEXT NOT NULL DEFAULT '8px',
  hero_container_style TEXT NOT NULL DEFAULT 'compact',  -- compact | wide
  color_scheme         TEXT NOT NULL DEFAULT 'light',    -- light | dark
  -- Logos and branding (white-label)
  logo_url             TEXT,
  logo_dark_url        TEXT,
  icon_url             TEXT,
  icon_dark_url        TEXT,
  tenant_name          TEXT NOT NULL DEFAULT 'NeoSleep'
);

-- ---------------------------------------------------------------------------
-- Table: tbl_pcf_responses (Post Call Form — one per completed event)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tbl_pcf_responses (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  event_id       UUID NOT NULL UNIQUE REFERENCES tbl_events(id) ON DELETE CASCADE,
  rep_id         UUID NOT NULL REFERENCES tbl_users(id) ON DELETE CASCADE,
  outcome        TEXT NOT NULL CHECK (outcome IN ('positive', 'neutral', 'negative')),
  next_action    TEXT CHECK (next_action IN ('follow_up_call', 'next_visit', 'send_materials', 'none')),
  next_action_at TIMESTAMPTZ,
  samples_given  BOOLEAN NOT NULL DEFAULT false,
  samples_notes  TEXT,
  notes          TEXT,
  submitted_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pcf_event_id     ON tbl_pcf_responses (event_id);
CREATE INDEX IF NOT EXISTS idx_pcf_rep_id       ON tbl_pcf_responses (rep_id);
CREATE INDEX IF NOT EXISTS idx_pcf_submitted_at ON tbl_pcf_responses (submitted_at);
CREATE INDEX IF NOT EXISTS idx_pcf_outcome      ON tbl_pcf_responses (outcome);

-- ---------------------------------------------------------------------------
-- Table: tbl_config_options (tenant-configurable dropdown options)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tbl_config_options (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  type       TEXT        NOT NULL,  -- 'region' | 'specialty' | 'institution_type'
  value      TEXT        NOT NULL,
  label      TEXT        NOT NULL,
  sort_order INT         NOT NULL DEFAULT 0,
  tenant_id  TEXT        NOT NULL DEFAULT 'neosleep',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (type, value, tenant_id)
);

-- ---------------------------------------------------------------------------
-- Table: tbl_password_reset_tokens
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tbl_password_reset_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES tbl_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_token_hash ON tbl_password_reset_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_password_reset_expires_at ON tbl_password_reset_tokens (expires_at);

COMMENT ON TABLE tbl_password_reset_tokens IS 'Single-use tokens for forgot-password flow; deleted after use.';

-- ---------------------------------------------------------------------------
-- Table: tbl_i18n_overrides
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tbl_i18n_overrides (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  locale     VARCHAR(10) NOT NULL,
  key        TEXT        NOT NULL,
  value      TEXT        NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (locale, key)
);
