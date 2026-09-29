-- =============================================================================
-- Migration 030: clinical questionnaires as dated studies + patient self-fill
--
-- NEO-36 rework (docs/stories/neo-36-rework-estudios-pdf-qr.md, ADR-023).
--
-- 1. endo_intake (026: ONE row per patient, upserted — every save overwrote
--    the previous answers) is split into two APPEND-ONLY tables, one row per
--    fill, so the patient's clinical history is kept and each fill is its
--    own dated entry in the Estudios list:
--      - medical_history_questionnaire — "Antecedentes Médicos", patient-
--        reported; can be filled by staff OR by the patient themselves via a
--        QR link (source = 'patient', recorded_by NULL)
--      - oral_exam — "Exploración de Cavidad Oral", dentist-recorded only
--    Existing endo_intake rows are copied over (source 'staff'); endo_intake
--    itself is left in place, unused, to be dropped by a later migration
--    once the copy is verified on dev and prod.
--
-- 2. questionnaire_request — a single-use, expiring link a doctor hands a
--    patient (as a QR code) to self-fill a questionnaire without an account.
--    Only the SHA-256 of the token is stored (utils/hashToken.ts), same
--    convention as password_reset_tokens / magic_link_tokens. A dedicated
--    table rather than magic_link_tokens: it carries a kind and a lifecycle
--    (pending → used / cancelled / expired) that the doctor's Estudios list
--    shows.
--
-- 3. stop_bang_screening — the patient can now answer S-T-O-P (snoring,
--    tiredness, observed apnea, pressure) themselves; the doctor completes
--    B-A-N-G (BMI, age, neck, sex) afterwards. So B-A-N-G become nullable and
--    `score` is NULL until all eight answers exist. Postgres 15 can't change
--    a generated column's expression in place, so score is dropped and
--    re-added (existing rows are recomputed — identical values, all eight
--    answers were NOT NULL until now).
--
-- New tables are added in two places, as 027 requires: the loop below for
-- existing tenants, and create_tenant_schema() (regenerated at the bottom via
-- scripts/generate-create-tenant-schema.ts) for tenants provisioned later.
-- CI's check-tenant-schema-parity verifies the two agree.
--
-- ROLLBACK (manual):
--   DROP TABLE <schema>.medical_history_questionnaire, <schema>.oral_exam,
--              <schema>.questionnaire_request CASCADE;
--   ALTER TABLE <schema>.stop_bang_screening DROP COLUMN source,
--     DROP COLUMN request_id, DROP COLUMN consent_accepted_at,
--     DROP COLUMN consent_version, DROP COLUMN updated_at;
--   (then restore B-A-N-G NOT NULL + the 026 score expression)
--   and re-run 027's create_tenant_schema() body.
-- =============================================================================

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT db_schema FROM platform.tenants LOOP

    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.questionnaire_request (
        id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        patient_id    UUID        NOT NULL REFERENCES %I.patient(id) ON DELETE CASCADE,
        kind          TEXT        NOT NULL CHECK (kind IN (''medical_history'', ''stop_bang'')),
        token_hash    TEXT        NOT NULL UNIQUE,
        expires_at    TIMESTAMPTZ NOT NULL,
        used_at       TIMESTAMPTZ,
        cancelled_at  TIMESTAMPTZ,
        created_by    UUID        REFERENCES %I.users(id) ON DELETE SET NULL,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      )', r.db_schema, r.db_schema, r.db_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.questionnaire_request (patient_id)',
      'questionnaire_request_patient_idx', r.db_schema);

    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.medical_history_questionnaire (
        id                         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        patient_id                 UUID        NOT NULL REFERENCES %I.patient(id) ON DELETE CASCADE,
        source                     TEXT        NOT NULL DEFAULT ''staff'' CHECK (source IN (''staff'', ''patient'')),
        -- The staff user who entered it; NULL when the patient self-filled.
        recorded_by                UUID        REFERENCES %I.users(id) ON DELETE SET NULL,
        request_id                 UUID        REFERENCES %I.questionnaire_request(id) ON DELETE SET NULL,
        has_anemia                 BOOLEAN,
        has_diabetes               BOOLEAN,
        has_smoking                BOOLEAN,
        has_endocrine_disorder     BOOLEAN,
        has_sinusitis              BOOLEAN,
        has_alcoholism             BOOLEAN,
        has_hypertension           BOOLEAN,
        has_hepatitis              BOOLEAN,
        has_cancer                 BOOLEAN,
        has_addictions             BOOLEAN,
        has_heart_disease          BOOLEAN,
        has_kidney_disease         BOOLEAN,
        has_hiv                    BOOLEAN,
        has_neurological_disorder  BOOLEAN,
        medical_history_other      TEXT,
        -- Health-data consent the patient accepted on the self-fill page (GDPR Art.9).
        consent_accepted_at        TIMESTAMPTZ,
        consent_version            TEXT,
        created_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
      )', r.db_schema, r.db_schema, r.db_schema, r.db_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.medical_history_questionnaire (patient_id)',
      'medical_history_questionnaire_patient_idx', r.db_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.medical_history_questionnaire (recorded_by)',
      'medical_history_questionnaire_recorder_idx', r.db_schema);

    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.oral_exam (
        id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        patient_id               UUID        NOT NULL REFERENCES %I.patient(id) ON DELETE CASCADE,
        recorded_by              UUID        REFERENCES %I.users(id) ON DELETE SET NULL,
        has_bruxism              BOOLEAN,
        has_narrow_palate        BOOLEAN,
        has_geographic_tongue    BOOLEAN,
        has_xerostomia           BOOLEAN,
        skeletal_class           TEXT        CHECK (skeletal_class IN (''I'', ''II'', ''III'')),
        is_mouth_breather        BOOLEAN,
        has_missing_teeth        BOOLEAN,
        has_periodontal_disease  BOOLEAN,
        has_tmj_finding          BOOLEAN,
        tooth                    TEXT,
        created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
      )', r.db_schema, r.db_schema, r.db_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.oral_exam (patient_id)',
      'oral_exam_patient_idx', r.db_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.oral_exam (recorded_by)',
      'oral_exam_recorder_idx', r.db_schema);

    -- STOP-Bang: patient answers S-T-O-P, doctor completes B-A-N-G.
    EXECUTE format('ALTER TABLE %I.stop_bang_screening
        ALTER COLUMN bmi_over_35 DROP NOT NULL,
        ALTER COLUMN age_over_50 DROP NOT NULL,
        ALTER COLUMN neck_circumference_over_40cm DROP NOT NULL,
        ALTER COLUMN is_male DROP NOT NULL,
        ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT ''staff'' CHECK (source IN (''staff'', ''patient'')),
        ADD COLUMN IF NOT EXISTS request_id UUID REFERENCES %I.questionnaire_request(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS consent_accepted_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS consent_version TEXT,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now()',
      r.db_schema, r.db_schema);
    EXECUTE format('ALTER TABLE %I.stop_bang_screening DROP COLUMN IF EXISTS score', r.db_schema);
    EXECUTE format('ALTER TABLE %I.stop_bang_screening ADD COLUMN score INTEGER GENERATED ALWAYS AS (
        CASE WHEN bmi_over_35 IS NULL OR age_over_50 IS NULL OR neck_circumference_over_40cm IS NULL OR is_male IS NULL
          THEN NULL
          ELSE snoring::int + tiredness::int + observed_apnea::int + pressure::int +
               bmi_over_35::int + age_over_50::int + neck_circumference_over_40cm::int + is_male::int
        END) STORED', r.db_schema);

    -- Carry existing endo_intake answers over, one dated row each, only
    -- where that half of the form was actually answered.
    EXECUTE format('
      INSERT INTO %I.medical_history_questionnaire (
        patient_id, source, recorded_by,
        has_anemia, has_diabetes, has_smoking, has_endocrine_disorder, has_sinusitis, has_alcoholism,
        has_hypertension, has_hepatitis, has_cancer, has_addictions, has_heart_disease,
        has_kidney_disease, has_hiv, has_neurological_disorder, medical_history_other, created_at)
      SELECT patient_id, ''staff'', recorded_by,
        has_anemia, has_diabetes, has_smoking, has_endocrine_disorder, has_sinusitis, has_alcoholism,
        has_hypertension, has_hepatitis, has_cancer, has_addictions, has_heart_disease,
        has_kidney_disease, has_hiv, has_neurological_disorder, medical_history_other, updated_at
      FROM %I.endo_intake e
      WHERE e.deleted_at IS NULL
        AND num_nonnulls(has_anemia, has_diabetes, has_smoking, has_endocrine_disorder, has_sinusitis,
              has_alcoholism, has_hypertension, has_hepatitis, has_cancer, has_addictions,
              has_heart_disease, has_kidney_disease, has_hiv, has_neurological_disorder,
              NULLIF(medical_history_other, '''')) > 0
        AND NOT EXISTS (SELECT 1 FROM %I.medical_history_questionnaire m WHERE m.patient_id = e.patient_id)',
      r.db_schema, r.db_schema, r.db_schema);

    EXECUTE format('
      INSERT INTO %I.oral_exam (
        patient_id, recorded_by, has_bruxism, has_narrow_palate, has_geographic_tongue, has_xerostomia,
        skeletal_class, is_mouth_breather, has_missing_teeth, has_periodontal_disease, has_tmj_finding, created_at)
      SELECT patient_id, recorded_by, has_bruxism, has_narrow_palate, has_geographic_tongue, has_xerostomia,
        skeletal_class, is_mouth_breather, has_missing_teeth, has_periodontal_disease, has_tmj_finding, updated_at
      FROM %I.endo_intake e
      WHERE e.deleted_at IS NULL
        AND num_nonnulls(has_bruxism, has_narrow_palate, has_geographic_tongue, has_xerostomia, skeletal_class,
              is_mouth_breather, has_missing_teeth, has_periodontal_disease, has_tmj_finding) > 0
        AND NOT EXISTS (SELECT 1 FROM %I.oral_exam o WHERE o.patient_id = e.patient_id)',
      r.db_schema, r.db_schema, r.db_schema);

  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- create_tenant_schema() for tenants provisioned from now on — generated by
-- scripts/generate-create-tenant-schema.ts against a from-scratch postgres:15
-- with migrations 000-030 (part above) applied. Do not hand-edit; regenerate.
-- -----------------------------------------------------------------------------

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
  -- Same convention as apps/api/src/db/tenant.ts's withTenant(): transaction-
  -- scoped, so it never leaks into whatever the caller runs afterward.
  EXECUTE format('SET LOCAL search_path TO %I, public, extensions', slug);

  -- Phase 1: tables + indexes (IF NOT EXISTS — safe to re-run as-is)
  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS ai_generation_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    feature text NOT NULL,
    entity_type text,
    entity_id uuid,
    model text NOT NULL,
    prompt_tokens integer,
    completion_tokens integer,
    total_tokens integer,
    input_summary text,
    output text,
    accepted boolean,
    feedback text,
    cost_usd numeric(10,6),
    latency_ms integer,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS ai_insight (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    metric text NOT NULL,
    value jsonb NOT NULL,
    confidence numeric(4,3),
    model text,
    computed_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    is_stale boolean DEFAULT false NOT NULL,
    metadata jsonb,
    CONSTRAINT ai_insight_entity_type_check CHECK ((entity_type = ANY (ARRAY['practitioner'::text, 'patient'::text, 'user'::text])))
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS app_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    singleton text DEFAULT 'config'::text NOT NULL,
    primary_color text DEFAULT '#1976d2'::text NOT NULL,
    secondary_color text DEFAULT '#2e7d32'::text NOT NULL,
    primary_color_dark text DEFAULT '#42a5f5'::text NOT NULL,
    secondary_color_dark text DEFAULT '#66bb6a'::text NOT NULL,
    surface_color text DEFAULT '#fafafa'::text NOT NULL,
    surface_color_dark text DEFAULT '#121212'::text NOT NULL,
    border_radius text DEFAULT '8px'::text NOT NULL,
    hero_container_style text DEFAULT 'compact'::text NOT NULL,
    color_scheme text DEFAULT 'light'::text NOT NULL,
    tenant_name text DEFAULT 'NeoSleep'::text NOT NULL,
    logo_url text,
    logo_dark_url text,
    icon_url text,
    icon_dark_url text,
    font_family text,
    pwa_theme_color text,
    default_language text DEFAULT 'en'::text NOT NULL,
    timezone text DEFAULT 'UTC'::text NOT NULL,
    currency text DEFAULT 'USD'::text NOT NULL,
    date_format text DEFAULT 'DD/MM/YYYY'::text NOT NULL,
    support_email text,
    support_url text,
    privacy_policy_url text,
    terms_url text,
    social_links jsonb DEFAULT '{}'::jsonb NOT NULL,
    notification_defaults jsonb DEFAULT '{}'::jsonb NOT NULL,
    integrations jsonb DEFAULT '{}'::jsonb NOT NULL,
    metadata jsonb,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT app_config_color_scheme_check CHECK ((color_scheme = ANY (ARRAY['light'::text, 'dark'::text]))),
    CONSTRAINT app_config_hero_container_style_check CHECK ((hero_container_style = ANY (ARRAY['compact'::text, 'wide'::text]))),
    CONSTRAINT app_config_singleton_check CHECK ((singleton = 'config'::text))
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid,
    session_id uuid,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id text,
    outcome text DEFAULT 'success'::text NOT NULL,
    entity_before jsonb,
    entity_after jsonb,
    legal_basis text,
    jurisdiction text,
    retain_until timestamp with time zone,
    user_ip inet,
    user_agent text,
    request_id text,
    metadata jsonb,
    CONSTRAINT audit_log_outcome_check CHECK ((outcome = ANY (ARRAY['success'::text, 'minor_failure'::text, 'serious_failure'::text])))
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS consent (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    legal_basis text NOT NULL,
    jurisdiction text NOT NULL,
    purpose text NOT NULL,
    granted_at timestamp with time zone,
    withdrawn_at timestamp with time zone,
    expires_at timestamp with time zone,
    collected_by uuid,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT consent_entity_type_check CHECK ((entity_type = ANY (ARRAY['practitioner'::text, 'patient'::text, 'lead'::text, 'user'::text]))),
    CONSTRAINT consent_legal_basis_check CHECK ((legal_basis = ANY (ARRAY['consent'::text, 'legitimate_interest'::text, 'contract'::text, 'legal_obligation'::text])))
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS conversation (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    contact_type text NOT NULL,
    contact_id uuid NOT NULL,
    channel text DEFAULT 'in_app'::text NOT NULL,
    external_thread_id text,
    last_message_at timestamp with time zone,
    unread_count integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT conversation_channel_check CHECK ((channel = ANY (ARRAY['whatsapp'::text, 'sms'::text, 'email'::text, 'in_app'::text]))),
    CONSTRAINT conversation_contact_type_check CHECK ((contact_type = ANY (ARRAY['practitioner'::text, 'patient'::text, 'lead'::text]))),
    CONSTRAINT conversation_status_check CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text, 'blocked'::text])))
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS efpia_disclosure (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    practitioner_id uuid NOT NULL,
    year integer NOT NULL,
    currency text DEFAULT 'PLN'::text NOT NULL,
    total_value numeric(12,2) DEFAULT 0 NOT NULL,
    fees_value numeric(12,2) DEFAULT 0 NOT NULL,
    travel_value numeric(12,2) DEFAULT 0 NOT NULL,
    meals_value numeric(12,2) DEFAULT 0 NOT NULL,
    grants_value numeric(12,2) DEFAULT 0 NOT NULL,
    other_value numeric(12,2) DEFAULT 0 NOT NULL,
    disclosed_at timestamp with time zone,
    disclosure_method text,
    disclosure_ref text,
    approved_by uuid,
    approved_at timestamp with time zone,
    status text DEFAULT 'draft'::text NOT NULL,
    hcp_consent_given boolean,
    hcp_consent_at timestamp with time zone,
    notes text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT efpia_disclosure_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'approved'::text, 'disclosed'::text, 'corrected'::text])))
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS encounter (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    practitioner_id uuid,
    organization_id uuid,
    type text DEFAULT 'visit'::text NOT NULL,
    status text DEFAULT 'scheduled'::text NOT NULL,
    class text DEFAULT 'AMB'::text NOT NULL,
    start_at timestamp with time zone NOT NULL,
    end_at timestamp with time zone,
    country_code text,
    region text,
    territory_id uuid,
    notes text,
    next_visit_notes text,
    attendees text[] DEFAULT '{}'::text[] NOT NULL,
    outcome text,
    next_action text,
    next_action_at timestamp with time zone,
    samples_given boolean DEFAULT false NOT NULL,
    samples_notes text,
    submitted_at timestamp with time zone,
    transfer_of_value jsonb DEFAULT '{}'::jsonb NOT NULL,
    disclosed_at timestamp with time zone,
    metadata jsonb,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    voice_note_url text,
    checkin_location jsonb,
    CONSTRAINT encounter_class_check CHECK ((class = ANY (ARRAY['AMB'::text, 'VR'::text, 'CONF'::text, 'IMP'::text]))),
    CONSTRAINT encounter_next_action_check CHECK ((next_action = ANY (ARRAY['follow_up_call'::text, 'next_visit'::text, 'send_materials'::text, 'none'::text, NULL::text]))),
    CONSTRAINT encounter_outcome_check CHECK ((outcome = ANY (ARRAY['positive'::text, 'neutral'::text, 'negative'::text, NULL::text]))),
    CONSTRAINT encounter_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'completed'::text, 'cancelled'::text, 'no_show'::text]))),
    CONSTRAINT encounter_type_check CHECK ((type = ANY (ARRAY['visit'::text, 'call'::text, 'email'::text, 'congress'::text, 'webinar'::text, 'other'::text])))
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS encounter_presentation (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    encounter_id uuid NOT NULL,
    presentation_id uuid NOT NULL,
    opened_at timestamp with time zone,
    closed_at timestamp with time zone,
    metadata jsonb,
    slide_views jsonb
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS encounter_product (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    encounter_id uuid NOT NULL,
    product_id uuid NOT NULL,
    discussed boolean DEFAULT true NOT NULL,
    sampled boolean DEFAULT false NOT NULL,
    notes text,
    metadata jsonb
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS endo_intake (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    recorded_by uuid,
    has_anemia boolean,
    has_diabetes boolean,
    has_smoking boolean,
    has_endocrine_disorder boolean,
    has_sinusitis boolean,
    has_alcoholism boolean,
    has_hypertension boolean,
    has_hepatitis boolean,
    has_cancer boolean,
    has_addictions boolean,
    has_heart_disease boolean,
    has_kidney_disease boolean,
    has_hiv boolean,
    has_neurological_disorder boolean,
    medical_history_other text,
    has_bruxism boolean,
    has_narrow_palate boolean,
    has_geographic_tongue boolean,
    has_xerostomia boolean,
    skeletal_class text,
    is_mouth_breather boolean,
    has_missing_teeth boolean,
    has_periodontal_disease boolean,
    has_tmj_finding boolean,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT endo_intake_skeletal_class_check CHECK ((skeletal_class = ANY (ARRAY['I'::text, 'II'::text, 'III'::text])))
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS event (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    type text DEFAULT 'other'::text NOT NULL,
    organizer text,
    location text,
    country_code text,
    territory_id uuid,
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone,
    budget_allocated numeric(12,2),
    currency text DEFAULT 'PLN'::text NOT NULL,
    efpia_disclosed_at timestamp with time zone,
    status text DEFAULT 'planned'::text NOT NULL,
    notes text,
    metadata jsonb,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT event_status_check CHECK ((status = ANY (ARRAY['planned'::text, 'completed'::text, 'cancelled'::text])))
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS event_attendee (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    attendee_type text NOT NULL,
    attendee_id uuid NOT NULL,
    role text DEFAULT 'guest'::text NOT NULL,
    cost_allocated numeric(10,2),
    currency text,
    attended boolean DEFAULT true NOT NULL,
    notes text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT event_attendee_attendee_type_check CHECK ((attendee_type = ANY (ARRAY['practitioner'::text, 'user'::text, 'lead'::text]))),
    CONSTRAINT event_attendee_role_check CHECK ((role = ANY (ARRAY['host'::text, 'speaker'::text, 'guest'::text, 'organizer'::text])))
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS file_attachment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    url text NOT NULL,
    storage_provider text DEFAULT 'supabase'::text NOT NULL,
    bucket text,
    path text,
    filename text,
    mime_type text,
    size_bytes bigint,
    is_public boolean DEFAULT false NOT NULL,
    expires_at timestamp with time zone,
    uploaded_by uuid,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT file_attachment_storage_provider_check CHECK ((storage_provider = ANY (ARRAY['supabase'::text, 's3'::text, 'gcs'::text, 'azure'::text])))
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS i18n_overrides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    locale text NOT NULL,
    key text NOT NULL,
    value text NOT NULL,
    metadata jsonb,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS identities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text,
    first_name text,
    last_name text,
    preferred_name text,
    email text,
    phone text,
    social_links jsonb DEFAULT '{}'::jsonb NOT NULL,
    date_of_birth date,
    gender text,
    language text DEFAULT 'en'::text NOT NULL,
    timezone text DEFAULT 'UTC'::text NOT NULL,
    avatar_url text,
    notes text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    territory_id uuid,
    region text,
    country_code text,
    CONSTRAINT identities_gender_check CHECK ((gender = ANY (ARRAY['male'::text, 'female'::text, 'other'::text, 'prefer_not_to_say'::text, NULL::text])))
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS invite_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    lead_id uuid,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_by uuid,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS kpi_snapshot (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    period text NOT NULL,
    period_type text NOT NULL,
    scope_type text NOT NULL,
    scope_id uuid,
    metric text NOT NULL,
    value numeric(12,4) NOT NULL,
    metadata jsonb,
    computed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT kpi_snapshot_period_type_check CHECK ((period_type = ANY (ARRAY['day'::text, 'week'::text, 'month'::text, 'quarter'::text, 'year'::text]))),
    CONSTRAINT kpi_snapshot_scope_type_check CHECK ((scope_type = ANY (ARRAY['user'::text, 'territory'::text, 'tenant'::text])))
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS lead (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    identity_id uuid NOT NULL,
    source text,
    status text DEFAULT 'new'::text NOT NULL,
    assigned_to uuid,
    converted_to_id uuid,
    converted_to_type text,
    converted_at timestamp with time zone,
    metadata jsonb,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    institution text,
    type text DEFAULT 'other'::text NOT NULL,
    CONSTRAINT lead_converted_to_type_check CHECK ((converted_to_type = ANY (ARRAY['practitioner'::text, 'organization'::text, 'patient'::text, 'user'::text, NULL::text]))),
    CONSTRAINT lead_status_check CHECK ((status = ANY (ARRAY['new'::text, 'contacted'::text, 'follow_up_needed'::text, 'meeting_scheduled'::text, 'declined'::text, 'qualified'::text, 'inactive'::text, 'converted'::text]))),
    CONSTRAINT lead_type_check CHECK ((type = ANY (ARRAY['doctor'::text, 'hospital'::text, 'pharmacy'::text, 'patient'::text, 'other'::text])))
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS lookup (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type text NOT NULL,
    key text NOT NULL,
    locale text DEFAULT 'en'::text NOT NULL,
    value text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    global_id uuid,
    enabled boolean DEFAULT true NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS magic_link_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT magic_link_tokens_entity_type_check CHECK ((entity_type = ANY (ARRAY['practitioner'::text, 'patient'::text])))
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS medical_history_questionnaire (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    source text DEFAULT 'staff'::text NOT NULL,
    recorded_by uuid,
    request_id uuid,
    has_anemia boolean,
    has_diabetes boolean,
    has_smoking boolean,
    has_endocrine_disorder boolean,
    has_sinusitis boolean,
    has_alcoholism boolean,
    has_hypertension boolean,
    has_hepatitis boolean,
    has_cancer boolean,
    has_addictions boolean,
    has_heart_disease boolean,
    has_kidney_disease boolean,
    has_hiv boolean,
    has_neurological_disorder boolean,
    medical_history_other text,
    consent_accepted_at timestamp with time zone,
    consent_version text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT medical_history_questionnaire_source_check CHECK ((source = ANY (ARRAY['staff'::text, 'patient'::text])))
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS message (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    sender_type text NOT NULL,
    sender_id uuid,
    body text,
    media_url text,
    media_type text,
    external_msg_id text,
    status text DEFAULT 'sent'::text NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    delivered_at timestamp with time zone,
    read_at timestamp with time zone,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT message_sender_type_check CHECK ((sender_type = ANY (ARRAY['user'::text, 'practitioner'::text, 'patient'::text, 'lead'::text, 'system'::text]))),
    CONSTRAINT message_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'delivered'::text, 'read'::text, 'failed'::text])))
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS note (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    author_id uuid,
    body text NOT NULL,
    metadata jsonb,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS notification (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    identity_id uuid NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    body text,
    entity_type text,
    entity_id uuid,
    action_url text,
    read_at timestamp with time zone,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS notification_delivery (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    notification_id uuid NOT NULL,
    channel text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    provider_message_id text,
    failed_reason text,
    sent_at timestamp with time zone,
    delivered_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notification_delivery_channel_check CHECK ((channel = ANY (ARRAY['in_app'::text, 'push'::text, 'email'::text, 'sms'::text]))),
    CONSTRAINT notification_delivery_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'delivered'::text, 'failed'::text])))
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS oral_exam (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    recorded_by uuid,
    has_bruxism boolean,
    has_narrow_palate boolean,
    has_geographic_tongue boolean,
    has_xerostomia boolean,
    skeletal_class text,
    is_mouth_breather boolean,
    has_missing_teeth boolean,
    has_periodontal_disease boolean,
    has_tmj_finding boolean,
    tooth text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT oral_exam_skeletal_class_check CHECK ((skeletal_class = ANY (ARRAY['I'::text, 'II'::text, 'III'::text])))
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS organization (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    type text DEFAULT 'other'::text NOT NULL,
    identifiers jsonb,
    address_line1 text,
    city text,
    state text,
    postal_code text,
    country_code text,
    region text,
    territory_id uuid,
    phone text,
    email text,
    website text,
    google_link text,
    latitude double precision,
    longitude double precision,
    specialties text[] DEFAULT '{}'::text[] NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    metadata jsonb,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT organization_status_check CHECK ((status = ANY (ARRAY['pending_approval'::text, 'active'::text, 'inactive'::text]))),
    CONSTRAINT organization_type_check CHECK ((type = ANY (ARRAY['clinic'::text, 'hospital'::text, 'pharmacy'::text, 'practice'::text, 'other'::text])))
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS partner_link (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    partner text NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    external_id text,
    external_status text,
    sync_status text DEFAULT 'pending'::text NOT NULL,
    last_error text,
    last_synced_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT partner_link_sync_status_check CHECK ((sync_status = ANY (ARRAY['pending'::text, 'synced'::text, 'failed'::text])))
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS partner_transaction (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    partner_link_id uuid NOT NULL,
    action text NOT NULL,
    request_payload jsonb,
    response_payload jsonb,
    http_status integer,
    success boolean NOT NULL,
    validation_report jsonb,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS patient (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    identity_id uuid NOT NULL,
    google_sub text,
    password_hash text,
    token_version integer DEFAULT 0 NOT NULL,
    practitioner_id uuid,
    diagnosis_code jsonb,
    ahi_baseline numeric(6,2),
    cpap_device text,
    medical_record text,
    shipping_address jsonb,
    status text DEFAULT 'active'::text NOT NULL,
    data_consent_at timestamp with time zone,
    data_consent_withdrawn_at timestamp with time zone,
    metadata jsonb,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT patient_status_check CHECK ((status = ANY (ARRAY['active'::text, 'follow_up'::text, 'discharged'::text])))
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS patient_webauthn_credentials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    credential_id text NOT NULL,
    public_key text NOT NULL,
    counter bigint DEFAULT 0 NOT NULL,
    device_type text,
    device_name text,
    last_used_at timestamp with time zone,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS practitioner (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    identity_id uuid NOT NULL,
    organization_id uuid,
    national_ids jsonb,
    primary_specialty text,
    specialties text[] DEFAULT '{}'::text[] NOT NULL,
    influence_tier text DEFAULT 'C'::text NOT NULL,
    engagement_level text DEFAULT 'unknown'::text NOT NULL,
    prescribing_volume text,
    is_key_opinion_leader boolean DEFAULT false NOT NULL,
    visit_count integer DEFAULT 0 NOT NULL,
    last_visit_date date,
    first_contact_date date,
    status text DEFAULT 'active'::text NOT NULL,
    data_consent_at timestamp with time zone,
    data_consent_withdrawn_at timestamp with time zone,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    metadata jsonb,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT practitioner_engagement_level_check CHECK ((engagement_level = ANY (ARRAY['champion'::text, 'neutral'::text, 'skeptic'::text, 'unknown'::text]))),
    CONSTRAINT practitioner_influence_tier_check CHECK ((influence_tier = ANY (ARRAY['A'::text, 'B'::text, 'C'::text, 'D'::text]))),
    CONSTRAINT practitioner_prescribing_volume_check CHECK ((prescribing_volume = ANY (ARRAY['high'::text, 'medium'::text, 'low'::text, 'none'::text, NULL::text]))),
    CONSTRAINT practitioner_status_check CHECK ((status = ANY (ARRAY['pending_approval'::text, 'invited'::text, 'active'::text, 'inactive'::text])))
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS practitioner_assignment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    practitioner_id uuid NOT NULL,
    user_id uuid NOT NULL,
    primary_org_id uuid,
    relationship_notes text,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS practitioner_organization (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    practitioner_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    role text,
    is_primary boolean DEFAULT false NOT NULL,
    valid_from date,
    valid_to date,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS presentation (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    product_id uuid,
    uploaded_by uuid,
    file_url text NOT NULL,
    thumbnail_url text,
    locale text DEFAULT 'en'::text NOT NULL,
    keywords text[] DEFAULT '{}'::text[] NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    metadata jsonb,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT presentation_status_check CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text, 'draft'::text])))
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS product (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    code text,
    category text,
    description text,
    keywords text[] DEFAULT '{}'::text[] NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS purchase_order (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    stripe_payment_intent_id text,
    stripe_customer_id text,
    currency text DEFAULT 'PLN'::text NOT NULL,
    subtotal numeric(12,2) NOT NULL,
    tax numeric(12,2) DEFAULT 0 NOT NULL,
    total numeric(12,2) NOT NULL,
    shipping_address jsonb,
    shipping_method text,
    status text DEFAULT 'pending'::text NOT NULL,
    paid_at timestamp with time zone,
    shipped_at timestamp with time zone,
    delivered_at timestamp with time zone,
    notes text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT purchase_order_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text, 'processing'::text, 'shipped'::text, 'delivered'::text, 'cancelled'::text, 'refunded'::text])))
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS purchase_order_item (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    product_id uuid,
    description text NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    unit_price numeric(12,2) NOT NULL,
    currency text DEFAULT 'PLN'::text NOT NULL,
    fulfillment_supplier_id uuid,
    fulfillment_status text DEFAULT 'pending'::text NOT NULL,
    tracking_number text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT purchase_order_item_fulfillment_status_check CHECK ((fulfillment_status = ANY (ARRAY['pending'::text, 'dispatched'::text, 'shipped'::text, 'delivered'::text, 'cancelled'::text])))
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS push_subscription (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    endpoint text NOT NULL,
    keys jsonb NOT NULL,
    user_agent text,
    last_used timestamp with time zone,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS questionnaire_request (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    kind text NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT questionnaire_request_kind_check CHECK ((kind = ANY (ARRAY['medical_history'::text, 'stop_bang'::text])))
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS remember_me_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    last_used_at timestamp with time zone,
    revoked_at timestamp with time zone,
    replaced_by_id uuid,
    device_name text,
    user_agent text,
    ip_address inet,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS request_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid,
    user_id uuid,
    method text NOT NULL,
    route text NOT NULL,
    path text NOT NULL,
    status_code integer NOT NULL,
    duration_ms integer,
    request_id text,
    ip_address inet,
    user_agent text,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS sample_batch (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    lot_number text NOT NULL,
    quantity_total integer NOT NULL,
    expiry_date date NOT NULL,
    received_at date DEFAULT CURRENT_DATE NOT NULL,
    received_by uuid,
    notes text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS sample_request (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    requester_id uuid NOT NULL,
    product_id uuid NOT NULL,
    quantity integer NOT NULL,
    reason text,
    status text DEFAULT 'pending'::text NOT NULL,
    approved_by uuid,
    approved_at timestamp with time zone,
    fulfilled_at timestamp with time zone,
    notes text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sample_request_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'fulfilled'::text])))
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS sample_stock (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    product_id uuid NOT NULL,
    quantity integer DEFAULT 0 NOT NULL,
    metadata jsonb,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sample_stock_quantity_check CHECK ((quantity >= 0))
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS sample_transaction (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    batch_id uuid NOT NULL,
    product_id uuid NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    quantity integer NOT NULL,
    encounter_id uuid,
    practitioner_id uuid,
    to_user_id uuid,
    lot_number text NOT NULL,
    expiry_date date NOT NULL,
    notes text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    signature_url text,
    CONSTRAINT sample_transaction_type_check CHECK ((type = ANY (ARRAY['received'::text, 'given'::text, 'transferred'::text, 'returned'::text, 'expired'::text, 'damaged'::text])))
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS segment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    entity_type text DEFAULT 'practitioner'::text NOT NULL,
    criteria jsonb,
    is_dynamic boolean DEFAULT false NOT NULL,
    refreshed_at timestamp with time zone,
    created_by uuid,
    metadata jsonb,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT segment_entity_type_check CHECK ((entity_type = ANY (ARRAY['practitioner'::text, 'patient'::text, 'lead'::text])))
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS segment_member (
    segment_id uuid NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    added_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb,
    CONSTRAINT segment_member_entity_type_check CHECK ((entity_type = ANY (ARRAY['practitioner'::text, 'patient'::text, 'lead'::text])))
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS sleep_study (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    purchase_order_id uuid,
    supplier_id uuid,
    device_serial text,
    device_shipped_at timestamp with time zone,
    device_delivered_at timestamp with time zone,
    device_returned_at timestamp with time zone,
    study_date date,
    results_received_at timestamp with time zone,
    raw_results jsonb,
    ahi_score numeric(6,2),
    spo2_nadir numeric(5,2),
    odi numeric(6,2),
    interpreted_by uuid,
    interpreted_at timestamp with time zone,
    interpretation text,
    diagnosis_code jsonb,
    oa_indicated boolean,
    cpap_indicated boolean,
    status text DEFAULT 'ordered'::text NOT NULL,
    notes text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    study_type text DEFAULT 'polysomnography'::text NOT NULL,
    CONSTRAINT sleep_study_type_check CHECK ((study_type = ANY (ARRAY['polysomnography'::text, 'other'::text]))),
    CONSTRAINT sleep_study_status_check CHECK ((status = ANY (ARRAY['ordered'::text, 'device_shipped'::text, 'device_delivered'::text, 'study_complete'::text, 'results_received'::text, 'interpreted'::text, 'cancelled'::text])))
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS stop_bang_screening (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    recorded_by uuid,
    snoring boolean NOT NULL,
    tiredness boolean NOT NULL,
    observed_apnea boolean NOT NULL,
    pressure boolean NOT NULL,
    bmi_over_35 boolean,
    age_over_50 boolean,
    neck_circumference_over_40cm boolean,
    is_male boolean,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    source text DEFAULT 'staff'::text NOT NULL,
    request_id uuid,
    consent_accepted_at timestamp with time zone,
    consent_version text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    score integer GENERATED ALWAYS AS (
CASE
    WHEN ((bmi_over_35 IS NULL) OR (age_over_50 IS NULL) OR (neck_circumference_over_40cm IS NULL) OR (is_male IS NULL)) THEN NULL::integer
    ELSE ((((((((snoring)::integer + (tiredness)::integer) + (observed_apnea)::integer) + (pressure)::integer) + (bmi_over_35)::integer) + (age_over_50)::integer) + (neck_circumference_over_40cm)::integer) + (is_male)::integer)
END) STORED,
    CONSTRAINT stop_bang_screening_source_check CHECK ((source = ANY (ARRAY['staff'::text, 'patient'::text])))
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS supplier (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    api_endpoint text,
    api_key_ref text,
    webhook_secret_ref text,
    contact_email text,
    contact_phone text,
    country_code text,
    is_active boolean DEFAULT true NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT supplier_type_check CHECK ((type = ANY (ARRAY['device_manufacturer'::text, 'scan_lab'::text, 'oa_manufacturer'::text, 'sleep_lab'::text, 'other'::text])))
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS support_ticket (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    patient_id uuid,
    assigned_to uuid,
    assigned_at timestamp with time zone,
    subject text,
    priority text DEFAULT 'normal'::text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    resolved_at timestamp with time zone,
    resolution_notes text,
    source text DEFAULT 'ai_escalation'::text NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT support_ticket_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'urgent'::text]))),
    CONSTRAINT support_ticket_source_check CHECK ((source = ANY (ARRAY['ai_escalation'::text, 'patient_request'::text, 'manual'::text]))),
    CONSTRAINT support_ticket_status_check CHECK ((status = ANY (ARRAY['open'::text, 'in_progress'::text, 'resolved'::text, 'closed'::text])))
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS sync_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    device_id text NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid,
    client_temp_id text,
    operation text NOT NULL,
    payload jsonb NOT NULL,
    client_updated_at timestamp with time zone NOT NULL,
    conflict boolean DEFAULT false NOT NULL,
    conflict_detail jsonb,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    processed_at timestamp with time zone,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sync_queue_operation_check CHECK ((operation = ANY (ARRAY['create'::text, 'update'::text, 'delete'::text]))),
    CONSTRAINT sync_queue_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'applied'::text, 'conflict'::text, 'failed'::text])))
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS target (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    territory_id uuid,
    period text NOT NULL,
    period_type text DEFAULT 'month'::text NOT NULL,
    metric text NOT NULL,
    value numeric(10,2) NOT NULL,
    currency text,
    set_by uuid,
    approved_by uuid,
    approved_at timestamp with time zone,
    notes text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT target_metric_check CHECK ((metric = ANY (ARRAY['visit_count'::text, 'coverage_pct'::text, 'new_hcp'::text, 'new_lead'::text, 'samples_given'::text]))),
    CONSTRAINT target_period_type_check CHECK ((period_type = ANY (ARRAY['month'::text, 'quarter'::text, 'year'::text])))
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS territory (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    code text,
    country_code text NOT NULL,
    parent_id uuid,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    kind text DEFAULT 'region'::text NOT NULL,
    deleted_at timestamp with time zone,
    path extensions.ltree DEFAULT 'unset'::extensions.ltree NOT NULL,
    CONSTRAINT territory_kind_check CHECK ((kind = ANY (ARRAY['global'::text, 'country'::text, 'region'::text, 'city'::text, 'village'::text, 'district'::text])))
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS territory_user (
    territory_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'rep'::text NOT NULL,
    valid_from date DEFAULT CURRENT_DATE NOT NULL,
    valid_to date,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT territory_user_role_check CHECK ((role = ANY (ARRAY['rep'::text, 'kam'::text, 'ffm'::text, 'msl'::text, 'backup'::text])))
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS training_course (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    required_role text,
    locale text DEFAULT 'en'::text NOT NULL,
    sort_order integer DEFAULT 10 NOT NULL,
    is_required boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS training_lesson (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    course_id uuid NOT NULL,
    title text NOT NULL,
    type text DEFAULT 'video'::text NOT NULL,
    content_url text,
    content_config jsonb,
    duration_sec integer,
    sort_order integer DEFAULT 10 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT training_lesson_type_check CHECK ((type = ANY (ARRAY['animation_tour'::text, 'video'::text, 'interactive'::text, 'quiz'::text])))
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS training_progress (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    lesson_id uuid NOT NULL,
    status text DEFAULT 'not_started'::text NOT NULL,
    score integer,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT training_progress_score_check CHECK (((score >= 0) AND (score <= 100))),
    CONSTRAINT training_progress_status_check CHECK ((status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'completed'::text])))
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS treatment_plan (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    sleep_study_id uuid,
    type text NOT NULL,
    device_product_id uuid,
    device_purchase_order_id uuid,
    dentist_id uuid,
    dentist_notified_at timestamp with time zone,
    dentist_accepted_at timestamp with time zone,
    appointment_at timestamp with time zone,
    scan_supplier_id uuid,
    scan_ordered_at timestamp with time zone,
    scan_received_at timestamp with time zone,
    scan_file_url text,
    appliance_supplier_id uuid,
    appliance_ordered_at timestamp with time zone,
    appliance_delivered_at timestamp with time zone,
    recommended_by uuid,
    notes text,
    status text DEFAULT 'initiated'::text NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT treatment_plan_status_check CHECK ((status = ANY (ARRAY['initiated'::text, 'patient_notified'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text, 'on_hold'::text]))),
    CONSTRAINT treatment_plan_type_check CHECK ((type = ANY (ARRAY['cpap'::text, 'apap'::text, 'dental_appliance'::text, 'positional'::text, 'lifestyle'::text, 'watchful_waiting'::text])))
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role text NOT NULL,
    granted_by uuid,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    territory_id uuid NOT NULL,
    CONSTRAINT user_roles_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'manager'::text, 'kam'::text, 'msl'::text, 'rep'::text, 'doctor'::text])))
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS user_session (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    auth_method text DEFAULT 'password'::text NOT NULL,
    ip_address inet,
    user_agent text,
    device_name text,
    country_code text,
    is_active boolean DEFAULT true NOT NULL,
    revoked_at timestamp with time zone,
    revoke_reason text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_session_auth_method_check CHECK ((auth_method = ANY (ARRAY['password'::text, 'google_oidc'::text, 'webauthn'::text, 'magic_link'::text, 'remember_me'::text])))
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    identity_id uuid NOT NULL,
    google_sub text,
    password_hash text,
    force_password_change boolean DEFAULT false NOT NULL,
    last_password_change_at timestamp with time zone,
    token_version integer DEFAULT 0 NOT NULL,
    bio text,
    hire_date date,
    manager_id uuid,
    work_phone text,
    status text DEFAULT 'active'::text NOT NULL,
    deleted_at timestamp with time zone,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT users_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'suspended'::text])))
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS visit_plan (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    practitioner_id uuid,
    organization_id uuid,
    territory_id uuid,
    planned_at timestamp with time zone NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    notes text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT visit_plan_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'completed'::text, 'cancelled'::text])))
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS webauthn_credentials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    credential_id text NOT NULL,
    public_key text NOT NULL,
    counter bigint DEFAULT 0 NOT NULL,
    device_type text,
    device_name text,
    last_used_at timestamp with time zone,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE TABLE IF NOT EXISTS webhook_event (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source text NOT NULL,
    event_type text NOT NULL,
    external_id text,
    payload jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    processed_at timestamp with time zone,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT webhook_event_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'processed'::text, 'failed'::text, 'skipped'::text])))
);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS medical_history_questionnaire_patient_idx ON medical_history_questionnaire USING btree (patient_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS medical_history_questionnaire_recorder_idx ON medical_history_questionnaire USING btree (recorded_by);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS ai_insight_entity_idx ON ai_insight USING btree (entity_type, entity_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS ai_insight_expires_idx ON ai_insight USING btree (expires_at) WHERE (is_stale = false);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS ai_log_entity_idx ON ai_generation_log USING btree (entity_type, entity_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS ai_log_feature_idx ON ai_generation_log USING btree (feature);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS ai_log_user_idx ON ai_generation_log USING btree (user_id, created_at);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS attachment_entity_idx ON file_attachment USING btree (entity_type, entity_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_log USING btree (created_at);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS audit_entity_idx ON audit_log USING btree (entity_type, entity_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS audit_user_idx ON audit_log USING btree (user_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS consent_entity_idx ON consent USING btree (entity_type, entity_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS consent_jurisdiction_idx ON consent USING btree (jurisdiction);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS conv_contact_idx ON conversation USING btree (contact_type, contact_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS conv_last_msg_idx ON conversation USING btree (last_message_at);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS conv_user_idx ON conversation USING btree (user_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS course_role_idx ON training_course USING btree (required_role) WHERE (is_active = true);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS efpia_pending_idx ON efpia_disclosure USING btree (status) WHERE (status <> 'disclosed'::text);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS efpia_prac_idx ON efpia_disclosure USING btree (practitioner_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS efpia_year_status_idx ON efpia_disclosure USING btree (year, status);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS enc_prac_idx ON encounter USING btree (practitioner_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS enc_prac_start_idx ON encounter USING btree (practitioner_id, start_at DESC) WHERE (deleted_at IS NULL);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS enc_start_idx ON encounter USING btree (start_at);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS enc_status_idx ON encounter USING btree (status) WHERE (deleted_at IS NULL);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS enc_territory_idx ON encounter USING btree (territory_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS enc_user_idx ON encounter USING btree (user_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS enc_user_start_idx ON encounter USING btree (user_id, start_at DESC) WHERE (deleted_at IS NULL);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS encpres_enc_idx ON encounter_presentation USING btree (encounter_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS encprod_enc_idx ON encounter_product USING btree (encounter_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS endo_intake_recorder_idx ON endo_intake USING btree (recorded_by);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS event_att_event_idx ON event_attendee USING btree (event_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS event_att_who_idx ON event_attendee USING btree (attendee_type, attendee_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS event_country_idx ON event USING btree (country_code);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS event_starts_idx ON event USING btree (starts_at);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS event_status_idx ON event USING btree (status) WHERE (deleted_at IS NULL);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS identities_country_idx ON identities USING btree (country_code);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS identities_email_idx ON identities USING btree (email);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS identities_region_idx ON identities USING btree (region);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS identities_territory_idx ON identities USING btree (territory_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS invite_tokens_user_idx ON invite_tokens USING btree (user_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS kpi_metric_idx ON kpi_snapshot USING btree (metric, period_type);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS kpi_scope_idx ON kpi_snapshot USING btree (scope_type, scope_id, period);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE UNIQUE INDEX IF NOT EXISTS kpi_unique_idx ON kpi_snapshot USING btree (period, period_type, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid), metric);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS lead_assigned_idx ON lead USING btree (assigned_to);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS lead_status_idx ON lead USING btree (status) WHERE (deleted_at IS NULL);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS lesson_course_idx ON training_lesson USING btree (course_id, sort_order);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS message_conv_idx ON message USING btree (conversation_id, sent_at);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS message_sender_idx ON message USING btree (sender_type, sender_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS mlt_entity_idx ON magic_link_tokens USING btree (entity_type, entity_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS mlt_hash_idx ON magic_link_tokens USING btree (token_hash);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS note_author_idx ON note USING btree (author_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS note_entity_idx ON note USING btree (entity_type, entity_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS notif_created_idx ON notification USING btree (created_at);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS notif_delivery_channel_idx ON notification_delivery USING btree (channel, status);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS notif_delivery_notif_idx ON notification_delivery USING btree (notification_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS notif_identity_idx ON notification USING btree (identity_id, read_at);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS org_country_idx ON organization USING btree (country_code);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS org_specialties_gin ON organization USING gin (specialties);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS org_status_idx ON organization USING btree (status) WHERE (deleted_at IS NULL);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS org_territory_idx ON organization USING btree (territory_id) WHERE (deleted_at IS NULL);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS partner_link_entity_idx ON partner_link USING btree (entity_type, entity_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS partner_link_sync_idx ON partner_link USING btree (partner, sync_status);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS partner_transaction_link_idx ON partner_transaction USING btree (partner_link_id, created_at DESC);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS pat_webauthn_user_idx ON patient_webauthn_credentials USING btree (patient_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS patient_google_idx ON patient USING btree (google_sub);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS patient_prac_idx ON patient USING btree (practitioner_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS patient_status_idx ON patient USING btree (status) WHERE (deleted_at IS NULL);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS pitem_order_idx ON purchase_order_item USING btree (order_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS pitem_supplier_idx ON purchase_order_item USING btree (fulfillment_supplier_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS porder_patient_idx ON purchase_order USING btree (patient_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS porder_status_idx ON purchase_order USING btree (status);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS porder_stripe_idx ON purchase_order USING btree (stripe_payment_intent_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS prac_identity_idx ON practitioner USING btree (identity_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS prac_org_idx ON practitioner USING btree (organization_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS prac_specialties_gin ON practitioner USING gin (specialties);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS prac_specialty_idx ON practitioner USING btree (primary_specialty) WHERE (deleted_at IS NULL);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS prac_status_idx ON practitioner USING btree (status) WHERE (deleted_at IS NULL);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS prac_tags_gin ON practitioner USING gin (tags);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS prac_tier_idx ON practitioner USING btree (influence_tier);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS pracassign_prac_idx ON practitioner_assignment USING btree (practitioner_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS pracassign_user_idx ON practitioner_assignment USING btree (user_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS pracorg_org_idx ON practitioner_organization USING btree (organization_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS pracorg_prac_idx ON practitioner_organization USING btree (practitioner_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE UNIQUE INDEX IF NOT EXISTS practitioner_identity_id_key ON practitioner USING btree (identity_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS pres_keywords_gin ON presentation USING gin (keywords);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS pres_product_idx ON presentation USING btree (product_id) WHERE (deleted_at IS NULL);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS pres_status_idx ON presentation USING btree (status) WHERE (deleted_at IS NULL);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS product_keywords_gin ON product USING gin (keywords);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS progress_user_idx ON training_progress USING btree (user_id, status);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS prt_expires_idx ON password_reset_tokens USING btree (expires_at);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS prt_hash_idx ON password_reset_tokens USING btree (token_hash);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS push_user_idx ON push_subscription USING btree (user_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS reqlog_created_idx ON request_log USING btree (created_at);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS reqlog_route_idx ON request_log USING btree (route, status_code);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS reqlog_session_idx ON request_log USING btree (session_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS reqlog_user_idx ON request_log USING btree (user_id, created_at);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS rmt_expires_idx ON remember_me_tokens USING btree (expires_at);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS rmt_hash_idx ON remember_me_tokens USING btree (token_hash);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS rmt_user_idx ON remember_me_tokens USING btree (user_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS sbatch_expiry_idx ON sample_batch USING btree (expiry_date);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS sbatch_product_idx ON sample_batch USING btree (product_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS segmember_entity_idx ON segment_member USING btree (entity_type, entity_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS segment_type_idx ON segment USING btree (entity_type) WHERE (deleted_at IS NULL);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS session_active_idx ON user_session USING btree (is_active) WHERE (is_active = true);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS session_started_idx ON user_session USING btree (started_at);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS session_user_idx ON user_session USING btree (user_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS sreq_requester_idx ON sample_request USING btree (requester_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS sreq_status_idx ON sample_request USING btree (status);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS sstock_user_idx ON sample_stock USING btree (user_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS stop_bang_patient_idx ON stop_bang_screening USING btree (patient_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS stop_bang_recorder_idx ON stop_bang_screening USING btree (recorded_by);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS study_doctor_idx ON sleep_study USING btree (interpreted_by);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS study_patient_idx ON sleep_study USING btree (patient_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS study_status_idx ON sleep_study USING btree (status);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS stxn_batch_idx ON sample_transaction USING btree (batch_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS stxn_encounter_idx ON sample_transaction USING btree (encounter_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS stxn_type_idx ON sample_transaction USING btree (type);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS stxn_user_idx ON sample_transaction USING btree (user_id, created_at);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS supplier_type_idx ON supplier USING btree (type) WHERE (is_active = true);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS sync_status_idx ON sync_queue USING btree (status, created_at);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS sync_user_idx ON sync_queue USING btree (user_id, status);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS target_user_period_idx ON target USING btree (user_id, period);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS territory_country_idx ON territory USING btree (country_code);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS territory_parent_idx ON territory USING btree (parent_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS territory_path_gist ON territory USING gist (path);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS territory_user_user_idx ON territory_user USING btree (user_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS ticket_assignee_idx ON support_ticket USING btree (assigned_to, status);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS ticket_patient_idx ON support_ticket USING btree (patient_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS ticket_status_idx ON support_ticket USING btree (status);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS tx_dentist_idx ON treatment_plan USING btree (dentist_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS tx_patient_idx ON treatment_plan USING btree (patient_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS tx_study_idx ON treatment_plan USING btree (sleep_study_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS tx_type_status_idx ON treatment_plan USING btree (type, status);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS user_roles_role_territory_idx ON user_roles USING btree (role, territory_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS user_roles_user_idx ON user_roles USING btree (user_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS users_identity_idx ON users USING btree (identity_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS users_manager_idx ON users USING btree (manager_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS users_status_idx ON users USING btree (status) WHERE (deleted_at IS NULL);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS vplan_date_idx ON visit_plan USING btree (planned_at);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS vplan_user_idx ON visit_plan USING btree (user_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS webauthn_user_idx ON webauthn_credentials USING btree (user_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS webhook_source_idx ON webhook_event USING btree (source);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS webhook_status_idx ON webhook_event USING btree (status, created_at);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS oral_exam_patient_idx ON oral_exam USING btree (patient_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS oral_exam_recorder_idx ON oral_exam USING btree (recorded_by);$tenant_ddl$;

  EXECUTE $tenant_ddl$CREATE INDEX IF NOT EXISTS questionnaire_request_patient_idx ON questionnaire_request USING btree (patient_id);$tenant_ddl$;

  -- Phase 2: drop constraints (foreign keys first — nothing depends on them)
  EXECUTE $tenant_ddl$ALTER TABLE ai_generation_log DROP CONSTRAINT IF EXISTS ai_generation_log_user_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_session_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_user_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE consent DROP CONSTRAINT IF EXISTS consent_collected_by_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE conversation DROP CONSTRAINT IF EXISTS conversation_user_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE efpia_disclosure DROP CONSTRAINT IF EXISTS efpia_disclosure_approved_by_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE efpia_disclosure DROP CONSTRAINT IF EXISTS efpia_disclosure_practitioner_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE encounter DROP CONSTRAINT IF EXISTS encounter_organization_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE encounter DROP CONSTRAINT IF EXISTS encounter_practitioner_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE encounter_presentation DROP CONSTRAINT IF EXISTS encounter_presentation_encounter_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE encounter_presentation DROP CONSTRAINT IF EXISTS encounter_presentation_presentation_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE encounter_product DROP CONSTRAINT IF EXISTS encounter_product_encounter_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE encounter_product DROP CONSTRAINT IF EXISTS encounter_product_product_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE encounter DROP CONSTRAINT IF EXISTS encounter_territory_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE encounter DROP CONSTRAINT IF EXISTS encounter_user_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE endo_intake DROP CONSTRAINT IF EXISTS endo_intake_patient_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE endo_intake DROP CONSTRAINT IF EXISTS endo_intake_recorded_by_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE event_attendee DROP CONSTRAINT IF EXISTS event_attendee_event_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE event DROP CONSTRAINT IF EXISTS event_territory_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE file_attachment DROP CONSTRAINT IF EXISTS file_attachment_uploaded_by_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE invite_tokens DROP CONSTRAINT IF EXISTS invite_tokens_created_by_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE invite_tokens DROP CONSTRAINT IF EXISTS invite_tokens_lead_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE invite_tokens DROP CONSTRAINT IF EXISTS invite_tokens_user_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE lead DROP CONSTRAINT IF EXISTS lead_assigned_to_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE lead DROP CONSTRAINT IF EXISTS lead_identity_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE lookup DROP CONSTRAINT IF EXISTS lookup_global_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE medical_history_questionnaire DROP CONSTRAINT IF EXISTS medical_history_questionnaire_patient_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE medical_history_questionnaire DROP CONSTRAINT IF EXISTS medical_history_questionnaire_recorded_by_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE medical_history_questionnaire DROP CONSTRAINT IF EXISTS medical_history_questionnaire_request_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE message DROP CONSTRAINT IF EXISTS message_conversation_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE identities DROP CONSTRAINT IF EXISTS identities_territory_fk;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE notification DROP CONSTRAINT IF EXISTS notification_identity_fk;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE purchase_order_item DROP CONSTRAINT IF EXISTS pitem_product_fk;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE sleep_study DROP CONSTRAINT IF EXISTS study_order_fk;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE support_ticket DROP CONSTRAINT IF EXISTS ticket_conv_fk;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE treatment_plan DROP CONSTRAINT IF EXISTS treatment_plan_sleep_study_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE treatment_plan DROP CONSTRAINT IF EXISTS tx_product_fk;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE treatment_plan DROP CONSTRAINT IF EXISTS tx_purchase_order_fk;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE note DROP CONSTRAINT IF EXISTS note_author_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE notification_delivery DROP CONSTRAINT IF EXISTS notification_delivery_notification_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE notification DROP CONSTRAINT IF EXISTS notification_identity_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE oral_exam DROP CONSTRAINT IF EXISTS oral_exam_patient_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE oral_exam DROP CONSTRAINT IF EXISTS oral_exam_recorded_by_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE organization DROP CONSTRAINT IF EXISTS organization_territory_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE partner_transaction DROP CONSTRAINT IF EXISTS partner_transaction_partner_link_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE password_reset_tokens DROP CONSTRAINT IF EXISTS password_reset_tokens_user_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE patient DROP CONSTRAINT IF EXISTS patient_identity_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE patient DROP CONSTRAINT IF EXISTS patient_practitioner_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE patient_webauthn_credentials DROP CONSTRAINT IF EXISTS patient_webauthn_credentials_patient_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE practitioner_assignment DROP CONSTRAINT IF EXISTS practitioner_assignment_practitioner_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE practitioner_assignment DROP CONSTRAINT IF EXISTS practitioner_assignment_primary_org_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE practitioner_assignment DROP CONSTRAINT IF EXISTS practitioner_assignment_user_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE practitioner DROP CONSTRAINT IF EXISTS practitioner_identity_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE practitioner DROP CONSTRAINT IF EXISTS practitioner_organization_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE practitioner_organization DROP CONSTRAINT IF EXISTS practitioner_organization_organization_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE practitioner_organization DROP CONSTRAINT IF EXISTS practitioner_organization_practitioner_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE presentation DROP CONSTRAINT IF EXISTS presentation_product_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE presentation DROP CONSTRAINT IF EXISTS presentation_uploaded_by_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE purchase_order_item DROP CONSTRAINT IF EXISTS purchase_order_item_fulfillment_supplier_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE purchase_order_item DROP CONSTRAINT IF EXISTS purchase_order_item_order_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE purchase_order DROP CONSTRAINT IF EXISTS purchase_order_patient_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE push_subscription DROP CONSTRAINT IF EXISTS push_subscription_user_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE questionnaire_request DROP CONSTRAINT IF EXISTS questionnaire_request_created_by_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE questionnaire_request DROP CONSTRAINT IF EXISTS questionnaire_request_patient_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE remember_me_tokens DROP CONSTRAINT IF EXISTS remember_me_tokens_replaced_by_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE remember_me_tokens DROP CONSTRAINT IF EXISTS remember_me_tokens_user_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE request_log DROP CONSTRAINT IF EXISTS request_log_session_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE request_log DROP CONSTRAINT IF EXISTS request_log_user_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE sample_batch DROP CONSTRAINT IF EXISTS sample_batch_product_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE sample_batch DROP CONSTRAINT IF EXISTS sample_batch_received_by_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE sample_request DROP CONSTRAINT IF EXISTS sample_request_approved_by_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE sample_request DROP CONSTRAINT IF EXISTS sample_request_product_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE sample_request DROP CONSTRAINT IF EXISTS sample_request_requester_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE sample_stock DROP CONSTRAINT IF EXISTS sample_stock_product_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE sample_stock DROP CONSTRAINT IF EXISTS sample_stock_user_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE sample_transaction DROP CONSTRAINT IF EXISTS sample_transaction_batch_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE sample_transaction DROP CONSTRAINT IF EXISTS sample_transaction_encounter_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE sample_transaction DROP CONSTRAINT IF EXISTS sample_transaction_practitioner_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE sample_transaction DROP CONSTRAINT IF EXISTS sample_transaction_product_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE sample_transaction DROP CONSTRAINT IF EXISTS sample_transaction_to_user_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE sample_transaction DROP CONSTRAINT IF EXISTS sample_transaction_user_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE segment DROP CONSTRAINT IF EXISTS segment_created_by_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE segment_member DROP CONSTRAINT IF EXISTS segment_member_segment_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE sleep_study DROP CONSTRAINT IF EXISTS sleep_study_interpreted_by_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE sleep_study DROP CONSTRAINT IF EXISTS sleep_study_patient_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE sleep_study DROP CONSTRAINT IF EXISTS sleep_study_supplier_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE stop_bang_screening DROP CONSTRAINT IF EXISTS stop_bang_screening_patient_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE stop_bang_screening DROP CONSTRAINT IF EXISTS stop_bang_screening_recorded_by_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE stop_bang_screening DROP CONSTRAINT IF EXISTS stop_bang_screening_request_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE support_ticket DROP CONSTRAINT IF EXISTS support_ticket_assigned_to_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE support_ticket DROP CONSTRAINT IF EXISTS support_ticket_patient_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE sync_queue DROP CONSTRAINT IF EXISTS sync_queue_user_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE target DROP CONSTRAINT IF EXISTS target_approved_by_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE target DROP CONSTRAINT IF EXISTS target_set_by_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE target DROP CONSTRAINT IF EXISTS target_territory_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE target DROP CONSTRAINT IF EXISTS target_user_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE territory DROP CONSTRAINT IF EXISTS territory_parent_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE territory_user DROP CONSTRAINT IF EXISTS territory_user_territory_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE territory_user DROP CONSTRAINT IF EXISTS territory_user_user_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE training_lesson DROP CONSTRAINT IF EXISTS training_lesson_course_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE training_progress DROP CONSTRAINT IF EXISTS training_progress_lesson_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE training_progress DROP CONSTRAINT IF EXISTS training_progress_user_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE treatment_plan DROP CONSTRAINT IF EXISTS treatment_plan_appliance_supplier_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE treatment_plan DROP CONSTRAINT IF EXISTS treatment_plan_dentist_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE treatment_plan DROP CONSTRAINT IF EXISTS treatment_plan_patient_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE treatment_plan DROP CONSTRAINT IF EXISTS treatment_plan_recommended_by_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE treatment_plan DROP CONSTRAINT IF EXISTS treatment_plan_scan_supplier_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS user_roles_granted_by_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS user_roles_territory_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE user_session DROP CONSTRAINT IF EXISTS user_session_user_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE users DROP CONSTRAINT IF EXISTS users_identity_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE users DROP CONSTRAINT IF EXISTS users_manager_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE visit_plan DROP CONSTRAINT IF EXISTS visit_plan_organization_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE visit_plan DROP CONSTRAINT IF EXISTS visit_plan_practitioner_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE visit_plan DROP CONSTRAINT IF EXISTS visit_plan_territory_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE visit_plan DROP CONSTRAINT IF EXISTS visit_plan_user_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE webauthn_credentials DROP CONSTRAINT IF EXISTS webauthn_credentials_user_id_fkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE ai_generation_log DROP CONSTRAINT IF EXISTS ai_generation_log_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE ai_insight DROP CONSTRAINT IF EXISTS ai_insight_entity_type_entity_id_metric_key;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE ai_insight DROP CONSTRAINT IF EXISTS ai_insight_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE app_config DROP CONSTRAINT IF EXISTS app_config_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE app_config DROP CONSTRAINT IF EXISTS app_config_singleton_key;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE consent DROP CONSTRAINT IF EXISTS consent_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE conversation DROP CONSTRAINT IF EXISTS conversation_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE conversation DROP CONSTRAINT IF EXISTS conversation_user_id_contact_type_contact_id_channel_key;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE efpia_disclosure DROP CONSTRAINT IF EXISTS efpia_disclosure_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE efpia_disclosure DROP CONSTRAINT IF EXISTS efpia_disclosure_practitioner_id_year_key;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE encounter DROP CONSTRAINT IF EXISTS encounter_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE encounter_presentation DROP CONSTRAINT IF EXISTS encounter_presentation_encounter_id_presentation_id_key;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE encounter_presentation DROP CONSTRAINT IF EXISTS encounter_presentation_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE encounter_product DROP CONSTRAINT IF EXISTS encounter_product_encounter_id_product_id_key;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE encounter_product DROP CONSTRAINT IF EXISTS encounter_product_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE endo_intake DROP CONSTRAINT IF EXISTS endo_intake_patient_id_key;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE endo_intake DROP CONSTRAINT IF EXISTS endo_intake_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE event_attendee DROP CONSTRAINT IF EXISTS event_attendee_event_id_attendee_type_attendee_id_key;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE event_attendee DROP CONSTRAINT IF EXISTS event_attendee_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE event DROP CONSTRAINT IF EXISTS event_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE file_attachment DROP CONSTRAINT IF EXISTS file_attachment_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE i18n_overrides DROP CONSTRAINT IF EXISTS i18n_overrides_locale_key_key;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE i18n_overrides DROP CONSTRAINT IF EXISTS i18n_overrides_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE identities DROP CONSTRAINT IF EXISTS identities_email_key;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE identities DROP CONSTRAINT IF EXISTS identities_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE invite_tokens DROP CONSTRAINT IF EXISTS invite_tokens_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE invite_tokens DROP CONSTRAINT IF EXISTS invite_tokens_token_hash_key;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE kpi_snapshot DROP CONSTRAINT IF EXISTS kpi_snapshot_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE lead DROP CONSTRAINT IF EXISTS lead_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE lookup DROP CONSTRAINT IF EXISTS lookup_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE lookup DROP CONSTRAINT IF EXISTS lookup_type_key_locale_key;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE magic_link_tokens DROP CONSTRAINT IF EXISTS magic_link_tokens_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE magic_link_tokens DROP CONSTRAINT IF EXISTS magic_link_tokens_token_hash_key;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE medical_history_questionnaire DROP CONSTRAINT IF EXISTS medical_history_questionnaire_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE message DROP CONSTRAINT IF EXISTS message_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS user_roles_role_territory_key;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE note DROP CONSTRAINT IF EXISTS note_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE notification_delivery DROP CONSTRAINT IF EXISTS notification_delivery_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE notification DROP CONSTRAINT IF EXISTS notification_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE oral_exam DROP CONSTRAINT IF EXISTS oral_exam_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE organization DROP CONSTRAINT IF EXISTS organization_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE partner_link DROP CONSTRAINT IF EXISTS partner_link_partner_entity_type_entity_id_key;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE partner_link DROP CONSTRAINT IF EXISTS partner_link_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE partner_transaction DROP CONSTRAINT IF EXISTS partner_transaction_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE password_reset_tokens DROP CONSTRAINT IF EXISTS password_reset_tokens_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE patient DROP CONSTRAINT IF EXISTS patient_google_sub_key;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE patient DROP CONSTRAINT IF EXISTS patient_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE patient_webauthn_credentials DROP CONSTRAINT IF EXISTS patient_webauthn_credentials_credential_id_key;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE patient_webauthn_credentials DROP CONSTRAINT IF EXISTS patient_webauthn_credentials_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE practitioner_assignment DROP CONSTRAINT IF EXISTS practitioner_assignment_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE practitioner_assignment DROP CONSTRAINT IF EXISTS practitioner_assignment_practitioner_id_user_id_key;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE practitioner_organization DROP CONSTRAINT IF EXISTS practitioner_organization_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE practitioner_organization DROP CONSTRAINT IF EXISTS practitioner_organization_practitioner_id_organization_id_key;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE practitioner DROP CONSTRAINT IF EXISTS practitioner_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE presentation DROP CONSTRAINT IF EXISTS presentation_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE product DROP CONSTRAINT IF EXISTS product_code_key;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE product DROP CONSTRAINT IF EXISTS product_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE purchase_order_item DROP CONSTRAINT IF EXISTS purchase_order_item_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE purchase_order DROP CONSTRAINT IF EXISTS purchase_order_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE purchase_order DROP CONSTRAINT IF EXISTS purchase_order_stripe_payment_intent_id_key;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE push_subscription DROP CONSTRAINT IF EXISTS push_subscription_endpoint_key;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE push_subscription DROP CONSTRAINT IF EXISTS push_subscription_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE questionnaire_request DROP CONSTRAINT IF EXISTS questionnaire_request_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE questionnaire_request DROP CONSTRAINT IF EXISTS questionnaire_request_token_hash_key;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE remember_me_tokens DROP CONSTRAINT IF EXISTS remember_me_tokens_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE remember_me_tokens DROP CONSTRAINT IF EXISTS remember_me_tokens_token_hash_key;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE request_log DROP CONSTRAINT IF EXISTS request_log_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE request_log DROP CONSTRAINT IF EXISTS request_log_request_id_key;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE sample_batch DROP CONSTRAINT IF EXISTS sample_batch_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE sample_batch DROP CONSTRAINT IF EXISTS sample_batch_product_id_lot_number_key;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE sample_request DROP CONSTRAINT IF EXISTS sample_request_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE sample_stock DROP CONSTRAINT IF EXISTS sample_stock_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE sample_stock DROP CONSTRAINT IF EXISTS sample_stock_user_id_product_id_key;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE sample_transaction DROP CONSTRAINT IF EXISTS sample_transaction_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE segment_member DROP CONSTRAINT IF EXISTS segment_member_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE segment DROP CONSTRAINT IF EXISTS segment_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE sleep_study DROP CONSTRAINT IF EXISTS sleep_study_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE stop_bang_screening DROP CONSTRAINT IF EXISTS stop_bang_screening_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE supplier DROP CONSTRAINT IF EXISTS supplier_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE support_ticket DROP CONSTRAINT IF EXISTS support_ticket_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE sync_queue DROP CONSTRAINT IF EXISTS sync_queue_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE target DROP CONSTRAINT IF EXISTS target_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE target DROP CONSTRAINT IF EXISTS target_user_id_territory_id_period_metric_key;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE territory DROP CONSTRAINT IF EXISTS territory_code_key;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE territory DROP CONSTRAINT IF EXISTS territory_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE territory_user DROP CONSTRAINT IF EXISTS territory_user_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE training_course DROP CONSTRAINT IF EXISTS training_course_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE training_lesson DROP CONSTRAINT IF EXISTS training_lesson_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE training_progress DROP CONSTRAINT IF EXISTS training_progress_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE training_progress DROP CONSTRAINT IF EXISTS training_progress_user_id_lesson_id_key;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE treatment_plan DROP CONSTRAINT IF EXISTS treatment_plan_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS user_roles_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE user_session DROP CONSTRAINT IF EXISTS user_session_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE users DROP CONSTRAINT IF EXISTS users_google_sub_key;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE users DROP CONSTRAINT IF EXISTS users_identity_id_key;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE users DROP CONSTRAINT IF EXISTS users_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE visit_plan DROP CONSTRAINT IF EXISTS visit_plan_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE webauthn_credentials DROP CONSTRAINT IF EXISTS webauthn_credentials_credential_id_key;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE webauthn_credentials DROP CONSTRAINT IF EXISTS webauthn_credentials_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE webhook_event DROP CONSTRAINT IF EXISTS webhook_event_pkey;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE webhook_event DROP CONSTRAINT IF EXISTS webhook_event_source_external_id_key;$tenant_ddl$;

  -- Phase 3: re-add constraints (keys first — foreign keys depend on them)
  EXECUTE $tenant_ddl$ALTER TABLE ai_generation_log
    ADD CONSTRAINT ai_generation_log_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE ai_insight
    ADD CONSTRAINT ai_insight_entity_type_entity_id_metric_key UNIQUE (entity_type, entity_id, metric);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE ai_insight
    ADD CONSTRAINT ai_insight_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE app_config
    ADD CONSTRAINT app_config_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE app_config
    ADD CONSTRAINT app_config_singleton_key UNIQUE (singleton);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE consent
    ADD CONSTRAINT consent_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE conversation
    ADD CONSTRAINT conversation_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE conversation
    ADD CONSTRAINT conversation_user_id_contact_type_contact_id_channel_key UNIQUE (user_id, contact_type, contact_id, channel);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE efpia_disclosure
    ADD CONSTRAINT efpia_disclosure_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE efpia_disclosure
    ADD CONSTRAINT efpia_disclosure_practitioner_id_year_key UNIQUE (practitioner_id, year);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE encounter
    ADD CONSTRAINT encounter_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE encounter_presentation
    ADD CONSTRAINT encounter_presentation_encounter_id_presentation_id_key UNIQUE (encounter_id, presentation_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE encounter_presentation
    ADD CONSTRAINT encounter_presentation_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE encounter_product
    ADD CONSTRAINT encounter_product_encounter_id_product_id_key UNIQUE (encounter_id, product_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE encounter_product
    ADD CONSTRAINT encounter_product_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE endo_intake
    ADD CONSTRAINT endo_intake_patient_id_key UNIQUE (patient_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE endo_intake
    ADD CONSTRAINT endo_intake_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE event_attendee
    ADD CONSTRAINT event_attendee_event_id_attendee_type_attendee_id_key UNIQUE (event_id, attendee_type, attendee_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE event_attendee
    ADD CONSTRAINT event_attendee_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE event
    ADD CONSTRAINT event_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE file_attachment
    ADD CONSTRAINT file_attachment_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE i18n_overrides
    ADD CONSTRAINT i18n_overrides_locale_key_key UNIQUE (locale, key);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE i18n_overrides
    ADD CONSTRAINT i18n_overrides_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE identities
    ADD CONSTRAINT identities_email_key UNIQUE (email);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE identities
    ADD CONSTRAINT identities_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE invite_tokens
    ADD CONSTRAINT invite_tokens_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE invite_tokens
    ADD CONSTRAINT invite_tokens_token_hash_key UNIQUE (token_hash);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE kpi_snapshot
    ADD CONSTRAINT kpi_snapshot_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE lead
    ADD CONSTRAINT lead_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE lookup
    ADD CONSTRAINT lookup_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE lookup
    ADD CONSTRAINT lookup_type_key_locale_key UNIQUE (type, key, locale);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE magic_link_tokens
    ADD CONSTRAINT magic_link_tokens_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE magic_link_tokens
    ADD CONSTRAINT magic_link_tokens_token_hash_key UNIQUE (token_hash);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE medical_history_questionnaire
    ADD CONSTRAINT medical_history_questionnaire_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE message
    ADD CONSTRAINT message_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE user_roles
    ADD CONSTRAINT user_roles_role_territory_key UNIQUE (user_id, role, territory_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE note
    ADD CONSTRAINT note_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE notification_delivery
    ADD CONSTRAINT notification_delivery_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE notification
    ADD CONSTRAINT notification_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE oral_exam
    ADD CONSTRAINT oral_exam_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE organization
    ADD CONSTRAINT organization_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE partner_link
    ADD CONSTRAINT partner_link_partner_entity_type_entity_id_key UNIQUE (partner, entity_type, entity_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE partner_link
    ADD CONSTRAINT partner_link_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE partner_transaction
    ADD CONSTRAINT partner_transaction_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE patient
    ADD CONSTRAINT patient_google_sub_key UNIQUE (google_sub);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE patient
    ADD CONSTRAINT patient_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE patient_webauthn_credentials
    ADD CONSTRAINT patient_webauthn_credentials_credential_id_key UNIQUE (credential_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE patient_webauthn_credentials
    ADD CONSTRAINT patient_webauthn_credentials_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE practitioner_assignment
    ADD CONSTRAINT practitioner_assignment_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE practitioner_assignment
    ADD CONSTRAINT practitioner_assignment_practitioner_id_user_id_key UNIQUE (practitioner_id, user_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE practitioner_organization
    ADD CONSTRAINT practitioner_organization_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE practitioner_organization
    ADD CONSTRAINT practitioner_organization_practitioner_id_organization_id_key UNIQUE (practitioner_id, organization_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE practitioner
    ADD CONSTRAINT practitioner_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE presentation
    ADD CONSTRAINT presentation_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE product
    ADD CONSTRAINT product_code_key UNIQUE (code);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE product
    ADD CONSTRAINT product_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE purchase_order_item
    ADD CONSTRAINT purchase_order_item_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE purchase_order
    ADD CONSTRAINT purchase_order_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE purchase_order
    ADD CONSTRAINT purchase_order_stripe_payment_intent_id_key UNIQUE (stripe_payment_intent_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE push_subscription
    ADD CONSTRAINT push_subscription_endpoint_key UNIQUE (endpoint);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE push_subscription
    ADD CONSTRAINT push_subscription_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE questionnaire_request
    ADD CONSTRAINT questionnaire_request_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE questionnaire_request
    ADD CONSTRAINT questionnaire_request_token_hash_key UNIQUE (token_hash);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE remember_me_tokens
    ADD CONSTRAINT remember_me_tokens_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE remember_me_tokens
    ADD CONSTRAINT remember_me_tokens_token_hash_key UNIQUE (token_hash);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE request_log
    ADD CONSTRAINT request_log_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE request_log
    ADD CONSTRAINT request_log_request_id_key UNIQUE (request_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE sample_batch
    ADD CONSTRAINT sample_batch_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE sample_batch
    ADD CONSTRAINT sample_batch_product_id_lot_number_key UNIQUE (product_id, lot_number);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE sample_request
    ADD CONSTRAINT sample_request_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE sample_stock
    ADD CONSTRAINT sample_stock_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE sample_stock
    ADD CONSTRAINT sample_stock_user_id_product_id_key UNIQUE (user_id, product_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE sample_transaction
    ADD CONSTRAINT sample_transaction_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE segment_member
    ADD CONSTRAINT segment_member_pkey PRIMARY KEY (segment_id, entity_type, entity_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE segment
    ADD CONSTRAINT segment_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE sleep_study
    ADD CONSTRAINT sleep_study_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE stop_bang_screening
    ADD CONSTRAINT stop_bang_screening_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE supplier
    ADD CONSTRAINT supplier_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE support_ticket
    ADD CONSTRAINT support_ticket_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE sync_queue
    ADD CONSTRAINT sync_queue_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE target
    ADD CONSTRAINT target_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE target
    ADD CONSTRAINT target_user_id_territory_id_period_metric_key UNIQUE (user_id, territory_id, period, metric);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE territory
    ADD CONSTRAINT territory_code_key UNIQUE (code);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE territory
    ADD CONSTRAINT territory_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE territory_user
    ADD CONSTRAINT territory_user_pkey PRIMARY KEY (territory_id, user_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE training_course
    ADD CONSTRAINT training_course_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE training_lesson
    ADD CONSTRAINT training_lesson_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE training_progress
    ADD CONSTRAINT training_progress_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE training_progress
    ADD CONSTRAINT training_progress_user_id_lesson_id_key UNIQUE (user_id, lesson_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE treatment_plan
    ADD CONSTRAINT treatment_plan_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE user_session
    ADD CONSTRAINT user_session_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE users
    ADD CONSTRAINT users_google_sub_key UNIQUE (google_sub);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE users
    ADD CONSTRAINT users_identity_id_key UNIQUE (identity_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE visit_plan
    ADD CONSTRAINT visit_plan_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE webauthn_credentials
    ADD CONSTRAINT webauthn_credentials_credential_id_key UNIQUE (credential_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE webauthn_credentials
    ADD CONSTRAINT webauthn_credentials_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE webhook_event
    ADD CONSTRAINT webhook_event_pkey PRIMARY KEY (id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE webhook_event
    ADD CONSTRAINT webhook_event_source_external_id_key UNIQUE (source, external_id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE ai_generation_log
    ADD CONSTRAINT ai_generation_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE audit_log
    ADD CONSTRAINT audit_log_session_id_fkey FOREIGN KEY (session_id) REFERENCES user_session(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE audit_log
    ADD CONSTRAINT audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE consent
    ADD CONSTRAINT consent_collected_by_fkey FOREIGN KEY (collected_by) REFERENCES users(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE conversation
    ADD CONSTRAINT conversation_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE efpia_disclosure
    ADD CONSTRAINT efpia_disclosure_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE efpia_disclosure
    ADD CONSTRAINT efpia_disclosure_practitioner_id_fkey FOREIGN KEY (practitioner_id) REFERENCES practitioner(id) ON DELETE RESTRICT;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE encounter
    ADD CONSTRAINT encounter_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE encounter
    ADD CONSTRAINT encounter_practitioner_id_fkey FOREIGN KEY (practitioner_id) REFERENCES practitioner(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE encounter_presentation
    ADD CONSTRAINT encounter_presentation_encounter_id_fkey FOREIGN KEY (encounter_id) REFERENCES encounter(id) ON DELETE CASCADE;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE encounter_presentation
    ADD CONSTRAINT encounter_presentation_presentation_id_fkey FOREIGN KEY (presentation_id) REFERENCES presentation(id) ON DELETE CASCADE;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE encounter_product
    ADD CONSTRAINT encounter_product_encounter_id_fkey FOREIGN KEY (encounter_id) REFERENCES encounter(id) ON DELETE CASCADE;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE encounter_product
    ADD CONSTRAINT encounter_product_product_id_fkey FOREIGN KEY (product_id) REFERENCES product(id) ON DELETE CASCADE;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE encounter
    ADD CONSTRAINT encounter_territory_id_fkey FOREIGN KEY (territory_id) REFERENCES territory(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE encounter
    ADD CONSTRAINT encounter_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE endo_intake
    ADD CONSTRAINT endo_intake_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patient(id) ON DELETE CASCADE;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE endo_intake
    ADD CONSTRAINT endo_intake_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE event_attendee
    ADD CONSTRAINT event_attendee_event_id_fkey FOREIGN KEY (event_id) REFERENCES event(id) ON DELETE CASCADE;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE event
    ADD CONSTRAINT event_territory_id_fkey FOREIGN KEY (territory_id) REFERENCES territory(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE file_attachment
    ADD CONSTRAINT file_attachment_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE invite_tokens
    ADD CONSTRAINT invite_tokens_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE invite_tokens
    ADD CONSTRAINT invite_tokens_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES lead(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE invite_tokens
    ADD CONSTRAINT invite_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE lead
    ADD CONSTRAINT lead_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE lead
    ADD CONSTRAINT lead_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES identities(id) ON DELETE CASCADE;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE lookup
    ADD CONSTRAINT lookup_global_id_fkey FOREIGN KEY (global_id) REFERENCES platform.lookups(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE medical_history_questionnaire
    ADD CONSTRAINT medical_history_questionnaire_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patient(id) ON DELETE CASCADE;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE medical_history_questionnaire
    ADD CONSTRAINT medical_history_questionnaire_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE medical_history_questionnaire
    ADD CONSTRAINT medical_history_questionnaire_request_id_fkey FOREIGN KEY (request_id) REFERENCES questionnaire_request(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE message
    ADD CONSTRAINT message_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversation(id) ON DELETE CASCADE;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE identities
    ADD CONSTRAINT identities_territory_fk FOREIGN KEY (territory_id) REFERENCES territory(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE notification
    ADD CONSTRAINT notification_identity_fk FOREIGN KEY (identity_id) REFERENCES identities(id) ON DELETE CASCADE;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE purchase_order_item
    ADD CONSTRAINT pitem_product_fk FOREIGN KEY (product_id) REFERENCES product(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE sleep_study
    ADD CONSTRAINT study_order_fk FOREIGN KEY (purchase_order_id) REFERENCES purchase_order(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE support_ticket
    ADD CONSTRAINT ticket_conv_fk FOREIGN KEY (conversation_id) REFERENCES conversation(id) ON DELETE CASCADE;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE treatment_plan
    ADD CONSTRAINT treatment_plan_sleep_study_fkey FOREIGN KEY (sleep_study_id) REFERENCES sleep_study(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE treatment_plan
    ADD CONSTRAINT tx_product_fk FOREIGN KEY (device_product_id) REFERENCES product(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE treatment_plan
    ADD CONSTRAINT tx_purchase_order_fk FOREIGN KEY (device_purchase_order_id) REFERENCES purchase_order(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE note
    ADD CONSTRAINT note_author_id_fkey FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE notification_delivery
    ADD CONSTRAINT notification_delivery_notification_id_fkey FOREIGN KEY (notification_id) REFERENCES notification(id) ON DELETE CASCADE;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE notification
    ADD CONSTRAINT notification_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES identities(id) ON DELETE CASCADE;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE oral_exam
    ADD CONSTRAINT oral_exam_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patient(id) ON DELETE CASCADE;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE oral_exam
    ADD CONSTRAINT oral_exam_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE organization
    ADD CONSTRAINT organization_territory_id_fkey FOREIGN KEY (territory_id) REFERENCES territory(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE partner_transaction
    ADD CONSTRAINT partner_transaction_partner_link_id_fkey FOREIGN KEY (partner_link_id) REFERENCES partner_link(id) ON DELETE CASCADE;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE patient
    ADD CONSTRAINT patient_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES identities(id) ON DELETE CASCADE;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE patient
    ADD CONSTRAINT patient_practitioner_id_fkey FOREIGN KEY (practitioner_id) REFERENCES practitioner(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE patient_webauthn_credentials
    ADD CONSTRAINT patient_webauthn_credentials_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patient(id) ON DELETE CASCADE;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE practitioner_assignment
    ADD CONSTRAINT practitioner_assignment_practitioner_id_fkey FOREIGN KEY (practitioner_id) REFERENCES practitioner(id) ON DELETE CASCADE;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE practitioner_assignment
    ADD CONSTRAINT practitioner_assignment_primary_org_id_fkey FOREIGN KEY (primary_org_id) REFERENCES organization(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE practitioner_assignment
    ADD CONSTRAINT practitioner_assignment_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE practitioner
    ADD CONSTRAINT practitioner_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES identities(id) ON DELETE CASCADE;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE practitioner
    ADD CONSTRAINT practitioner_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE practitioner_organization
    ADD CONSTRAINT practitioner_organization_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE practitioner_organization
    ADD CONSTRAINT practitioner_organization_practitioner_id_fkey FOREIGN KEY (practitioner_id) REFERENCES practitioner(id) ON DELETE CASCADE;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE presentation
    ADD CONSTRAINT presentation_product_id_fkey FOREIGN KEY (product_id) REFERENCES product(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE presentation
    ADD CONSTRAINT presentation_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE purchase_order_item
    ADD CONSTRAINT purchase_order_item_fulfillment_supplier_id_fkey FOREIGN KEY (fulfillment_supplier_id) REFERENCES supplier(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE purchase_order_item
    ADD CONSTRAINT purchase_order_item_order_id_fkey FOREIGN KEY (order_id) REFERENCES purchase_order(id) ON DELETE CASCADE;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE purchase_order
    ADD CONSTRAINT purchase_order_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patient(id) ON DELETE RESTRICT;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE push_subscription
    ADD CONSTRAINT push_subscription_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE questionnaire_request
    ADD CONSTRAINT questionnaire_request_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE questionnaire_request
    ADD CONSTRAINT questionnaire_request_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patient(id) ON DELETE CASCADE;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE remember_me_tokens
    ADD CONSTRAINT remember_me_tokens_replaced_by_id_fkey FOREIGN KEY (replaced_by_id) REFERENCES remember_me_tokens(id);$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE remember_me_tokens
    ADD CONSTRAINT remember_me_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE request_log
    ADD CONSTRAINT request_log_session_id_fkey FOREIGN KEY (session_id) REFERENCES user_session(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE request_log
    ADD CONSTRAINT request_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE sample_batch
    ADD CONSTRAINT sample_batch_product_id_fkey FOREIGN KEY (product_id) REFERENCES product(id) ON DELETE RESTRICT;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE sample_batch
    ADD CONSTRAINT sample_batch_received_by_fkey FOREIGN KEY (received_by) REFERENCES users(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE sample_request
    ADD CONSTRAINT sample_request_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE sample_request
    ADD CONSTRAINT sample_request_product_id_fkey FOREIGN KEY (product_id) REFERENCES product(id) ON DELETE RESTRICT;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE sample_request
    ADD CONSTRAINT sample_request_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE sample_stock
    ADD CONSTRAINT sample_stock_product_id_fkey FOREIGN KEY (product_id) REFERENCES product(id) ON DELETE RESTRICT;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE sample_stock
    ADD CONSTRAINT sample_stock_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE sample_transaction
    ADD CONSTRAINT sample_transaction_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES sample_batch(id) ON DELETE RESTRICT;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE sample_transaction
    ADD CONSTRAINT sample_transaction_encounter_id_fkey FOREIGN KEY (encounter_id) REFERENCES encounter(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE sample_transaction
    ADD CONSTRAINT sample_transaction_practitioner_id_fkey FOREIGN KEY (practitioner_id) REFERENCES practitioner(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE sample_transaction
    ADD CONSTRAINT sample_transaction_product_id_fkey FOREIGN KEY (product_id) REFERENCES product(id) ON DELETE RESTRICT;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE sample_transaction
    ADD CONSTRAINT sample_transaction_to_user_id_fkey FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE sample_transaction
    ADD CONSTRAINT sample_transaction_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE segment
    ADD CONSTRAINT segment_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE segment_member
    ADD CONSTRAINT segment_member_segment_id_fkey FOREIGN KEY (segment_id) REFERENCES segment(id) ON DELETE CASCADE;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE sleep_study
    ADD CONSTRAINT sleep_study_interpreted_by_fkey FOREIGN KEY (interpreted_by) REFERENCES practitioner(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE sleep_study
    ADD CONSTRAINT sleep_study_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patient(id) ON DELETE CASCADE;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE sleep_study
    ADD CONSTRAINT sleep_study_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES supplier(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE stop_bang_screening
    ADD CONSTRAINT stop_bang_screening_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patient(id) ON DELETE CASCADE;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE stop_bang_screening
    ADD CONSTRAINT stop_bang_screening_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE stop_bang_screening
    ADD CONSTRAINT stop_bang_screening_request_id_fkey FOREIGN KEY (request_id) REFERENCES questionnaire_request(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE support_ticket
    ADD CONSTRAINT support_ticket_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE support_ticket
    ADD CONSTRAINT support_ticket_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patient(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE sync_queue
    ADD CONSTRAINT sync_queue_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE target
    ADD CONSTRAINT target_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE target
    ADD CONSTRAINT target_set_by_fkey FOREIGN KEY (set_by) REFERENCES users(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE target
    ADD CONSTRAINT target_territory_id_fkey FOREIGN KEY (territory_id) REFERENCES territory(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE target
    ADD CONSTRAINT target_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE territory
    ADD CONSTRAINT territory_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES territory(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE territory_user
    ADD CONSTRAINT territory_user_territory_id_fkey FOREIGN KEY (territory_id) REFERENCES territory(id) ON DELETE CASCADE;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE territory_user
    ADD CONSTRAINT territory_user_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE training_lesson
    ADD CONSTRAINT training_lesson_course_id_fkey FOREIGN KEY (course_id) REFERENCES training_course(id) ON DELETE CASCADE;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE training_progress
    ADD CONSTRAINT training_progress_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES training_lesson(id) ON DELETE CASCADE;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE training_progress
    ADD CONSTRAINT training_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE treatment_plan
    ADD CONSTRAINT treatment_plan_appliance_supplier_id_fkey FOREIGN KEY (appliance_supplier_id) REFERENCES supplier(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE treatment_plan
    ADD CONSTRAINT treatment_plan_dentist_id_fkey FOREIGN KEY (dentist_id) REFERENCES practitioner(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE treatment_plan
    ADD CONSTRAINT treatment_plan_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patient(id) ON DELETE CASCADE;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE treatment_plan
    ADD CONSTRAINT treatment_plan_recommended_by_fkey FOREIGN KEY (recommended_by) REFERENCES practitioner(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE treatment_plan
    ADD CONSTRAINT treatment_plan_scan_supplier_id_fkey FOREIGN KEY (scan_supplier_id) REFERENCES supplier(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE user_roles
    ADD CONSTRAINT user_roles_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE user_roles
    ADD CONSTRAINT user_roles_territory_id_fkey FOREIGN KEY (territory_id) REFERENCES territory(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE user_session
    ADD CONSTRAINT user_session_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE users
    ADD CONSTRAINT users_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES identities(id) ON DELETE CASCADE;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE users
    ADD CONSTRAINT users_manager_id_fkey FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE visit_plan
    ADD CONSTRAINT visit_plan_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE visit_plan
    ADD CONSTRAINT visit_plan_practitioner_id_fkey FOREIGN KEY (practitioner_id) REFERENCES practitioner(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE visit_plan
    ADD CONSTRAINT visit_plan_territory_id_fkey FOREIGN KEY (territory_id) REFERENCES territory(id) ON DELETE SET NULL;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE visit_plan
    ADD CONSTRAINT visit_plan_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;$tenant_ddl$;

  EXECUTE $tenant_ddl$ALTER TABLE webauthn_credentials
    ADD CONSTRAINT webauthn_credentials_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;$tenant_ddl$;

END;
$$;
