-- =============================================================================
-- Migration 001: Tenant schema template
-- Neo CRM — all per-tenant tables provisioned via create_tenant_schema().
--
-- Architecture decision: one schema per COMPANY (not per country).
-- Country is a column on individual records (country_code TEXT).
-- International reps operate in the same schema — cross-country queries are trivial.
-- Separate schemas per country would only be needed for strict data residency laws
-- (China, Russia) — not applicable for PL/MX/TH.
--
-- To add a new client in the future:
--   SELECT create_tenant_schema('acmepharma');
--
-- Idempotent: safe to re-run.
-- =============================================================================

CREATE OR REPLACE FUNCTION create_tenant_schema(slug TEXT)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN

  -- Validate slug: lowercase alphanumeric + underscores only (prevents schema injection)
  IF slug !~ '^[a-z][a-z0-9_]{1,62}$' THEN
    RAISE EXCEPTION 'Invalid tenant slug: "%". Must match ^[a-z][a-z0-9_]+$', slug;
  END IF;

  EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', slug);

  -- ===========================================================================
  -- IDENTITY
  -- Shared base table for all person types: users, practitioners, patients, leads.
  -- Stores contact fields once; all other tables reference via identity_id.
  -- ===========================================================================
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.identities (
      id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      -- Names & titles
      -- title: formal salutation used in communications and printed materials.
      -- Works for pharma ("Dr.", "Prof.") AND hospitality ("Mr.", "Ms.", "Khun" in TH).
      title          TEXT,
      first_name     TEXT,
      last_name      TEXT,
      -- preferred_name: the name this person goes by (not their legal name).
      -- e.g. "Dr. Tomasz Kowalski" → preferred_name = "Tomek".
      -- Used in rep coaching (AI summaries) and WhatsApp salutations.
      preferred_name TEXT,
      -- Contact
      email          TEXT        UNIQUE,
      phone          TEXT,
      -- Social links: structured channels map for any identity type (user, HCP, patient, lead).
      -- All channels live here — not on individual tables — so automations and AI
      -- can resolve channels uniformly across entity types.
      -- Example: { "whatsapp": "+48500...", "line": "dr.somchai", "instagram": "@handle",
      --            "linkedin": "https://...", "telegram": "@handle", "twitter": "@handle" }
      -- LINE is the primary messaging channel in Thailand (FourSeasons market).
      social_links   JSONB       NOT NULL DEFAULT ''{}''::JSONB,
      -- Demographics
      date_of_birth  DATE,
      gender         TEXT        CHECK (gender IN (''male'', ''female'', ''other'', ''prefer_not_to_say'', NULL)),
      language       TEXT        NOT NULL DEFAULT ''en'',
      timezone       TEXT        NOT NULL DEFAULT ''UTC'',
      -- Media
      avatar_url     TEXT,
      notes          TEXT,
      metadata       JSONB,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    )', slug);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.identities (email)',
    slug||'_identities_email_idx', slug);

  -- ===========================================================================
  -- USERS (pharma company employees: reps, KAMs, FFMs, MSLs, admins)
  -- Auth: Google OIDC (google_sub) OR local password OR WebAuthn passkey.
  -- Doctors and patients are NOT users — they are practitioners/patients with
  -- their own auth flow (magic_link_tokens / future passkeys).
  -- ===========================================================================
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.users (
      id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      identity_id             UUID        NOT NULL UNIQUE REFERENCES %I.identities(id) ON DELETE CASCADE,
      -- Auth
      google_sub              TEXT        UNIQUE,
      password_hash           TEXT,
      force_password_change   BOOLEAN     NOT NULL DEFAULT false,
      last_password_change_at TIMESTAMPTZ,
      token_version           INT         NOT NULL DEFAULT 0,
      -- Professional profile
      bio                     TEXT,
      hire_date               DATE,
      manager_id              UUID        REFERENCES %I.users(id) ON DELETE SET NULL,
      -- work_phone: office/company number — distinct from personal phone on identities.
      -- Social channels (WhatsApp, LINE, LinkedIn, etc.) are on identities.social_links
      -- so they are accessible uniformly across users, practitioners, patients, and leads.
      work_phone              TEXT,
      -- Assignment
      country_code            TEXT,       -- primary country (rep''s home market)
      region                  TEXT,
      territory_id            UUID,       -- FK added after territory table
      -- Status
      status                  TEXT        NOT NULL DEFAULT ''active''
                                CHECK (status IN (''active'', ''inactive'', ''suspended'')),
      deleted_at              TIMESTAMPTZ,
      metadata                JSONB,
      created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
    )', slug, slug, slug);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.users (identity_id)',
    slug||'_users_identity_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.users (manager_id)',
    slug||'_users_manager_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.users (status) WHERE deleted_at IS NULL',
    slug||'_users_status_idx', slug);

  -- ===========================================================================
  -- USER_ROLES
  -- Roles scoped per user, per access scope.
  -- scope is a country_code (e.g. 'PL', 'MX') or the literal 'global' —
  -- 'global' means the role applies across every region/country in the tenant.
  -- A rep can be rep in PL and kam in MX (two rows, two scopes).
  -- ===========================================================================
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.user_roles (
      id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    UUID        NOT NULL REFERENCES %I.users(id) ON DELETE CASCADE,
      role       TEXT        NOT NULL
                   CHECK (role IN (''admin'', ''manager'', ''kam'', ''msl'', ''rep'', ''doctor'')),
      scope      TEXT        NOT NULL DEFAULT ''global'',
      granted_by UUID        REFERENCES %I.users(id) ON DELETE SET NULL,
      metadata   JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (user_id, role, scope)
    )', slug, slug, slug);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.user_roles (user_id)',
    slug||'_user_roles_user_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.user_roles (role, scope)',
    slug||'_user_roles_role_scope_idx', slug);

  -- ===========================================================================
  -- AUTH TOKENS
  -- ===========================================================================

  -- Password reset (single-use, deleted after use)
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.password_reset_tokens (
      id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    UUID        NOT NULL REFERENCES %I.users(id) ON DELETE CASCADE,
      token_hash TEXT        NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      metadata   JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )', slug, slug);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.password_reset_tokens (token_hash)',
    slug||'_prt_hash_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.password_reset_tokens (expires_at)',
    slug||'_prt_expires_idx', slug);

  -- Remember-me tokens (persistent login sessions)
  -- Flow: on "remember me" → store sha256(token) in DB, token in cookie.
  -- On return visit → sha256(cookie) matches DB row → auto-login.
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.remember_me_tokens (
      id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id      UUID        NOT NULL REFERENCES %I.users(id) ON DELETE CASCADE,
      token_hash   TEXT        NOT NULL UNIQUE,
      expires_at   TIMESTAMPTZ NOT NULL,
      last_used_at TIMESTAMPTZ,
      revoked_at   TIMESTAMPTZ,
      device_name  TEXT,       -- e.g. "iPhone 15 Pro — Safari"
      user_agent   TEXT,
      ip_address   INET,
      metadata     JSONB,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    )', slug, slug);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.remember_me_tokens (token_hash)',
    slug||'_rmt_hash_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.remember_me_tokens (user_id)',
    slug||'_rmt_user_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.remember_me_tokens (expires_at)',
    slug||'_rmt_expires_idx', slug);

  -- WebAuthn / Passkeys (Touch ID, Face ID, Windows Hello)
  -- public_key is stored; private key never leaves the user''s device (Secure Enclave).
  -- counter prevents replay attacks.
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.webauthn_credentials (
      id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id         UUID        NOT NULL REFERENCES %I.users(id) ON DELETE CASCADE,
      credential_id   TEXT        NOT NULL UNIQUE,   -- base64url-encoded credential ID
      public_key      TEXT        NOT NULL,           -- COSE-encoded public key
      counter         BIGINT      NOT NULL DEFAULT 0, -- signature counter (anti-replay)
      device_type     TEXT,                           -- ''platform'' (Touch ID) | ''cross-platform'' (YubiKey)
      device_name     TEXT,                           -- user-assigned label
      last_used_at    TIMESTAMPTZ,
      metadata        JSONB,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )', slug, slug);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.webauthn_credentials (user_id)',
    slug||'_webauthn_user_idx', slug);

  -- Magic link tokens (for future HCP / practitioner login)
  -- Practitioners are NOT users — they use email magic links, not passwords.
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.magic_link_tokens (
      id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      entity_type     TEXT        NOT NULL
                        CHECK (entity_type IN (''practitioner'', ''patient'')),
      entity_id       UUID        NOT NULL,
      token_hash      TEXT        NOT NULL UNIQUE,
      expires_at      TIMESTAMPTZ NOT NULL,
      used_at         TIMESTAMPTZ,
      metadata        JSONB,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )', slug);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.magic_link_tokens (token_hash)',
    slug||'_mlt_hash_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.magic_link_tokens (entity_type, entity_id)',
    slug||'_mlt_entity_idx', slug);

  -- ===========================================================================
  -- SESSIONS & ACTIVITY LOG
  -- Standards: ISO 27001 §A.12.4 (event logging and monitoring),
  --            OWASP ASVS V7 (session management logging),
  --            GDPR Art. 30 (records of processing activities),
  --            EFPIA Code (audit trail for all interactions involving HCPs).
  --
  -- user_session: one row per login session (auth → logout/timeout).
  --   - Linked to audit_log via session_id for "what did this user do in this session".
  --   - Linked to request_log via session_id for crash investigation.
  --
  -- request_log: one row per inbound API call.
  --   - Short retention (delete rows > 90 days via nightly worker).
  --   - Use for: diagnosing app crashes, tracking slow routes, GDPR Art. 30 records.
  --   - Do NOT store request/response bodies here — data mutations go to audit_log.
  -- ===========================================================================

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.user_session (
      id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       UUID        NOT NULL REFERENCES %I.users(id) ON DELETE CASCADE,
      -- Session lifecycle
      started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      ended_at      TIMESTAMPTZ,
      -- Auth context
      auth_method   TEXT        NOT NULL DEFAULT ''password''
                      CHECK (auth_method IN (''password'', ''google_oidc'', ''webauthn'', ''magic_link'', ''remember_me'')),
      -- Device & network (captured at login, never updated mid-session)
      ip_address    INET,
      user_agent    TEXT,
      device_name   TEXT,       -- derived from user_agent e.g. "iPhone 15 Pro — Safari"
      country_code  TEXT,       -- GeoIP at login time
      -- Lifecycle control
      is_active     BOOLEAN     NOT NULL DEFAULT true,
      revoked_at    TIMESTAMPTZ,
      revoke_reason TEXT,       -- ''logout'' | ''timeout'' | ''admin_revoke'' | ''password_change''
      metadata      JSONB,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )', slug, slug);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.user_session (user_id)',
    slug||'_session_user_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.user_session (started_at)',
    slug||'_session_started_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.user_session (is_active) WHERE is_active = true',
    slug||'_session_active_idx', slug);

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.request_log (
      id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id  UUID        REFERENCES %I.user_session(id) ON DELETE SET NULL,
      user_id     UUID        REFERENCES %I.users(id) ON DELETE SET NULL,
      -- Request identity
      method      TEXT        NOT NULL,    -- ''GET'' | ''POST'' | ''PUT'' | ''PATCH'' | ''DELETE''
      route       TEXT        NOT NULL,    -- express route pattern: ''/api/practitioners/:id''
      path        TEXT        NOT NULL,    -- actual resolved path: ''/api/practitioners/abc-123''
      status_code INT         NOT NULL,
      duration_ms INT,                     -- server-side response time in milliseconds
      -- Correlation
      request_id  TEXT        UNIQUE,      -- X-Request-ID header — used to join with audit_log
      -- Context
      ip_address  INET,
      user_agent  TEXT,
      error       TEXT,                    -- error message if status_code >= 400
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )', slug, slug, slug);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.request_log (session_id)',
    slug||'_reqlog_session_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.request_log (user_id, created_at)',
    slug||'_reqlog_user_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.request_log (route, status_code)',
    slug||'_reqlog_route_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.request_log (created_at)',
    slug||'_reqlog_created_idx', slug);

  -- ===========================================================================
  -- GEOGRAPHY
  -- ===========================================================================

  -- Territories: geographic subdivisions within a country used for rep assignment.
  -- e.g. "Mazowieckie", "CDMX Norte", "Bangkok Metro"
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.territory (
      id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      name         TEXT        NOT NULL,
      code         TEXT        UNIQUE,               -- short code, e.g. "PL-MZ"
      country_code TEXT        NOT NULL,
      parent_id    UUID        REFERENCES %I.territory(id) ON DELETE SET NULL,
      metadata     JSONB,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    )', slug, slug);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.territory (country_code)',
    slug||'_territory_country_idx', slug);

  -- territory_user: which reps cover which territories (many-to-many).
  -- valid_from/to allows historical tracking of assignment changes.
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.territory_user (
      territory_id UUID        NOT NULL REFERENCES %I.territory(id) ON DELETE CASCADE,
      user_id      UUID        NOT NULL REFERENCES %I.users(id) ON DELETE CASCADE,
      role         TEXT        NOT NULL DEFAULT ''rep''
                     CHECK (role IN (''rep'', ''kam'', ''ffm'', ''msl'', ''backup'')),
      valid_from   DATE        NOT NULL DEFAULT CURRENT_DATE,
      valid_to     DATE,
      metadata     JSONB,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (territory_id, user_id)
    )', slug, slug, slug);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.territory_user (user_id)',
    slug||'_territory_user_user_idx', slug);

  -- Add FK from users.territory_id → territory.id (territory table now exists)
  EXECUTE format('ALTER TABLE %I.users DROP CONSTRAINT IF EXISTS %I', slug, slug||'_users_territory_fk');
  EXECUTE format('
    ALTER TABLE %I.users
      ADD CONSTRAINT %I FOREIGN KEY (territory_id)
      REFERENCES %I.territory(id) ON DELETE SET NULL',
    slug, slug||'_users_territory_fk', slug);

  -- ===========================================================================
  -- HEALTHCARE ORGANISATIONS (HCO)
  -- FHIR R4: Organization
  -- ===========================================================================
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.organization (
      id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      name          TEXT        NOT NULL,
      type          TEXT        NOT NULL DEFAULT ''other''
                      CHECK (type IN (''clinic'', ''hospital'', ''pharmacy'', ''practice'', ''other'')),
      identifiers   JSONB,      -- {nip: "...", regon: "...", rfc: "..."}
      address_line1 TEXT,
      city          TEXT,
      state         TEXT,
      postal_code   TEXT,
      country_code  TEXT,
      region        TEXT,
      territory_id  UUID        REFERENCES %I.territory(id) ON DELETE SET NULL,
      phone         TEXT,
      email         TEXT,
      website       TEXT,
      google_link   TEXT,       -- Google Maps/Business profile URL
      latitude      DOUBLE PRECISION,  -- geocoded from address fields, see services/geocoding.ts — null until geocoded
      longitude     DOUBLE PRECISION,
      specialties   TEXT[]      NOT NULL DEFAULT ''{}''::TEXT[],  -- mirrors practitioner.specialties vocabulary
      status        TEXT        NOT NULL DEFAULT ''active''
                      CHECK (status IN (''pending_approval'', ''active'', ''inactive'')),
      metadata      JSONB,
      deleted_at    TIMESTAMPTZ,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )', slug, slug);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.organization (territory_id) WHERE deleted_at IS NULL',
    slug||'_org_territory_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.organization (status) WHERE deleted_at IS NULL',
    slug||'_org_status_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.organization (country_code)',
    slug||'_org_country_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.organization USING GIN (specialties)',
    slug||'_org_specialties_gin', slug);

  -- ===========================================================================
  -- PRACTITIONERS (HCP — doctors, dentists, specialists)
  -- FHIR R4: Practitioner
  -- ===========================================================================
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.practitioner (
      id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      identity_id               UUID        NOT NULL REFERENCES %I.identities(id) ON DELETE CASCADE,
      -- Primary workplace (convenience; full list in practitioner_organization)
      organization_id           UUID        REFERENCES %I.organization(id) ON DELETE SET NULL,
      -- Professional
      salutation                TEXT,       -- Dr. | Prof. | Mgr.
      national_ids              JSONB,      -- {pwz: "...", cedula: "..."} per country
      primary_specialty         TEXT,
      specialties               TEXT[]      NOT NULL DEFAULT ''{}''::TEXT[],
      -- Pharma engagement
      influence_tier            TEXT        NOT NULL DEFAULT ''C''
                                  CHECK (influence_tier IN (''A'', ''B'', ''C'', ''D'')),
      engagement_level          TEXT        NOT NULL DEFAULT ''unknown''
                                  CHECK (engagement_level IN (''champion'', ''neutral'', ''skeptic'', ''unknown'')),
      prescribing_volume        TEXT
                                  CHECK (prescribing_volume IN (''high'', ''medium'', ''low'', ''none'', NULL)),
      is_key_opinion_leader     BOOLEAN     NOT NULL DEFAULT false,
      -- Visit tracking (denormalized counters — updated by trigger or app logic)
      visit_count               INT         NOT NULL DEFAULT 0,
      last_visit_date           DATE,
      first_contact_date        DATE,
      -- Locale / geography
      country_code              TEXT,
      region                    TEXT,
      territory_id              UUID        REFERENCES %I.territory(id) ON DELETE SET NULL,
      -- Workflow
      status                    TEXT        NOT NULL DEFAULT ''active''
                                  CHECK (status IN (''pending_approval'', ''active'', ''inactive'')),
      -- GDPR Art. 9 / LFPDPPP / PDPA
      data_consent_at           TIMESTAMPTZ,
      data_consent_withdrawn_at TIMESTAMPTZ,
      -- Meta
      tags                      TEXT[]      NOT NULL DEFAULT ''{}''::TEXT[],
      metadata                  JSONB,
      deleted_at                TIMESTAMPTZ,
      created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
    )', slug, slug, slug, slug);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.practitioner (identity_id)',
    slug||'_prac_identity_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.practitioner (organization_id)',
    slug||'_prac_org_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.practitioner (territory_id) WHERE deleted_at IS NULL',
    slug||'_prac_territory_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.practitioner (status) WHERE deleted_at IS NULL',
    slug||'_prac_status_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.practitioner (influence_tier)',
    slug||'_prac_tier_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.practitioner (primary_specialty) WHERE deleted_at IS NULL',
    slug||'_prac_specialty_idx', slug);
  -- GIN index: fast filtering by specialties array ("show all pulmonologists")
  -- This is a core MVP query — without GIN it would be a full table scan.
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.practitioner USING gin (specialties)',
    slug||'_prac_specialties_gin', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.practitioner USING gin (tags)',
    slug||'_prac_tags_gin', slug);

  -- practitioner_organization: full many-to-many (doctor works at multiple clinics)
  -- FHIR R4: PractitionerRole
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.practitioner_organization (
      id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      practitioner_id UUID        NOT NULL REFERENCES %I.practitioner(id) ON DELETE CASCADE,
      organization_id UUID        NOT NULL REFERENCES %I.organization(id) ON DELETE CASCADE,
      role            TEXT,       -- e.g. "attending", "consultant", "head_of_dept"
      is_primary      BOOLEAN     NOT NULL DEFAULT false,   -- global primary for this practitioner
      valid_from      DATE,
      valid_to        DATE,
      metadata        JSONB,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (practitioner_id, organization_id)
    )', slug, slug, slug);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.practitioner_organization (practitioner_id)',
    slug||'_pracorg_prac_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.practitioner_organization (organization_id)',
    slug||'_pracorg_org_idx', slug);

  -- practitioner_assignment: which rep manages which practitioner, and at which org.
  -- This allows a different "primary organization" per rep-practitioner pair.
  -- e.g. Rep A visits Dr. Kowalski at Szpital X; Rep B visits him at Klinika Y.
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.practitioner_assignment (
      id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      practitioner_id UUID        NOT NULL REFERENCES %I.practitioner(id) ON DELETE CASCADE,
      user_id         UUID        NOT NULL REFERENCES %I.users(id) ON DELETE CASCADE,
      primary_org_id  UUID        REFERENCES %I.organization(id) ON DELETE SET NULL,
      relationship_notes TEXT,
      assigned_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      metadata        JSONB,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (practitioner_id, user_id)
    )', slug, slug, slug, slug);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.practitioner_assignment (user_id)',
    slug||'_pracassign_user_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.practitioner_assignment (practitioner_id)',
    slug||'_pracassign_prac_idx', slug);

  -- ===========================================================================
  -- PATIENTS
  -- FHIR R4: Patient
  -- Patients are end-users of the sleep care service. They can arrive via:
  --   a) HCP referral (practitioner_id set by rep)
  --   b) Direct website purchase (self-referred, google_sub / password_hash set)
  --
  -- Auth: patients use their own auth separate from pharma users.
  --   - Google OIDC → google_sub
  --   - Password → password_hash (bcrypt)
  --   - WebAuthn/biometric → patient_webauthn_credentials table below
  --   - Magic link → magic_link_tokens (entity_type='patient') — already exists
  --
  -- diagnosis_code JSONB stores ICD-10 codes (e.g. G47.3 = Obstructive Sleep Apnea).
  -- ahi_baseline is populated automatically when sleep_study results arrive.
  -- ===========================================================================
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.patient (
      id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      identity_id               UUID        NOT NULL REFERENCES %I.identities(id) ON DELETE CASCADE,
      -- Auth (patients log in on website/portal, separate from pharma users)
      google_sub                TEXT        UNIQUE,
      password_hash             TEXT,
      token_version             INT         NOT NULL DEFAULT 0, -- increment to invalidate all sessions
      -- Referring doctor (set by rep or by patient self-selection)
      practitioner_id           UUID        REFERENCES %I.practitioner(id) ON DELETE SET NULL,
      -- Clinical
      diagnosis_code            JSONB,      -- ICD-10 array: [{"code":"G47.3","label":"OSA"}]
      ahi_baseline              NUMERIC(6,2), -- filled automatically from sleep_study.ahi_score
      cpap_device               TEXT,
      medical_record            TEXT,
      -- Shipping address (for device fulfillment)
      shipping_address          JSONB,      -- {line1, city, postal_code, country_code}
      -- Locale / geography
      country_code              TEXT,
      region                    TEXT,
      territory_id              UUID        REFERENCES %I.territory(id) ON DELETE SET NULL,
      status                    TEXT        NOT NULL DEFAULT ''active''
                                  CHECK (status IN (''active'', ''follow_up'', ''discharged'')),
      -- GDPR Art. 9 / LFPDPPP / PDPA — health data is special category
      data_consent_at           TIMESTAMPTZ,
      data_consent_withdrawn_at TIMESTAMPTZ,
      metadata                  JSONB,
      deleted_at                TIMESTAMPTZ,
      created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
    )', slug, slug, slug, slug, slug);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.patient (practitioner_id)',
    slug||'_patient_prac_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.patient (google_sub)',
    slug||'_patient_google_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.patient (status) WHERE deleted_at IS NULL',
    slug||'_patient_status_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.patient (country_code)',
    slug||'_patient_country_idx', slug);

  -- patient_webauthn_credentials: Touch ID / Face ID for patient portal.
  -- Mirrors users.webauthn_credentials but scoped to patients.
  -- Private key never leaves device Secure Enclave — we store only the public key.
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.patient_webauthn_credentials (
      id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id    UUID        NOT NULL REFERENCES %I.patient(id) ON DELETE CASCADE,
      credential_id TEXT        NOT NULL UNIQUE,  -- base64url-encoded
      public_key    TEXT        NOT NULL,          -- COSE-encoded public key
      counter       BIGINT      NOT NULL DEFAULT 0,
      device_type   TEXT,                          -- ''platform'' (Face ID) | ''cross-platform'' (YubiKey)
      device_name   TEXT,
      last_used_at  TIMESTAMPTZ,
      metadata      JSONB,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )', slug, slug);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.patient_webauthn_credentials (patient_id)',
    slug||'_pat_webauthn_user_idx', slug);

  -- ===========================================================================
  -- SUPPLIERS
  -- External partners: device manufacturers (Biologix), 3D scan labs (3Shape),
  -- OA appliance makers, sleep labs. Anything that receives an automatic order
  -- from the platform or sends results back via webhook/API.
  --
  -- api_endpoint + api_key_hash: BFF calls supplier to place orders automatically.
  -- The real API key lives in BFF env vars — api_key_hash is for audit only.
  -- webhook_secret_hash: supplier calls us with results — we verify the signature.
  -- ===========================================================================
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.supplier (
      id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      name                 TEXT        NOT NULL,   -- "Biologix", "3Shape", "Orthoapnea"
      type                 TEXT        NOT NULL
                             CHECK (type IN (''device_manufacturer'', ''scan_lab'', ''oa_manufacturer'', ''sleep_lab'', ''other'')),
      -- Integration
      api_endpoint         TEXT,                   -- REST endpoint for automated orders
      api_key_ref          TEXT,                   -- reference to BFF env var holding the real key
      webhook_secret_ref   TEXT,                   -- reference to BFF env var for inbound webhook sig
      -- Contact
      contact_email        TEXT,
      contact_phone        TEXT,
      country_code         TEXT,
      is_active            BOOLEAN     NOT NULL DEFAULT true,
      metadata             JSONB,
      created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
    )', slug);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.supplier (type) WHERE is_active = true',
    slug||'_supplier_type_idx', slug);

  -- ===========================================================================
  -- SLEEP STUDIES
  -- Full D2C clinical pipeline: patient buys → device shipped → study done →
  -- results in → doctor interprets → OA indicated or not.
  --
  -- Status flow:
  --   ordered → device_shipped → device_delivered → study_complete
  --   → results_received → interpreted → [cancelled]
  --
  -- Key metrics (filled automatically from device/lab API results):
  --   ahi_score: Apnea-Hypopnea Index — main diagnostic metric.
  --   spo2_nadir: lowest O2 saturation during the night.
  --   odi: Oxygen Desaturation Index.
  --
  -- On interpreted: oa_indicated/cpap_indicated drive the next step.
  -- App creates a treatment_plan row based on doctor recommendation.
  -- Patient.ahi_baseline is updated from ahi_score automatically.
  -- ===========================================================================
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.sleep_study (
      id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id           UUID        NOT NULL REFERENCES %I.patient(id) ON DELETE CASCADE,
      purchase_order_id    UUID,                   -- FK added after purchase_order table (below)
      -- Device fulfillment (Biologix or other supplier)
      supplier_id          UUID        REFERENCES %I.supplier(id) ON DELETE SET NULL,
      device_serial        TEXT,                   -- which specific device was dispatched
      device_shipped_at    TIMESTAMPTZ,
      device_delivered_at  TIMESTAMPTZ,
      device_returned_at   TIMESTAMPTZ,
      -- Study
      study_date           DATE,
      -- Results (populated automatically via supplier webhook)
      results_received_at  TIMESTAMPTZ,
      raw_results          JSONB,                  -- full payload from device/lab API
      ahi_score            NUMERIC(6,2),           -- Apnea-Hypopnea Index
      spo2_nadir           NUMERIC(5,2),           -- lowest O2 saturation (%%)
      odi                  NUMERIC(6,2),           -- Oxygen Desaturation Index
      -- Interpretation (by practitioner — doctor)
      interpreted_by       UUID        REFERENCES %I.practitioner(id) ON DELETE SET NULL,
      interpreted_at       TIMESTAMPTZ,
      interpretation       TEXT,                   -- doctor''s narrative notes
      diagnosis_code       JSONB,                  -- ICD-10 array
      -- Clinical outcome
      oa_indicated         BOOLEAN,                -- true → create treatment_plan (type=dental_appliance)
      cpap_indicated       BOOLEAN,
      -- Lifecycle
      status               TEXT        NOT NULL DEFAULT ''ordered''
                             CHECK (status IN (
                               ''ordered'', ''device_shipped'', ''device_delivered'',
                               ''study_complete'', ''results_received'', ''interpreted'', ''cancelled''
                             )),
      notes                TEXT,
      metadata             JSONB,
      created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
    )', slug, slug, slug, slug);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.sleep_study (patient_id)',
    slug||'_study_patient_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.sleep_study (status)',
    slug||'_study_status_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.sleep_study (interpreted_by)',
    slug||'_study_doctor_idx', slug);

  -- ===========================================================================
  -- TREATMENT PLANS
  -- Created after a sleep study is interpreted. One plan per recommended therapy.
  -- A patient may have multiple plans (e.g. starts with CPAP, switches to dental).
  --
  -- type drives which fields are relevant:
  --
  --   cpap / apap        → device ordered through platform (purchase_order_id)
  --   dental_appliance   → patient picks dentist → 3D scan → appliance manufactured
  --                        (this replaces what was previously called "oa_referral")
  --   positional         → positional device or app (simpler flow, lower cost)
  --   lifestyle          → no device; advice only (weight, alcohol, sleep position)
  --   watchful_waiting   → re-test in 6–12 months, no immediate treatment
  --
  -- Dental appliance flow (type=''dental_appliance''):
  --   dentist_id: practitioner with specialty=''dentist'' selected by patient
  --   scan_supplier_id: 3D scan lab (e.g. 3Shape, Carestream)
  --   appliance_supplier_id: manufacturer (e.g. Orthoapnea, SomnoMed)
  --   scan_file_url: 3D scan result (also mirrored in file_attachment)
  -- ===========================================================================
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.treatment_plan (
      id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id            UUID        NOT NULL REFERENCES %I.patient(id) ON DELETE CASCADE,
      sleep_study_id        UUID        NOT NULL REFERENCES %I.sleep_study(id) ON DELETE CASCADE,
      -- Treatment type (determines which fields below are used)
      type                  TEXT        NOT NULL
                              CHECK (type IN (
                                ''cpap'', ''apap'', ''dental_appliance'',
                                ''positional'', ''lifestyle'', ''watchful_waiting''
                              )),
      -- CPAP / APAP path
      device_product_id     UUID,                   -- FK added after product table (deferred)
      device_purchase_order_id UUID,    -- FK added after purchase_order (deferred constraint)
      -- Dental appliance path (replaces the old oa_referral concept)
      dentist_id            UUID        REFERENCES %I.practitioner(id) ON DELETE SET NULL,
      dentist_notified_at   TIMESTAMPTZ,
      dentist_accepted_at   TIMESTAMPTZ,
      appointment_at        TIMESTAMPTZ,
      scan_supplier_id      UUID        REFERENCES %I.supplier(id) ON DELETE SET NULL,
      scan_ordered_at       TIMESTAMPTZ,
      scan_received_at      TIMESTAMPTZ,
      scan_file_url         TEXT,
      appliance_supplier_id UUID        REFERENCES %I.supplier(id) ON DELETE SET NULL,
      appliance_ordered_at  TIMESTAMPTZ,
      appliance_delivered_at TIMESTAMPTZ,
      -- Common fields
      recommended_by        UUID        REFERENCES %I.practitioner(id) ON DELETE SET NULL,
      notes                 TEXT,
      -- Lifecycle status (shared across all types — irrelevant steps stay null)
      status                TEXT        NOT NULL DEFAULT ''initiated''
                              CHECK (status IN (
                                ''initiated'', ''patient_notified'', ''in_progress'',
                                ''completed'', ''cancelled'', ''on_hold''
                              )),
      metadata              JSONB,
      created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
    )', slug, slug, slug, slug, slug, slug, slug, slug);
  --      ^schema ^patient ^sleep_study ^product ^practitioner(dentist) ^supplier(scan) ^supplier(appliance) ^practitioner(recommended_by)

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.treatment_plan (patient_id)',
    slug||'_tx_patient_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.treatment_plan (sleep_study_id)',
    slug||'_tx_study_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.treatment_plan (dentist_id)',
    slug||'_tx_dentist_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.treatment_plan (type, status)',
    slug||'_tx_type_status_idx', slug);

  -- ===========================================================================
  -- LEADS (prospects not yet converted)
  -- ===========================================================================
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.lead (
      id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      identity_id       UUID        NOT NULL REFERENCES %I.identities(id) ON DELETE CASCADE,
      source            TEXT,       -- "referral" | "event" | "web" | "cold" | "congress"
      status            TEXT        NOT NULL DEFAULT ''new''
                          CHECK (status IN (''new'', ''contacted'', ''follow_up_needed'', ''meeting_scheduled'',
                                             ''declined'', ''qualified'', ''inactive'', ''converted'')),
      country_code      TEXT,
      region            TEXT        NOT NULL DEFAULT '''',
      territory_id      UUID        REFERENCES %I.territory(id) ON DELETE SET NULL,
      assigned_to       UUID        REFERENCES %I.users(id) ON DELETE SET NULL,
      -- Conversion tracking
      converted_to_id   UUID,
      converted_to_type TEXT        CHECK (converted_to_type IN (''practitioner'', ''organization'', NULL)),
      converted_at      TIMESTAMPTZ,
      metadata          JSONB,
      deleted_at        TIMESTAMPTZ,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    )', slug, slug, slug, slug);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.lead (status) WHERE deleted_at IS NULL',
    slug||'_lead_status_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.lead (assigned_to)',
    slug||'_lead_assigned_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.lead (territory_id)',
    slug||'_lead_territory_idx', slug);

  -- ===========================================================================
  -- E-COMMERCE: ORDERS & PAYMENTS
  -- Patients buy packages (sleep study, consultation, devices) directly on the
  -- website. One order can contain multiple items (e.g. study kit + follow-up).
  --
  -- Payment via Stripe:
  --   stripe_payment_intent_id: Stripe''s reference for the payment attempt.
  --     → use it to check status, issue refunds, retrieve receipts.
  --     → we NEVER store card numbers (Stripe handles all PCI data).
  --   stripe_customer_id: links patient to their Stripe customer profile.
  --     → used for recurring payments and saved payment methods.
  --
  -- On order paid: a sleep_study row is created automatically (or supplier_order
  -- dispatched, depending on order type).
  -- ===========================================================================
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.purchase_order (
      id                       UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_id               UUID          NOT NULL REFERENCES %I.patient(id) ON DELETE RESTRICT,
      -- Stripe references (no card data ever stored here)
      stripe_payment_intent_id TEXT          UNIQUE,   -- pi_3Kx... — for refunds and status checks
      stripe_customer_id       TEXT,                   -- cus_... — for saved payment methods
      -- Financials
      currency                 TEXT          NOT NULL DEFAULT ''PLN'',
      subtotal                 NUMERIC(12,2) NOT NULL,
      tax                      NUMERIC(12,2) NOT NULL DEFAULT 0,
      total                    NUMERIC(12,2) NOT NULL,
      -- Shipping
      shipping_address         JSONB,        -- snapshot of address at time of order
      shipping_method          TEXT,
      -- Lifecycle
      status                   TEXT          NOT NULL DEFAULT ''pending''
                                 CHECK (status IN (
                                   ''pending'', ''paid'', ''processing'',
                                   ''shipped'', ''delivered'', ''cancelled'', ''refunded''
                                 )),
      paid_at                  TIMESTAMPTZ,
      shipped_at               TIMESTAMPTZ,
      delivered_at             TIMESTAMPTZ,
      notes                    TEXT,
      metadata                 JSONB,
      created_at               TIMESTAMPTZ   NOT NULL DEFAULT now(),
      updated_at               TIMESTAMPTZ   NOT NULL DEFAULT now()
    )', slug, slug);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.purchase_order (patient_id)',
    slug||'_porder_patient_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.purchase_order (status)',
    slug||'_porder_status_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.purchase_order (stripe_payment_intent_id)',
    slug||'_porder_stripe_idx', slug);

  -- purchase_order_item: individual line items within an order.
  -- product_id references the product catalogue (same table used for pharma products).
  -- fulfillment_supplier_id: which supplier fulfills THIS item (can differ per item).
  -- fulfillment_status: tracks per-item delivery independently.
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.purchase_order_item (
      id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id              UUID          NOT NULL REFERENCES %I.purchase_order(id) ON DELETE CASCADE,
      product_id            UUID,                       -- FK added after product table (deferred)
      description           TEXT          NOT NULL,   -- snapshot of product name at purchase time
      quantity              INT           NOT NULL DEFAULT 1,
      unit_price            NUMERIC(12,2) NOT NULL,
      currency              TEXT          NOT NULL DEFAULT ''PLN'',
      -- Fulfillment (which supplier handles this item)
      fulfillment_supplier_id UUID        REFERENCES %I.supplier(id) ON DELETE SET NULL,
      fulfillment_status    TEXT          NOT NULL DEFAULT ''pending''
                              CHECK (fulfillment_status IN (
                                ''pending'', ''dispatched'', ''shipped'', ''delivered'', ''cancelled''
                              )),
      tracking_number       TEXT,
      metadata              JSONB,
      created_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
      updated_at            TIMESTAMPTZ   NOT NULL DEFAULT now()
    )', slug, slug, slug, slug);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.purchase_order_item (order_id)',
    slug||'_pitem_order_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.purchase_order_item (fulfillment_supplier_id)',
    slug||'_pitem_supplier_idx', slug);

  -- Add FK from sleep_study.purchase_order_id now that purchase_order exists
  EXECUTE format('ALTER TABLE %I.sleep_study DROP CONSTRAINT IF EXISTS %I', slug, slug||'_study_order_fk');
  EXECUTE format('
    ALTER TABLE %I.sleep_study
      ADD CONSTRAINT %I FOREIGN KEY (purchase_order_id)
      REFERENCES %I.purchase_order(id) ON DELETE SET NULL',
    slug, slug||'_study_order_fk', slug);

  -- ===========================================================================
  -- SUPPORT TICKETS (patient ↔ AI ↔ human consultant chat routing)
  -- Patients start in conversation (WhatsApp-style chat, AI handles first).
  -- When AI cannot resolve or patient requests a human → support_ticket is created
  -- and assigned to a consultant (user with role rep/admin).
  -- This enables a small team to handle high message volume with AI triage.
  -- ===========================================================================
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.support_ticket (
      id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id  UUID        NOT NULL,         -- FK added after conversation table (deferred)
      patient_id       UUID        REFERENCES %I.patient(id) ON DELETE SET NULL,
      -- Assignment
      assigned_to      UUID        REFERENCES %I.users(id) ON DELETE SET NULL,  -- consultant
      assigned_at      TIMESTAMPTZ,
      -- Ticket details
      subject          TEXT,
      priority         TEXT        NOT NULL DEFAULT ''normal''
                         CHECK (priority IN (''low'', ''normal'', ''urgent'')),
      status           TEXT        NOT NULL DEFAULT ''open''
                         CHECK (status IN (''open'', ''in_progress'', ''resolved'', ''closed'')),
      -- Resolution
      resolved_at      TIMESTAMPTZ,
      resolution_notes TEXT,
      -- Source: was this escalated from AI or opened manually?
      source           TEXT        NOT NULL DEFAULT ''ai_escalation''
                         CHECK (source IN (''ai_escalation'', ''patient_request'', ''manual'')),
      metadata         JSONB,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
    )', slug, slug, slug, slug);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.support_ticket (assigned_to, status)',
    slug||'_ticket_assignee_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.support_ticket (patient_id)',
    slug||'_ticket_patient_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.support_ticket (status)',
    slug||'_ticket_status_idx', slug);

  -- ===========================================================================
  -- PRODUCTS (pharma products discussed during encounters)
  -- keywords TEXT[] enables search and automatic material matching per visit.
  -- ===========================================================================
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.product (
      id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      name        TEXT        NOT NULL,
      code        TEXT        UNIQUE,     -- internal SKU
      category    TEXT,                   -- "device" | "drug" | "supplement"
      description TEXT,
      keywords    TEXT[]      NOT NULL DEFAULT ''{}''::TEXT[],
      is_active   BOOLEAN     NOT NULL DEFAULT true,
      metadata    JSONB,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )', slug);

  -- ===========================================================================
  -- PRESENTATIONS (sales materials / slide decks)
  -- keywords TEXT[] enables search and auto-suggestion during visit planning.
  -- ===========================================================================
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.presentation (
      id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      title         TEXT        NOT NULL,
      product_id    UUID        REFERENCES %I.product(id) ON DELETE SET NULL,
      uploaded_by   UUID        REFERENCES %I.users(id) ON DELETE SET NULL,
      file_url      TEXT        NOT NULL,
      thumbnail_url TEXT,
      locale        TEXT        NOT NULL DEFAULT ''en'',
      keywords      TEXT[]      NOT NULL DEFAULT ''{}''::TEXT[],
      tags          TEXT[]      NOT NULL DEFAULT ''{}''::TEXT[],
      status        TEXT        NOT NULL DEFAULT ''active''
                      CHECK (status IN (''active'', ''archived'', ''draft'')),
      metadata      JSONB,
      deleted_at    TIMESTAMPTZ,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )', slug, slug, slug);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.presentation (product_id) WHERE deleted_at IS NULL',
    slug||'_pres_product_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.presentation (status) WHERE deleted_at IS NULL',
    slug||'_pres_status_idx', slug);
  -- GIN: keyword search for AI presentation picker ("find slides about CPAP compliance")
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.presentation USING gin (keywords)',
    slug||'_pres_keywords_gin', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.product USING gin (keywords)',
    slug||'_product_keywords_gin', slug);

  -- Deferred FKs: product table now exists
  -- treatment_plan.device_product_id → product
  EXECUTE format('ALTER TABLE %I.treatment_plan DROP CONSTRAINT IF EXISTS %I', slug, slug||'_tx_product_fk');
  EXECUTE format('
    ALTER TABLE %I.treatment_plan
      ADD CONSTRAINT %I FOREIGN KEY (device_product_id)
      REFERENCES %I.product(id) ON DELETE SET NULL',
    slug, slug||'_tx_product_fk', slug);

  -- purchase_order_item.product_id → product
  EXECUTE format('ALTER TABLE %I.purchase_order_item DROP CONSTRAINT IF EXISTS %I', slug, slug||'_pitem_product_fk');
  EXECUTE format('
    ALTER TABLE %I.purchase_order_item
      ADD CONSTRAINT %I FOREIGN KEY (product_id)
      REFERENCES %I.product(id) ON DELETE SET NULL',
    slug, slug||'_pitem_product_fk', slug);

  -- ===========================================================================
  -- ENCOUNTERS (rep–HCP interactions + PCF)
  -- FHIR R4: Encounter
  -- Combines old tbl_events + tbl_pcf_responses into one table.
  -- EFPIA: transfer_of_value must be disclosed annually.
  -- next_visit_notes: shown to rep when planning the next visit to this HCP.
  -- ===========================================================================
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.encounter (
      id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id           UUID        NOT NULL REFERENCES %I.users(id) ON DELETE CASCADE,
      practitioner_id   UUID        REFERENCES %I.practitioner(id) ON DELETE SET NULL,
      organization_id   UUID        REFERENCES %I.organization(id) ON DELETE SET NULL,
      -- Classification
      type              TEXT        NOT NULL DEFAULT ''visit''
                          CHECK (type IN (''visit'', ''call'', ''email'', ''congress'', ''webinar'', ''other'')),
      status            TEXT        NOT NULL DEFAULT ''scheduled''
                          CHECK (status IN (''scheduled'', ''completed'', ''cancelled'', ''no_show'')),
      class             TEXT        NOT NULL DEFAULT ''AMB''
                          CHECK (class IN (''AMB'', ''VR'', ''CONF'', ''IMP'')),
      -- Timing
      start_at          TIMESTAMPTZ NOT NULL,
      end_at            TIMESTAMPTZ,
      -- Location
      country_code      TEXT,
      region            TEXT,
      territory_id      UUID        REFERENCES %I.territory(id) ON DELETE SET NULL,
      -- Content
      notes             TEXT,
      next_visit_notes  TEXT,       -- displayed when planning the NEXT visit to this HCP
      attendees         TEXT[]      NOT NULL DEFAULT ''{}''::TEXT[],
      -- PCF fields (Post Call Form — completed after the encounter)
      outcome           TEXT        CHECK (outcome IN (''positive'', ''neutral'', ''negative'', NULL)),
      next_action       TEXT        CHECK (next_action IN (''follow_up_call'', ''next_visit'', ''send_materials'', ''none'', NULL)),
      next_action_at    TIMESTAMPTZ,
      samples_given     BOOLEAN     NOT NULL DEFAULT false,
      samples_notes     TEXT,
      submitted_at      TIMESTAMPTZ,
      -- EFPIA compliance
      transfer_of_value JSONB       NOT NULL DEFAULT ''{}''::JSONB,
      disclosed_at      TIMESTAMPTZ,
      metadata          JSONB,
      deleted_at        TIMESTAMPTZ,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    )', slug, slug, slug, slug, slug);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.encounter (user_id)',
    slug||'_enc_user_idx', slug);
  -- Composite: rep''s visits in chronological order — the most common query pattern
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.encounter (user_id, start_at DESC) WHERE deleted_at IS NULL',
    slug||'_enc_user_start_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.encounter (practitioner_id)',
    slug||'_enc_prac_idx', slug);
  -- Composite: HCP visit history ordered by date
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.encounter (practitioner_id, start_at DESC) WHERE deleted_at IS NULL',
    slug||'_enc_prac_start_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.encounter (territory_id)',
    slug||'_enc_territory_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.encounter (start_at)',
    slug||'_enc_start_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.encounter (status) WHERE deleted_at IS NULL',
    slug||'_enc_status_idx', slug);

  -- encounter_product: which products were discussed/sampled (EFPIA required)
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.encounter_product (
      id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      encounter_id UUID        NOT NULL REFERENCES %I.encounter(id) ON DELETE CASCADE,
      product_id   UUID        NOT NULL REFERENCES %I.product(id) ON DELETE CASCADE,
      discussed    BOOLEAN     NOT NULL DEFAULT true,
      sampled      BOOLEAN     NOT NULL DEFAULT false,
      notes        TEXT,
      metadata     JSONB,
      UNIQUE (encounter_id, product_id)
    )', slug, slug, slug);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.encounter_product (encounter_id)',
    slug||'_encprod_enc_idx', slug);

  -- encounter_presentation: which slide decks were shown
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.encounter_presentation (
      id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      encounter_id    UUID        NOT NULL REFERENCES %I.encounter(id) ON DELETE CASCADE,
      presentation_id UUID        NOT NULL REFERENCES %I.presentation(id) ON DELETE CASCADE,
      opened_at       TIMESTAMPTZ,
      closed_at       TIMESTAMPTZ,
      metadata        JSONB,
      UNIQUE (encounter_id, presentation_id)
    )', slug, slug, slug);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.encounter_presentation (encounter_id)',
    slug||'_encpres_enc_idx', slug);

  -- ===========================================================================
  -- PLANNING & KPIs
  -- ===========================================================================

  -- visit_plan: intended future visits (rep plan or FFM assignment).
  -- Distinct from encounter (which is an actual interaction).
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.visit_plan (
      id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id         UUID        NOT NULL REFERENCES %I.users(id) ON DELETE CASCADE,
      practitioner_id UUID        REFERENCES %I.practitioner(id) ON DELETE SET NULL,
      organization_id UUID        REFERENCES %I.organization(id) ON DELETE SET NULL,
      territory_id    UUID        REFERENCES %I.territory(id) ON DELETE SET NULL,
      planned_at      TIMESTAMPTZ NOT NULL,
      status          TEXT        NOT NULL DEFAULT ''pending''
                        CHECK (status IN (''pending'', ''confirmed'', ''completed'', ''cancelled'')),
      notes           TEXT,
      metadata        JSONB,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )', slug, slug, slug, slug, slug);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.visit_plan (user_id)',
    slug||'_vplan_user_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.visit_plan (planned_at)',
    slug||'_vplan_date_idx', slug);

  -- target: KPI targets set by FFM for reps.
  -- period_type: 'month' (2026-05) | 'quarter' (2026-Q2) | 'year' (2026)
  -- set_by / approved_by enables approval workflow.
  -- metadata is intentionally open for future metric types (financial, coverage maps, etc.)
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.target (
      id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id      UUID          NOT NULL REFERENCES %I.users(id) ON DELETE CASCADE,
      territory_id UUID          REFERENCES %I.territory(id) ON DELETE SET NULL,
      period       TEXT          NOT NULL,     -- e.g. "2026-05", "2026-Q2"
      period_type  TEXT          NOT NULL DEFAULT ''month''
                     CHECK (period_type IN (''month'', ''quarter'', ''year'')),
      metric       TEXT          NOT NULL
                     CHECK (metric IN (''visit_count'', ''coverage_pct'', ''new_hcp'', ''new_lead'', ''samples_given'')),
      value        NUMERIC(10,2) NOT NULL,
      currency     TEXT,                       -- for financial metrics: "PLN", "MXN"
      set_by       UUID          REFERENCES %I.users(id) ON DELETE SET NULL,
      approved_by  UUID          REFERENCES %I.users(id) ON DELETE SET NULL,
      approved_at  TIMESTAMPTZ,
      notes        TEXT,
      metadata     JSONB,         -- open: future metric extensions (heatmaps, weights, etc.)
      created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
      updated_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
      UNIQUE (user_id, territory_id, period, metric)
    )', slug, slug, slug, slug, slug);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.target (user_id, period)',
    slug||'_target_user_period_idx', slug);

  -- ===========================================================================
  -- COMPLIANCE
  -- ===========================================================================

  -- consent: explicit consent records per person (immutable append-only log).
  -- jurisdiction determines which regulation applies:
  --   EU → GDPR Art. 9 (health data = special category)
  --   MX → LFPDPPP (aviso de privacidad + explicit consent)
  --   TH → PDPA (similar to GDPR)
  -- All three require audit trail — this table IS the audit trail for consent.
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.consent (
      id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      entity_type  TEXT        NOT NULL
                     CHECK (entity_type IN (''practitioner'', ''patient'', ''lead'')),
      entity_id    UUID        NOT NULL,
      legal_basis  TEXT        NOT NULL
                     CHECK (legal_basis IN (''consent'', ''legitimate_interest'', ''contract'', ''legal_obligation'')),
      jurisdiction TEXT        NOT NULL,   -- "EU" | "MX" | "TH" | "US"
      purpose      TEXT        NOT NULL,   -- "crm_data" | "marketing" | "clinical_data"
      granted_at   TIMESTAMPTZ,
      withdrawn_at TIMESTAMPTZ,
      expires_at   TIMESTAMPTZ,
      collected_by UUID        REFERENCES %I.users(id) ON DELETE SET NULL,
      metadata     JSONB,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    )', slug, slug);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.consent (entity_type, entity_id)',
    slug||'_consent_entity_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.consent (jurisdiction)',
    slug||'_consent_jurisdiction_idx', slug);

  -- efpia_disclosure: annual transfer-of-value disclosure per HCP per year.
  -- EFPIA Code requires pharma companies to disclose all payments/benefits to HCPs
  -- once a year (in the Czech Republic, Poland, etc. via the EFPIA transparency portal).
  -- This table aggregates encounter.transfer_of_value + event_attendee.cost_allocated
  -- into the annual disclosure record, then tracks submission to the national portal.
  --
  -- total_value = fees_value + travel_value + meals_value + grants_value + other_value
  -- One record per practitioner per year — UNIQUE (practitioner_id, year).
  -- Status flow: draft → approved → disclosed (→ corrected if amendment needed)
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.efpia_disclosure (
      id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
      practitioner_id     UUID          NOT NULL REFERENCES %I.practitioner(id) ON DELETE RESTRICT,
      year                INT           NOT NULL,      -- reporting year, e.g. 2026
      -- Aggregated values (in tenant currency)
      currency            TEXT          NOT NULL DEFAULT ''PLN'',
      total_value         NUMERIC(12,2) NOT NULL DEFAULT 0,
      -- Itemised breakdown required by EFPIA Code Article 23
      fees_value          NUMERIC(12,2) NOT NULL DEFAULT 0,   -- speaker fees, advisory board fees
      travel_value        NUMERIC(12,2) NOT NULL DEFAULT 0,   -- travel & accommodation
      meals_value         NUMERIC(12,2) NOT NULL DEFAULT 0,   -- meals & catering at events
      grants_value        NUMERIC(12,2) NOT NULL DEFAULT 0,   -- research grants, donations
      other_value         NUMERIC(12,2) NOT NULL DEFAULT 0,   -- any other transfer of value
      -- Disclosure tracking
      disclosed_at        TIMESTAMPTZ,                         -- when submitted to portal
      disclosure_method   TEXT,                                -- ''efpia_portal'' | ''national_db'' | ''company_website''
      disclosure_ref      TEXT,                                -- reference number from EFPIA portal
      -- Sign-off workflow
      approved_by         UUID          REFERENCES %I.users(id) ON DELETE SET NULL,
      approved_at         TIMESTAMPTZ,
      status              TEXT          NOT NULL DEFAULT ''draft''
                            CHECK (status IN (''draft'', ''approved'', ''disclosed'', ''corrected'')),
      -- HCP consent to disclosure (required in some markets before publishing)
      hcp_consent_given   BOOLEAN,
      hcp_consent_at      TIMESTAMPTZ,
      notes               TEXT,
      metadata            JSONB,
      created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
      updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
      UNIQUE (practitioner_id, year)   -- one disclosure record per HCP per year
    )', slug, slug, slug);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.efpia_disclosure (practitioner_id)',
    slug||'_efpia_prac_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.efpia_disclosure (year, status)',
    slug||'_efpia_year_status_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.efpia_disclosure (status) WHERE status != ''disclosed''',
    slug||'_efpia_pending_idx', slug);

  -- audit_log: immutable log of all business data mutations (GDPR / EFPIA required).
  -- FHIR R4: AuditEvent
  -- session_id links back to user_session for a complete context chain:
  --   user_session → request_log (what route?) → audit_log (what data changed?)
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.audit_log (
      id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      user_id       UUID        REFERENCES %I.users(id) ON DELETE SET NULL,
      session_id    UUID        REFERENCES %I.user_session(id) ON DELETE SET NULL,
      action        TEXT        NOT NULL,    -- "create" | "update" | "delete" | "read"
      entity_type   TEXT        NOT NULL,    -- FHIR resource name: "Practitioner", "Encounter"
      entity_id     TEXT,
      outcome       TEXT        NOT NULL DEFAULT ''success''
                      CHECK (outcome IN (''success'', ''minor_failure'', ''serious_failure'')),
      entity_before JSONB,
      entity_after  JSONB,
      legal_basis   TEXT,
      jurisdiction  TEXT,
      retain_until  TIMESTAMPTZ,
      user_ip       INET,
      user_agent    TEXT,
      request_id    TEXT,       -- correlates with request_log.request_id
      metadata      JSONB
    )', slug, slug, slug);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.audit_log (created_at)',
    slug||'_audit_created_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.audit_log (user_id)',
    slug||'_audit_user_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.audit_log (entity_type, entity_id)',
    slug||'_audit_entity_idx', slug);

  -- ===========================================================================
  -- MESSAGING (stub — WhatsApp / SMS / Email / in-app chat)
  -- Architecture: conversation (thread) → message (individual message).
  -- channel: "whatsapp" (WhatsApp Business API) | "sms" (Twilio) |
  --          "email" (SMTP) | "in_app" (native chat)
  -- The chat UI should mirror WhatsApp: messages from HCP/patient appear on left,
  -- from rep on right, grouped by conversation thread.
  -- Inbound messages from external channels are synced via webhooks.
  -- ===========================================================================

  -- conversation: a thread between a rep and a contact (practitioner/patient/lead)
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.conversation (
      id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id         UUID        NOT NULL REFERENCES %I.users(id) ON DELETE CASCADE,
      contact_type    TEXT        NOT NULL
                        CHECK (contact_type IN (''practitioner'', ''patient'', ''lead'')),
      contact_id      UUID        NOT NULL,
      channel         TEXT        NOT NULL DEFAULT ''in_app''
                        CHECK (channel IN (''whatsapp'', ''sms'', ''email'', ''in_app'')),
      external_thread_id TEXT,              -- WhatsApp thread ID, email thread, etc.
      last_message_at TIMESTAMPTZ,
      unread_count    INT         NOT NULL DEFAULT 0,
      status          TEXT        NOT NULL DEFAULT ''active''
                        CHECK (status IN (''active'', ''archived'', ''blocked'')),
      metadata        JSONB,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (user_id, contact_type, contact_id, channel)
    )', slug, slug);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.conversation (user_id)',
    slug||'_conv_user_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.conversation (contact_type, contact_id)',
    slug||'_conv_contact_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.conversation (last_message_at)',
    slug||'_conv_last_msg_idx', slug);

  -- Deferred FK: support_ticket.conversation_id → conversation (now exists)
  EXECUTE format('ALTER TABLE %I.support_ticket DROP CONSTRAINT IF EXISTS %I', slug, slug||'_ticket_conv_fk');
  EXECUTE format('
    ALTER TABLE %I.support_ticket
      ADD CONSTRAINT %I FOREIGN KEY (conversation_id)
      REFERENCES %I.conversation(id) ON DELETE CASCADE',
    slug, slug||'_ticket_conv_fk', slug);

  -- message: individual messages within a conversation
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.message (
      id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id UUID        NOT NULL REFERENCES %I.conversation(id) ON DELETE CASCADE,
      sender_type     TEXT        NOT NULL
                        CHECK (sender_type IN (''user'', ''practitioner'', ''patient'', ''lead'', ''system'')),
      sender_id       UUID,                  -- user_id or contact entity id
      body            TEXT,
      media_url       TEXT,                  -- attachment URL (image, doc, voice note)
      media_type      TEXT,                  -- "image" | "document" | "audio" | "video"
      external_msg_id TEXT,                  -- WhatsApp message ID, email Message-ID
      status          TEXT        NOT NULL DEFAULT ''sent''
                        CHECK (status IN (''pending'', ''sent'', ''delivered'', ''read'', ''failed'')),
      sent_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
      delivered_at    TIMESTAMPTZ,
      read_at         TIMESTAMPTZ,
      metadata        JSONB,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )', slug, slug);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.message (conversation_id, sent_at)',
    slug||'_message_conv_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.message (sender_type, sender_id)',
    slug||'_message_sender_idx', slug);

  -- ===========================================================================
  -- NOTIFICATIONS (in-app inbox — bell/badge in the app-bar)
  -- Distinct from messages: notifications = system events (PCF overdue, new HCP),
  -- messages = two-way communication with contacts.
  -- Keyed to identities (not users) so a future practitioner/patient portal can
  -- reuse this same table without a re-migration — see ADR-012. One row per
  -- EVENT, not per channel: read_at means "read in-app". Per-channel dispatch
  -- (email/push/sms) is tracked in notification_delivery below, so a single
  -- event fanned out to 3 channels still shows up once in the bell.
  -- metadata is open for future social media integration.
  -- ===========================================================================
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.notification (
      id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      identity_id UUID        NOT NULL REFERENCES %I.identities(id) ON DELETE CASCADE,
      type        TEXT        NOT NULL,    -- "visit_reminder" | "pcf_overdue" | "new_hcp" | "system"
      title       TEXT        NOT NULL,
      body        TEXT,
      entity_type TEXT,                   -- "encounter" | "practitioner" | "lead"
      entity_id   UUID,
      action_url  TEXT,                   -- deep link: open the relevant screen
      read_at     TIMESTAMPTZ,
      metadata    JSONB,                  -- future: social triggers, A/B test variants
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )', slug, slug);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.notification (identity_id, read_at)',
    slug||'_notif_identity_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.notification (created_at)',
    slug||'_notif_created_idx', slug);

  -- Per-channel delivery log for a notification event (see ADR-012).
  -- The bell UI never reads this — it's the audit/debug trail for "did the
  -- email/push for this event actually go out".
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.notification_delivery (
      id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      notification_id      UUID        NOT NULL REFERENCES %I.notification(id) ON DELETE CASCADE,
      channel              TEXT        NOT NULL CHECK (channel IN (''in_app'', ''push'', ''email'', ''sms'')),
      status               TEXT        NOT NULL DEFAULT ''pending''
                              CHECK (status IN (''pending'', ''sent'', ''delivered'', ''failed'')),
      provider_message_id  TEXT,
      failed_reason        TEXT,
      sent_at              TIMESTAMPTZ,
      delivered_at         TIMESTAMPTZ,
      created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
    )', slug, slug);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.notification_delivery (notification_id)',
    slug||'_notif_delivery_notif_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.notification_delivery (channel, status)',
    slug||'_notif_delivery_channel_idx', slug);

  -- PWA push subscription endpoints per device. `keys` holds the raw Web Push
  -- API subscription object's key pair ({p256dh, auth}) as-is — matches
  -- routes/push.ts, which reads/writes it as one JSONB blob rather than two
  -- separate columns.
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.push_subscription (
      id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    UUID        NOT NULL REFERENCES %I.users(id) ON DELETE CASCADE,
      endpoint   TEXT        NOT NULL UNIQUE,
      keys       JSONB       NOT NULL,
      user_agent TEXT,
      last_used  TIMESTAMPTZ,
      metadata   JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )', slug, slug);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.push_subscription (user_id)',
    slug||'_push_user_idx', slug);

  -- ===========================================================================
  -- FILE ATTACHMENTS
  -- Generic file references for consent docs, encounter attachments, etc.
  -- storage_provider + bucket + path = structured storage address.
  -- is_public: false = signed URL required (default); true = public CDN URL.
  -- expires_at: for signed URLs that must be regenerated after expiry.
  -- ===========================================================================
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.file_attachment (
      id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      entity_type      TEXT        NOT NULL,   -- "encounter" | "consent" | "practitioner"
      entity_id        UUID        NOT NULL,
      url              TEXT        NOT NULL,
      storage_provider TEXT        NOT NULL DEFAULT ''supabase''
                         CHECK (storage_provider IN (''supabase'', ''s3'', ''gcs'', ''azure'')),
      bucket           TEXT,
      path             TEXT,
      filename         TEXT,
      mime_type        TEXT,
      size_bytes       BIGINT,
      is_public        BOOLEAN     NOT NULL DEFAULT false,
      expires_at       TIMESTAMPTZ,             -- when signed URL expires
      uploaded_by      UUID        REFERENCES %I.users(id) ON DELETE SET NULL,
      metadata         JSONB,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
    )', slug, slug);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.file_attachment (entity_type, entity_id)',
    slug||'_attachment_entity_idx', slug);

  -- ===========================================================================
  -- EVENTS (congresses, symposia, hotel galas, product launches, webinars…)
  -- Generic table — works for pharma clients (NeoSleep: congress, symposium)
  -- AND non-pharma clients (FourSeasons: gala, wedding, product_launch).
  -- Distinct from encounter (encounter = 1 rep : 1 HCP; event = 1 event : many attendees).
  -- EFPIA: costs per pharma event must be disclosed annually per HCP attendee.
  --
  -- type is free TEXT backed by platform.lookups (type=''event_type'').
  -- No hard CHECK constraint — each tenant adds its own event types via lookup.
  -- ===========================================================================
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.event (
      id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      title            TEXT        NOT NULL,
      -- type: validated via lookup (type=''event_type''), not a hard CHECK.
      -- NeoSleep examples: ''congress'', ''symposium'', ''dinner'', ''roundtable'', ''webinar'', ''workshop''
      -- FourSeasons examples: ''gala'', ''wedding'', ''product_launch'', ''team_offsite''
      type             TEXT        NOT NULL DEFAULT ''other'',
      organizer        TEXT,
      location         TEXT,
      country_code     TEXT,
      territory_id     UUID        REFERENCES %I.territory(id) ON DELETE SET NULL,
      starts_at        TIMESTAMPTZ NOT NULL,
      ends_at          TIMESTAMPTZ,
      budget_allocated NUMERIC(12,2),
      currency         TEXT        NOT NULL DEFAULT ''PLN'',
      efpia_disclosed_at TIMESTAMPTZ,            -- pharma: date transfers of value were disclosed
      status           TEXT        NOT NULL DEFAULT ''planned''
                         CHECK (status IN (''planned'', ''completed'', ''cancelled'')),
      notes            TEXT,
      metadata         JSONB,
      deleted_at       TIMESTAMPTZ,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
    )', slug, slug);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.event (starts_at)',
    slug||'_event_starts_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.event (status) WHERE deleted_at IS NULL',
    slug||'_event_status_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.event (country_code)',
    slug||'_event_country_idx', slug);

  -- event_attendee: who attended, in what role, and how much it cost.
  -- EFPIA: cost_allocated is the transfer of value that must be disclosed per HCP.
  -- attendee_type is polymorphic: ''practitioner'' (HCP), ''user'' (rep/MSL), ''lead'' (prospect).
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.event_attendee (
      id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id       UUID        NOT NULL REFERENCES %I.event(id) ON DELETE CASCADE,
      -- Polymorphic attendee: practitioner (HCP), user (rep/MSL/staff), lead (prospect)
      attendee_type  TEXT        NOT NULL
                       CHECK (attendee_type IN (''practitioner'', ''user'', ''lead'')),
      attendee_id    UUID        NOT NULL,
      role           TEXT        NOT NULL DEFAULT ''guest''
                       CHECK (role IN (''host'', ''speaker'', ''guest'', ''organizer'')),
      cost_allocated NUMERIC(10,2),             -- individual cost (EFPIA disclosure per HCP)
      currency       TEXT,
      attended       BOOLEAN     NOT NULL DEFAULT true,
      notes          TEXT,
      metadata       JSONB,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (event_id, attendee_type, attendee_id)
    )', slug, slug);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.event_attendee (event_id)',
    slug||'_event_att_event_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.event_attendee (attendee_type, attendee_id)',
    slug||'_event_att_who_idx', slug);

  -- ===========================================================================
  -- SAMPLE MODULE
  -- Full chain: batch received → allocated to rep → given to HCP → returned/expired.
  -- EFPIA: every sample movement must be documented with batch number + expiry date.
  -- encounter_product.sampled=true links the "given to HCP" event to the encounter.
  --
  -- Flow: sample_batch (warehouse) → sample_stock (per rep) ← sample_transaction (ledger)
  --       sample_request: rep asks FFM for more stock
  -- ===========================================================================

  -- sample_batch: a shipment of product samples received from manufacturer.
  -- lot_number = manufacturer batch ID required for EFPIA traceability.
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.sample_batch (
      id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id     UUID        NOT NULL REFERENCES %I.product(id) ON DELETE RESTRICT,
      lot_number     TEXT        NOT NULL,       -- manufacturer batch/lot ID
      quantity_total INT         NOT NULL,       -- units received
      expiry_date    DATE        NOT NULL,
      received_at    DATE        NOT NULL DEFAULT CURRENT_DATE,
      received_by    UUID        REFERENCES %I.users(id) ON DELETE SET NULL,
      notes          TEXT,
      metadata       JSONB,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (product_id, lot_number)
    )', slug, slug, slug);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.sample_batch (product_id)',
    slug||'_sbatch_product_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.sample_batch (expiry_date)',
    slug||'_sbatch_expiry_idx', slug);

  -- sample_stock: current on-hand quantity per rep per product.
  -- Maintained by triggers or app logic from sample_transaction ledger.
  -- Do NOT update directly — always via a sample_transaction row.
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.sample_stock (
      id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     UUID        NOT NULL REFERENCES %I.users(id) ON DELETE CASCADE,
      product_id  UUID        NOT NULL REFERENCES %I.product(id) ON DELETE RESTRICT,
      quantity    INT         NOT NULL DEFAULT 0 CHECK (quantity >= 0),
      metadata    JSONB,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (user_id, product_id)
    )', slug, slug, slug);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.sample_stock (user_id)',
    slug||'_sstock_user_idx', slug);

  -- sample_transaction: immutable ledger of every sample movement.
  -- type values:
  --   received     = new batch allocated to rep from warehouse
  --   given        = given to HCP during encounter (link to encounter_product)
  --   transferred  = rep-to-rep transfer
  --   returned     = returned to warehouse
  --   expired      = destroyed after expiry
  --   damaged      = damaged/lost (must be documented)
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.sample_transaction (
      id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      batch_id           UUID        NOT NULL REFERENCES %I.sample_batch(id) ON DELETE RESTRICT,
      product_id         UUID        NOT NULL REFERENCES %I.product(id) ON DELETE RESTRICT,
      user_id            UUID        NOT NULL REFERENCES %I.users(id) ON DELETE RESTRICT,
      type               TEXT        NOT NULL
                           CHECK (type IN (''received'', ''given'', ''transferred'', ''returned'', ''expired'', ''damaged'')),
      quantity           INT         NOT NULL,   -- positive = in, negative = out
      -- Context (all nullable — depends on type)
      encounter_id       UUID        REFERENCES %I.encounter(id) ON DELETE SET NULL,
      practitioner_id    UUID        REFERENCES %I.practitioner(id) ON DELETE SET NULL,
      to_user_id         UUID        REFERENCES %I.users(id) ON DELETE SET NULL,  -- for transfers
      -- EFPIA documentation
      lot_number         TEXT        NOT NULL,   -- denormalized from batch for immutable audit
      expiry_date        DATE        NOT NULL,   -- denormalized from batch
      notes              TEXT,
      metadata           JSONB,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
    )', slug, slug, slug, slug, slug, slug, slug);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.sample_transaction (user_id, created_at)',
    slug||'_stxn_user_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.sample_transaction (batch_id)',
    slug||'_stxn_batch_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.sample_transaction (encounter_id)',
    slug||'_stxn_encounter_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.sample_transaction (type)',
    slug||'_stxn_type_idx', slug);

  -- sample_request: rep requests more samples from their FFM or admin.
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.sample_request (
      id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      requester_id UUID        NOT NULL REFERENCES %I.users(id) ON DELETE CASCADE,
      product_id   UUID        NOT NULL REFERENCES %I.product(id) ON DELETE RESTRICT,
      quantity     INT         NOT NULL,
      reason       TEXT,
      status       TEXT        NOT NULL DEFAULT ''pending''
                     CHECK (status IN (''pending'', ''approved'', ''rejected'', ''fulfilled'')),
      approved_by  UUID        REFERENCES %I.users(id) ON DELETE SET NULL,
      approved_at  TIMESTAMPTZ,
      fulfilled_at TIMESTAMPTZ,
      notes        TEXT,
      metadata     JSONB,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    )', slug, slug, slug, slug);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.sample_request (requester_id)',
    slug||'_sreq_requester_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.sample_request (status)',
    slug||'_sreq_status_idx', slug);

  -- ===========================================================================
  -- SEGMENTATION
  -- Dynamic or rule-based HCP/patient groups for targeted messaging and AI.
  -- is_dynamic=true → membership refreshed periodically by a worker using criteria.
  -- is_dynamic=false → manually managed list.
  -- ===========================================================================
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.segment (
      id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      name        TEXT        NOT NULL,
      description TEXT,
      entity_type TEXT        NOT NULL DEFAULT ''practitioner''
                    CHECK (entity_type IN (''practitioner'', ''patient'', ''lead'')),
      criteria    JSONB,      -- rule-based filter definition (for dynamic segments)
      is_dynamic  BOOLEAN     NOT NULL DEFAULT false,
      refreshed_at TIMESTAMPTZ,
      created_by  UUID        REFERENCES %I.users(id) ON DELETE SET NULL,
      metadata    JSONB,
      deleted_at  TIMESTAMPTZ,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )', slug, slug);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.segment (entity_type) WHERE deleted_at IS NULL',
    slug||'_segment_type_idx', slug);

  -- segment_member: which entities belong to which segment.
  -- Polymorphic via entity_type + entity_id (no FK enforcement — flexibility over strictness).
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.segment_member (
      segment_id  UUID        NOT NULL REFERENCES %I.segment(id) ON DELETE CASCADE,
      entity_type TEXT        NOT NULL
                    CHECK (entity_type IN (''practitioner'', ''patient'', ''lead'')),
      entity_id   UUID        NOT NULL,
      added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      metadata    JSONB,
      PRIMARY KEY (segment_id, entity_type, entity_id)
    )', slug, slug);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.segment_member (entity_type, entity_id)',
    slug||'_segmember_entity_idx', slug);

  -- ===========================================================================
  -- WEBHOOK EVENTS
  -- Inbound webhook queue: WhatsApp Business, Twilio SMS, email webhooks, etc.
  -- Workers process rows with status=''pending''; failed rows retry with backoff.
  -- Without this table, a crashed BFF loses inbound messages permanently.
  -- ===========================================================================
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.webhook_event (
      id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      source       TEXT        NOT NULL,   -- ''whatsapp'' | ''twilio'' | ''sendgrid'' | ''stripe''
      event_type   TEXT        NOT NULL,   -- ''message.received'' | ''status.delivered'' | etc.
      external_id  TEXT,                   -- provider''s own event ID (for deduplication)
      payload      JSONB       NOT NULL,   -- raw webhook body
      status       TEXT        NOT NULL DEFAULT ''pending''
                     CHECK (status IN (''pending'', ''processing'', ''processed'', ''failed'', ''skipped'')),
      attempts     INT         NOT NULL DEFAULT 0,
      last_error   TEXT,
      processed_at TIMESTAMPTZ,
      metadata     JSONB,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (source, external_id)         -- prevent duplicate processing
    )', slug);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.webhook_event (status, created_at)',
    slug||'_webhook_status_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.webhook_event (source)',
    slug||'_webhook_source_idx', slug);

  -- ===========================================================================
  -- KPI SNAPSHOTS
  -- Pre-computed periodic snapshots for fast dashboard rendering.
  -- Without this, historical trend charts require full table scans.
  -- Written by a nightly/weekly worker; never updated — only inserted.
  -- ===========================================================================
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.kpi_snapshot (
      id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      period       TEXT        NOT NULL,   -- "2026-05" | "2026-W21" | "2026-Q2"
      period_type  TEXT        NOT NULL
                     CHECK (period_type IN (''day'', ''week'', ''month'', ''quarter'', ''year'')),
      scope_type   TEXT        NOT NULL
                     CHECK (scope_type IN (''user'', ''territory'', ''tenant'')),
      scope_id     UUID,                   -- user_id or territory_id; null = tenant-wide
      metric       TEXT        NOT NULL,   -- ''visit_count'' | ''coverage_pct'' | ''new_hcp'' | ''pcf_rate''
      value        NUMERIC(12,4) NOT NULL,
      metadata     JSONB,                  -- breakdown, dimension details
      computed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      -- NOTE: no UNIQUE constraint here — scope_id can be NULL (tenant-wide metrics).
      -- PostgreSQL treats NULL != NULL in UNIQUE constraints so duplicates would slip through.
      -- Uniqueness is enforced by the partial unique index below (after table creation).
    )', slug);

  -- NULL-safe unique index: COALESCE replaces NULL scope_id with a fixed sentinel UUID
  -- so that tenant-wide metrics (scope_id IS NULL) are also deduplicated correctly.
  EXECUTE format(
    'CREATE UNIQUE INDEX IF NOT EXISTS %I ON %I.kpi_snapshot
     (period, period_type, scope_type, COALESCE(scope_id, ''00000000-0000-0000-0000-000000000000''::UUID), metric)',
    slug||'_kpi_unique_idx', slug);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.kpi_snapshot (scope_type, scope_id, period)',
    slug||'_kpi_scope_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.kpi_snapshot (metric, period_type)',
    slug||'_kpi_metric_idx', slug);

  -- ===========================================================================
  -- CONFIGURATION
  -- ===========================================================================

  -- lookup: tenant overrides / custom additions to platform.lookups.
  -- global_id SET  → override label or sort_order of a platform item.
  -- global_id NULL → custom item unique to this tenant.
  -- enabled=false  → hide a non-locked platform item for this tenant.
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.lookup (
      id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      type       TEXT        NOT NULL,
      key        TEXT        NOT NULL,
      locale     TEXT        NOT NULL DEFAULT ''en'',
      value      TEXT        NOT NULL,
      sort_order INT         NOT NULL DEFAULT 0,
      global_id  UUID        REFERENCES platform.lookups(id) ON DELETE SET NULL,
      enabled    BOOLEAN     NOT NULL DEFAULT true,
      metadata   JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (type, key, locale)
    )', slug);

  -- app_config: single-row table — tenant branding, PWA, i18n, integrations.
  -- singleton column enforces exactly one row per tenant schema.
  -- Pattern: INSERT ... ON CONFLICT (singleton) DO UPDATE SET ...
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.app_config (
      id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      singleton            TEXT        NOT NULL DEFAULT ''config'' UNIQUE
                             CHECK (singleton = ''config''),   -- enforces single row
      -- Brand colors (light / dark)
      primary_color        TEXT        NOT NULL DEFAULT ''#1976d2'',
      secondary_color      TEXT        NOT NULL DEFAULT ''#2e7d32'',
      primary_color_dark   TEXT        NOT NULL DEFAULT ''#42a5f5'',
      secondary_color_dark TEXT        NOT NULL DEFAULT ''#66bb6a'',
      surface_color        TEXT        NOT NULL DEFAULT ''#fafafa'',
      surface_color_dark   TEXT        NOT NULL DEFAULT ''#121212'',
      -- Layout
      border_radius        TEXT        NOT NULL DEFAULT ''8px'',
      hero_container_style TEXT        NOT NULL DEFAULT ''compact''
                             CHECK (hero_container_style IN (''compact'', ''wide'')),
      color_scheme         TEXT        NOT NULL DEFAULT ''light''
                             CHECK (color_scheme IN (''light'', ''dark'')),
      -- Identity
      tenant_name          TEXT        NOT NULL DEFAULT ''NeoSleep'',
      logo_url             TEXT,
      logo_dark_url        TEXT,
      icon_url             TEXT,
      icon_dark_url        TEXT,
      font_family          TEXT,
      pwa_theme_color      TEXT,
      -- Locale & regional settings
      default_language     TEXT        NOT NULL DEFAULT ''en'',
      timezone             TEXT        NOT NULL DEFAULT ''UTC'',
      currency             TEXT        NOT NULL DEFAULT ''USD'',
      date_format          TEXT        NOT NULL DEFAULT ''DD/MM/YYYY'',
      -- Legal & support
      support_email        TEXT,
      support_url          TEXT,
      privacy_policy_url   TEXT,
      terms_url            TEXT,
      -- Social & channels (for automated marketing / personalization)
      social_links         JSONB       NOT NULL DEFAULT ''{}''::JSONB,
      -- Notification defaults per channel
      notification_defaults JSONB      NOT NULL DEFAULT ''{}''::JSONB,
      -- Third-party integrations (GA4, Sentry, WhatsApp Business, etc.)
      integrations         JSONB       NOT NULL DEFAULT ''{}''::JSONB,
      -- Catch-all for future config fields without requiring a migration
      metadata             JSONB,
      updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
    )', slug);

  -- i18n_overrides: tenant-specific translation overrides
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.i18n_overrides (
      id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      locale     TEXT        NOT NULL,
      key        TEXT        NOT NULL,
      value      TEXT        NOT NULL,
      metadata   JSONB,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (locale, key)
    )', slug);

  -- ===========================================================================
  -- TRAINING MODULE (onboarding + continuous learning for reps)
  -- Fully automated: courses are pre-built, progress tracked per user.
  -- lesson.type drives the UI:
  --   animation_tour → step-by-step UI walkthrough (config JSON in content_config)
  --   video          → embedded video (content_url)
  --   interactive    → in-app interactive exercise
  --   quiz           → scored assessment
  -- Completion of required courses can be enforced before certain features unlock.
  -- ===========================================================================
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.training_course (
      id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      title         TEXT        NOT NULL,
      description   TEXT,
      required_role TEXT,       -- null = all roles; or ''rep'' | ''ffm'' | ''msl'' etc.
      locale        TEXT        NOT NULL DEFAULT ''en'',
      sort_order    INT         NOT NULL DEFAULT 10,
      is_required   BOOLEAN     NOT NULL DEFAULT false,
      is_active     BOOLEAN     NOT NULL DEFAULT true,
      metadata      JSONB,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )', slug);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.training_course (required_role) WHERE is_active = true',
    slug||'_course_role_idx', slug);

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.training_lesson (
      id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      course_id      UUID        NOT NULL REFERENCES %I.training_course(id) ON DELETE CASCADE,
      title          TEXT        NOT NULL,
      type           TEXT        NOT NULL DEFAULT ''video''
                       CHECK (type IN (''animation_tour'', ''video'', ''interactive'', ''quiz'')),
      -- Content: one of these is set depending on type
      content_url    TEXT,       -- video URL or external resource
      content_config JSONB,      -- animation_tour step config, quiz questions, etc.
      duration_sec   INT,        -- estimated completion time in seconds
      sort_order     INT         NOT NULL DEFAULT 10,
      is_active      BOOLEAN     NOT NULL DEFAULT true,
      metadata       JSONB,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    )', slug, slug);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.training_lesson (course_id, sort_order)',
    slug||'_lesson_course_idx', slug);

  -- training_progress: one row per user per lesson.
  -- score: for quiz lessons (0–100). NULL for non-quiz lessons.
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.training_progress (
      id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id      UUID        NOT NULL REFERENCES %I.users(id) ON DELETE CASCADE,
      lesson_id    UUID        NOT NULL REFERENCES %I.training_lesson(id) ON DELETE CASCADE,
      status       TEXT        NOT NULL DEFAULT ''not_started''
                     CHECK (status IN (''not_started'', ''in_progress'', ''completed'')),
      score        INT         CHECK (score BETWEEN 0 AND 100),
      started_at   TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      metadata     JSONB,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (user_id, lesson_id)
    )', slug, slug, slug);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.training_progress (user_id, status)',
    slug||'_progress_user_idx', slug);

  -- ===========================================================================
  -- AI INSIGHTS
  -- Per-entity AI-generated recommendations, scores and predictions.
  -- Refreshed periodically by a background worker (not real-time).
  -- expires_at: when this insight should be recalculated — stale insights are
  -- still readable but flagged. Worker uses this to prioritise refresh queue.
  --
  -- metric examples:
  --   receptivity_score   → 0.0–1.0, predicted HCP openness to a visit
  --   next_best_action    → "visit_now" | "send_materials" | "let_rest"
  --   churn_risk          → 0.0–1.0, probability of HCP going cold
  --   visit_frequency     → recommended days between visits
  --   pre_visit_brief     → AI-generated text summary for rep before visit
  -- ===========================================================================
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.ai_insight (
      id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      -- Target entity (polymorphic — practitioner, patient, user/rep)
      entity_type  TEXT        NOT NULL
                     CHECK (entity_type IN (''practitioner'', ''patient'', ''user'')),
      entity_id    UUID        NOT NULL,
      -- Insight
      metric       TEXT        NOT NULL,   -- see examples above
      value        JSONB       NOT NULL,   -- flexible: number, string, structured object
      confidence   NUMERIC(4,3),           -- model confidence 0.000–1.000
      model        TEXT,                   -- model/version that produced this
      -- Freshness
      computed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at   TIMESTAMPTZ,
      is_stale     BOOLEAN     NOT NULL DEFAULT false,
      metadata     JSONB,
      UNIQUE (entity_type, entity_id, metric)
    )', slug);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.ai_insight (entity_type, entity_id)',
    slug||'_ai_insight_entity_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.ai_insight (expires_at) WHERE is_stale = false',
    slug||'_ai_insight_expires_idx', slug);

  -- ai_generation_log: audit trail for every piece of AI-generated content.
  -- Required for EFPIA ("on what basis did AI suggest this visit?"),
  -- cost tracking (tokens used per model), and debugging.
  -- input_summary: non-sensitive summary of what data went in (NOT raw patient data).
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.ai_generation_log (
      id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      -- Who triggered it
      user_id         UUID        REFERENCES %I.users(id) ON DELETE SET NULL,
      -- What it generated
      feature         TEXT        NOT NULL,  -- ''pre_visit_brief'' | ''pcf_assist'' | ''coaching'' | ''efpia_report''
      entity_type     TEXT,                  -- ''practitioner'' | ''encounter'' | ''patient''
      entity_id       UUID,
      -- AI details
      model           TEXT        NOT NULL,  -- ''gpt-4o'' | ''claude-3-5-sonnet'' | ''whisper''
      prompt_tokens   INT,
      completion_tokens INT,
      total_tokens    INT,
      -- Content (store output for debugging — redact PII before storing)
      input_summary   TEXT,                  -- non-sensitive description of input context
      output          TEXT,                  -- generated text (voice transcript, PCF draft, etc.)
      -- Quality
      accepted        BOOLEAN,               -- did user accept / reject the AI output?
      feedback        TEXT,                  -- optional rep feedback
      -- Cost tracking
      cost_usd        NUMERIC(10,6),         -- estimated cost in USD
      latency_ms      INT,
      metadata        JSONB,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )', slug, slug);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.ai_generation_log (user_id, created_at)',
    slug||'_ai_log_user_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.ai_generation_log (feature)',
    slug||'_ai_log_feature_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.ai_generation_log (entity_type, entity_id)',
    slug||'_ai_log_entity_idx', slug);

  -- ===========================================================================
  -- OFFLINE SYNC QUEUE (PWA background sync)
  -- When a rep is offline (no signal in hospital/clinic), the PWA stores
  -- mutations locally in IndexedDB and queues them here via Background Sync API
  -- once connectivity returns.
  --
  -- This table is the server-side view of pending/processed client mutations.
  -- It enables: conflict detection, cross-device sync, debugging sync failures.
  --
  -- Short retention: rows older than 7 days after processed_at are deleted
  -- by a nightly worker. No compliance value after sync is confirmed.
  -- ===========================================================================
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.sync_queue (
      id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id      UUID        NOT NULL REFERENCES %I.users(id) ON DELETE CASCADE,
      device_id    TEXT        NOT NULL,   -- client device fingerprint (from PWA)
      -- What needs to sync
      entity_type  TEXT        NOT NULL,   -- ''encounter'' | ''practitioner'' | ''lead''
      entity_id    UUID,                   -- null if new record (client_temp_id used instead)
      client_temp_id TEXT,                 -- client-generated ID for new records before server assigns UUID
      operation    TEXT        NOT NULL
                     CHECK (operation IN (''create'', ''update'', ''delete'')),
      payload      JSONB       NOT NULL,   -- the mutation data
      -- Conflict resolution
      client_updated_at TIMESTAMPTZ NOT NULL, -- client''s local timestamp of the change
      conflict     BOOLEAN     NOT NULL DEFAULT false,
      conflict_detail JSONB,               -- what conflicted and how it was resolved
      -- Lifecycle
      status       TEXT        NOT NULL DEFAULT ''pending''
                     CHECK (status IN (''pending'', ''processing'', ''applied'', ''conflict'', ''failed'')),
      attempts     INT         NOT NULL DEFAULT 0,
      last_error   TEXT,
      processed_at TIMESTAMPTZ,
      metadata     JSONB,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    )', slug, slug);

  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.sync_queue (user_id, status)',
    slug||'_sync_user_idx', slug);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.sync_queue (status, created_at)',
    slug||'_sync_status_idx', slug);

  -- ===========================================================================
  -- ENCOUNTER EXTENSIONS (columns added via ALTER TABLE)
  -- These extend existing tables with new capabilities without restructuring them.
  --
  -- voice_note_url: rep records voice after visit → AI transcribes → PCF draft.
  --   File stored in object storage (Supabase Storage), URL stored here.
  --
  -- checkin_location: GPS coordinates captured when rep checks in at HCP location.
  --   Stored as {lat, lng, accuracy_meters} — no PostGIS dependency needed.
  --   FFM can verify rep was physically present. EFPIA compliance for field visits.
  --
  -- encounter_presentation.slide_views: CLM (Closed Loop Marketing).
  --   Tracks which slides HCP viewed and for how long.
  --   Format: [{"slide": 3, "duration_sec": 45}, {"slide": 7, "duration_sec": 12}]
  --   Marketing team gets real engagement data, not just "presentation was shown".
  --
  -- sample_transaction.signature_url: HCP signs sample receipt on rep''s phone screen.
  --   Stored as image URL. EFPIA hard requirement in many markets.
  -- ===========================================================================
  EXECUTE format('ALTER TABLE %I.encounter ADD COLUMN IF NOT EXISTS voice_note_url TEXT', slug);
  EXECUTE format('ALTER TABLE %I.encounter ADD COLUMN IF NOT EXISTS checkin_location JSONB', slug);
  EXECUTE format('ALTER TABLE %I.encounter_presentation ADD COLUMN IF NOT EXISTS slide_views JSONB', slug);
  EXECUTE format('ALTER TABLE %I.sample_transaction ADD COLUMN IF NOT EXISTS signature_url TEXT', slug);

  -- Deferred FK: treatment_plan.device_purchase_order_id → purchase_order
  -- (purchase_order table is created after treatment_plan, so FK is added here)
  EXECUTE format('ALTER TABLE %I.treatment_plan DROP CONSTRAINT IF EXISTS %I', slug, slug||'_tx_purchase_order_fk');
  EXECUTE format('
    ALTER TABLE %I.treatment_plan
      ADD CONSTRAINT %I FOREIGN KEY (device_purchase_order_id)
      REFERENCES %I.purchase_order(id) ON DELETE SET NULL',
    slug, slug||'_tx_purchase_order_fk', slug);

END;
$$;

-- =============================================================================
-- Provision NeoSleep (one schema, all countries: PL + MX + future TH)
-- =============================================================================
SELECT create_tenant_schema('neosleep');
