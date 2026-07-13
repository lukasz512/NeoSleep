-- =============================================================================
-- Migration 000: Platform schema
-- Neo CRM — control plane, shared across all clients (tenants).
-- Run once against the shared Supabase project.
--
-- Schemas:
--   platform.*  — Neo CRM product layer (companies, tenants, lookups, etc.)
--   public.*    — schema_migrations tracker only
--
-- Idempotent: safe to re-run (IF NOT EXISTS everywhere).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Migration tracker
-- Records which .sql files have already run so they are never applied twice.
-- Lives in the default (public) schema, visible to all migrations.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename   TEXT        PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Platform schema
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS platform;

-- ---------------------------------------------------------------------------
-- platform.companies
-- Pharma companies that license Neo CRM (one row per client organisation).
-- A company can operate in multiple countries — country is on the tenant record.
-- NeoSleep is the first company; more follow as Neo CRM grows.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform.companies (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       TEXT        UNIQUE NOT NULL,            -- e.g. 'neosleep', 'biologix'
  name       TEXT        NOT NULL,                   -- display name
  plan       TEXT        NOT NULL DEFAULT 'mvp'
               CHECK (plan IN ('mvp', 'pro', 'enterprise')),
  status     TEXT        NOT NULL DEFAULT 'active'
               CHECK (status IN ('trial', 'active', 'suspended', 'churned')),
  metadata   JSONB,                                  -- billing contact, contract notes, etc.
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- platform.tenants
-- One tenant = one company deployment.
-- Country is NOT a separate tenant. A single tenant can cover multiple countries
-- by using country_code columns on individual records (users, practitioners, etc.).
-- This follows the CLAUDE.md rule: "Country = region attribute, NOT a separate tenant."
--
-- db_schema = the PostgreSQL schema name created by provision_tenant_schema().
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform.tenants (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID        NOT NULL REFERENCES platform.companies(id) ON DELETE CASCADE,
  slug           TEXT        UNIQUE NOT NULL,         -- = db_schema, e.g. 'neosleep'
  db_schema      TEXT        NOT NULL,                -- explicit for clarity; usually = slug
  country_codes  TEXT[]      NOT NULL DEFAULT '{}',   -- markets this tenant operates in: ['PL','MX','TH']
  default_locale TEXT        NOT NULL DEFAULT 'en',
  status         TEXT        NOT NULL DEFAULT 'active'
                   CHECK (status IN ('provisioning', 'active', 'suspended', 'archived')),
  metadata       JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_tenants_company ON platform.tenants (company_id);
CREATE INDEX IF NOT EXISTS idx_platform_tenants_status  ON platform.tenants (status);

-- ---------------------------------------------------------------------------
-- platform.feature_flags
-- Per-tenant on/off switches for Neo CRM product features.
-- locked=true → flag cannot be changed by tenant admin, only by Neo CRM team.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform.feature_flags (
  tenant_id   UUID    NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  feature_key TEXT    NOT NULL,          -- e.g. 'push_notifications', 'msl_mode', 'patient_module'
  enabled     BOOLEAN NOT NULL DEFAULT false,
  locked      BOOLEAN NOT NULL DEFAULT false,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, feature_key)
);

-- ---------------------------------------------------------------------------
-- platform.users
-- Neo CRM internal team accounts (product owner, support, engineers).
-- NOT pharma reps — those live in {tenant}.users.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform.users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT        UNIQUE NOT NULL,
  name          TEXT        NOT NULL,
  password_hash TEXT,                                -- bcrypt; null for SSO-only accounts
  role          TEXT        NOT NULL DEFAULT 'support'
                  CHECK (role IN ('owner', 'admin', 'support', 'readonly')),
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- platform.lookups
-- Global read-only reference data for all tenants.
-- Tenants can override labels or disable non-locked items via {tenant}.lookup.
--
-- key    = stable machine identifier used in code and as FK target (never changes).
-- value  = translated display label (one row per key per locale).
-- locked = true → tenant cannot hide or rename this item.
--
-- Example: type='specialty', key='pulmonologist', locale='pl', value='Pulmonolog'
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform.lookups (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  type       TEXT        NOT NULL,    -- 'specialty' | 'encounter_type' | 'influence_tier' | ...
  key        TEXT        NOT NULL,    -- stable machine key, e.g. 'pulmonologist'
  locale     TEXT        NOT NULL DEFAULT 'en',
  value      TEXT        NOT NULL,    -- translated label for this locale
  sort_order INT         NOT NULL DEFAULT 0,
  locked     BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (type, key, locale)
);

CREATE INDEX IF NOT EXISTS idx_platform_lookups_type   ON platform.lookups (type);
CREATE INDEX IF NOT EXISTS idx_platform_lookups_locale ON platform.lookups (locale);

-- ---------------------------------------------------------------------------
-- platform.diagnostics
-- System error log aggregated across all tenants.
-- BFF and frontend both write here (POST /api/log).
-- message_hash enables deduplication (group repeated errors into one row).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform.diagnostics (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  tenant_slug  TEXT,                               -- null = platform-level error
  level        TEXT        NOT NULL DEFAULT 'error'
                 CHECK (level IN ('log', 'info', 'warn', 'error', 'fatal')),
  message      TEXT        NOT NULL,
  message_hash TEXT,                               -- sha256(message) for dedup
  stack        TEXT,
  source       TEXT        NOT NULL DEFAULT 'api'
                 CHECK (source IN ('api', 'frontend', 'worker', 'migration')),
  env          TEXT        NOT NULL DEFAULT 'production',
  user_id      TEXT,
  request_id   TEXT,
  count        INT         NOT NULL DEFAULT 1,
  first_seen   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen    TIMESTAMPTZ NOT NULL DEFAULT now(),
  status       TEXT        NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open', 'resolved', 'dismissed')),
  metadata     JSONB
);

CREATE INDEX IF NOT EXISTS idx_platform_diagnostics_tenant  ON platform.diagnostics (tenant_slug);
CREATE INDEX IF NOT EXISTS idx_platform_diagnostics_hash    ON platform.diagnostics (message_hash);
CREATE INDEX IF NOT EXISTS idx_platform_diagnostics_level   ON platform.diagnostics (level);
CREATE INDEX IF NOT EXISTS idx_platform_diagnostics_status  ON platform.diagnostics (status);
CREATE INDEX IF NOT EXISTS idx_platform_diagnostics_created ON platform.diagnostics (created_at);

-- ---------------------------------------------------------------------------
-- platform.audit
-- Immutable audit trail for platform-level actions only:
-- tenant provisioning, feature flag changes, platform user management.
-- Business data mutations (HCP updates, encounters) go into {tenant}.audit_log.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform.audit (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id    UUID        REFERENCES platform.users(id) ON DELETE SET NULL,
  actor_email TEXT,                               -- denormalized: preserves history after user deletion
  action      TEXT        NOT NULL,               -- 'tenant.create' | 'flag.update' | 'user.suspend'
  target_type TEXT,                               -- 'tenant' | 'company' | 'platform_user'
  target_id   TEXT,
  before      JSONB,
  after       JSONB,
  ip_address  INET,
  user_agent  TEXT
);

CREATE INDEX IF NOT EXISTS idx_platform_audit_actor   ON platform.audit (actor_id);
CREATE INDEX IF NOT EXISTS idx_platform_audit_created ON platform.audit (created_at);
CREATE INDEX IF NOT EXISTS idx_platform_audit_action  ON platform.audit (action);

-- ---------------------------------------------------------------------------
-- platform.payment_method
-- Stripe payment methods saved per tenant (for SaaS billing) or per patient
-- (for D2C purchases). We store only Stripe references — never card data.
--
-- stripe_customer_id: the Stripe Customer object for this entity.
-- stripe_pm_id:       the Stripe PaymentMethod ID (pm_...).
-- card_last4 / brand: display-only, sourced from Stripe API — safe to store.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform.payment_method (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Owner: either a tenant (SaaS billing) or a patient (D2C)
  owner_type          TEXT        NOT NULL
                        CHECK (owner_type IN ('tenant', 'patient')),
  owner_id            TEXT        NOT NULL,   -- tenant.slug or patient UUID (as TEXT for flexibility)
  -- Stripe references (PCI data lives entirely in Stripe)
  stripe_customer_id  TEXT        NOT NULL,   -- cus_...
  stripe_pm_id        TEXT        NOT NULL UNIQUE, -- pm_...
  -- Display info (safe to store — not sensitive)
  type                TEXT        NOT NULL DEFAULT 'card'
                        CHECK (type IN ('card', 'blik', 'bank_transfer', 'sepa_debit')),
  card_brand          TEXT,       -- 'visa' | 'mastercard' | 'amex'
  card_last4          TEXT,       -- last 4 digits, display only
  card_exp_month      INT,
  card_exp_year       INT,
  -- Defaults
  is_default          BOOLEAN     NOT NULL DEFAULT false,
  metadata            JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_pm_owner       ON platform.payment_method (owner_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_platform_pm_stripe_cust ON platform.payment_method (stripe_customer_id);

-- ---------------------------------------------------------------------------
-- platform.invoice
-- Billing invoices issued to tenants for their SaaS subscription.
-- Stripe handles the actual payment — we store the invoice record for our
-- own accounting, dunning, and support.
--
-- stripe_invoice_id: Stripe Invoice object (in_...).
-- period_start / period_end: billing period this invoice covers.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform.invoice (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID          NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  stripe_invoice_id TEXT          UNIQUE,   -- in_... (null if manually issued)
  -- Financials
  currency          TEXT          NOT NULL DEFAULT 'USD',
  subtotal          NUMERIC(12,2) NOT NULL,
  tax               NUMERIC(12,2) NOT NULL DEFAULT 0,
  total             NUMERIC(12,2) NOT NULL,
  -- Period
  period_start      DATE          NOT NULL,
  period_end        DATE          NOT NULL,
  -- Lifecycle
  status            TEXT          NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'open', 'paid', 'void', 'uncollectible')),
  due_date          DATE,
  paid_at           TIMESTAMPTZ,
  -- Document
  invoice_pdf_url   TEXT,         -- Stripe-hosted PDF URL
  notes             TEXT,
  metadata          JSONB,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_invoice_tenant  ON platform.invoice (tenant_id);
CREATE INDEX IF NOT EXISTS idx_platform_invoice_status  ON platform.invoice (status);
CREATE INDEX IF NOT EXISTS idx_platform_invoice_period  ON platform.invoice (period_start, period_end);

-- ---------------------------------------------------------------------------
-- platform.dpa_agreement
-- Data Processing Agreement between Neo CRM (processor) and each tenant (controller).
-- GDPR Art. 28 / LFPDPPP Art. 50 / PDPA § 40 all require a signed DPA before
-- any personal data processing begins. NeoSleep = data processor.
--
-- One row per signed version per tenant. is_current=true marks the active DPA.
-- When a new version is signed: set old is_current=false, insert new row.
-- document_url: pointer to the signed PDF in secure storage (never store inline).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform.dpa_agreement (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID        NOT NULL REFERENCES platform.tenants(id) ON DELETE RESTRICT,
  version          TEXT        NOT NULL,           -- e.g. "v2.1" — DPA template version
  -- Signatory (data controller representative — the pharma company)
  signed_by        TEXT        NOT NULL,           -- full name of signatory
  signed_title     TEXT,                           -- job title of signatory
  signed_at        TIMESTAMPTZ NOT NULL,
  -- Document
  document_url     TEXT,                           -- secure URL to signed PDF (S3/Supabase Storage)
  -- Jurisdiction — determines which regulatory template was used
  jurisdiction     TEXT        NOT NULL
                     CHECK (jurisdiction IN ('EU', 'MX', 'TH', 'US', 'OTHER')),
  -- Lifecycle
  valid_from       DATE        NOT NULL,
  valid_until      DATE,                           -- NULL = indefinite
  is_current       BOOLEAN     NOT NULL DEFAULT true,  -- exactly one true per tenant at a time
  notes            TEXT,
  metadata         JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_dpa_tenant   ON platform.dpa_agreement (tenant_id);
CREATE INDEX IF NOT EXISTS idx_platform_dpa_current  ON platform.dpa_agreement (tenant_id) WHERE is_current = true;

-- =============================================================================
-- onboard_new_client()
-- Single function to add a new paying client (company + tenant + schema).
-- Replaces 3 manual SQL steps. Called by BFF endpoint POST /api/admin/clients.
--
-- What it does:
--   1. Creates platform.companies row
--   2. Creates platform.tenants row (slug = schema name)
--   3. Calls create_tenant_schema(slug) — creates all 57 tables
--   4. Inserts default feature flags (all disabled — admin enables per contract)
--   5. Inserts a blank app_config row (tenant customises via admin UI)
--
-- Parameters:
--   p_company_name  e.g. 'Biologix'
--   p_slug          e.g. 'biologix'  — becomes the schema name, must be unique
--   p_country_codes e.g. ARRAY['PL','MX']
--   p_plan          'mvp' | 'pro' | 'enterprise'
--   p_locale        default locale, e.g. 'en' | 'pl' | 'th'
--
-- Returns: JSON with company_id, tenant_id, schema_name, status
--
-- Idempotent: safe to re-run if interrupted (uses ON CONFLICT DO NOTHING).
-- =============================================================================
CREATE OR REPLACE FUNCTION onboard_new_client(
  p_company_name  TEXT,
  p_slug          TEXT,
  p_country_codes TEXT[]  DEFAULT ARRAY['PL'],
  p_plan          TEXT    DEFAULT 'mvp',
  p_locale        TEXT    DEFAULT 'en'
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_company_id UUID;
  v_tenant_id  UUID;
BEGIN
  -- Validate slug (same rules as create_tenant_schema)
  IF p_slug !~ '^[a-z][a-z0-9_]{1,62}$' THEN
    RAISE EXCEPTION 'Invalid slug: "%". Use lowercase letters, digits, underscores.', p_slug;
  END IF;

  -- 1. Create company
  INSERT INTO platform.companies (slug, name, plan, status)
  VALUES (p_slug, p_company_name, p_plan, 'active')
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO v_company_id;

  -- If already exists, fetch the id
  IF v_company_id IS NULL THEN
    SELECT id INTO v_company_id FROM platform.companies WHERE slug = p_slug;
  END IF;

  -- 2. Create tenant
  INSERT INTO platform.tenants (company_id, slug, db_schema, country_codes, default_locale, status)
  VALUES (v_company_id, p_slug, p_slug, p_country_codes, p_locale, 'provisioning')
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO v_tenant_id;

  IF v_tenant_id IS NULL THEN
    SELECT id INTO v_tenant_id FROM platform.tenants WHERE slug = p_slug;
  END IF;

  -- 3. Create all tenant tables (57 tables, indexes, constraints)
  PERFORM create_tenant_schema(p_slug);

  -- 4. Default feature flags — all off; sales/admin enables per contract
  INSERT INTO platform.feature_flags (tenant_id, feature_key, enabled, locked)
  VALUES
    (v_tenant_id, 'messaging_module',    false, false),
    (v_tenant_id, 'sample_module',       false, false),
    (v_tenant_id, 'events_module',       false, false),
    (v_tenant_id, 'segmentation',        false, false),
    (v_tenant_id, 'ai_insights',         false, false),
    (v_tenant_id, 'training_module',     false, false),
    (v_tenant_id, 'patient_d2c',         false, false),
    (v_tenant_id, 'push_notifications',  false, false),
    (v_tenant_id, 'hcp_portal',          false, true),   -- locked: needs security review first
    (v_tenant_id, 'patient_module',      false, true)    -- locked: needs DPA in place
  ON CONFLICT (tenant_id, feature_key) DO NOTHING;

  -- 5. Blank app_config — tenant fills in branding via admin UI
  EXECUTE format(
    'INSERT INTO %I.app_config (tenant_name, default_language)
     VALUES (%L, %L)
     ON CONFLICT DO NOTHING',
    p_slug, p_company_name, p_locale
  );

  -- 6. Mark tenant as active
  UPDATE platform.tenants SET status = 'active' WHERE id = v_tenant_id;

  RETURN jsonb_build_object(
    'company_id',   v_company_id,
    'tenant_id',    v_tenant_id,
    'schema_name',  p_slug,
    'status',       'active',
    'tables_created', 57
  );
END;
$$;

-- Usage examples:
-- SELECT onboard_new_client('Biologix', 'biologix', ARRAY['PL','MX'], 'mvp', 'pl');
-- SELECT onboard_new_client('Four Seasons', 'fourseasons', ARRAY['TH'], 'mvp', 'en');
-- SELECT onboard_new_client('Acme Pharma', 'acmepharma', ARRAY['PL'], 'pro', 'en');
