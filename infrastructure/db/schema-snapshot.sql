-- =============================================================================
-- Schema snapshot — schema-only pg_dump of the live Supabase DB (platform,
-- neosleep, fourseasons schemas), taken 2026-07-13.
--
-- NOT an incremental migration and NOT run automatically — db/migrations.ts
-- only picks up files in apps/api/migrations/, this file lives outside that
-- folder on purpose. This is ground truth: it reflects what the live DB
-- actually looks like right now, which is ahead of apps/api/migrations/
-- 000-003 (those only define ~30 of the ~57 tables that actually exist —
-- history was lost somewhere in the services/ -> apps/ reorg).
--
-- Use this to:
--   - Stand up a fresh Postgres/Supabase instance that matches production
--     exactly: psql "$DATABASE_URL" -f infrastructure/db/schema-snapshot.sql
--   - See what's really in the DB without cross-referencing 4 migration files
--
-- Regenerate after a schema change:
--   pg_dump "$DATABASE_URL" --schema-only --no-owner --no-privileges \
--     --schema=platform --schema=neosleep --schema=fourseasons \
--     -f infrastructure/db/schema-snapshot.sql
-- (pg_dump/psql via: brew install libpq, then use /opt/homebrew/opt/libpq/bin/)
-- =============================================================================

\restrict 2cb7Zjsa1qZ3Gbn20eL7tv6m5hGfcUHh6zbdlTVAKl4ZTeyEYM7JBG2fxRWI69n

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: fourseasons; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA fourseasons;


--
-- Name: neosleep; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA neosleep;


--
-- Name: platform; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA platform;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: ai_generation_log; Type: TABLE; Schema: fourseasons; Owner: -
--

CREATE TABLE fourseasons.ai_generation_log (
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
);


--
-- Name: ai_insight; Type: TABLE; Schema: fourseasons; Owner: -
--

CREATE TABLE fourseasons.ai_insight (
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
);


--
-- Name: app_config; Type: TABLE; Schema: fourseasons; Owner: -
--

CREATE TABLE fourseasons.app_config (
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
);


--
-- Name: audit_log; Type: TABLE; Schema: fourseasons; Owner: -
--

CREATE TABLE fourseasons.audit_log (
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
);


--
-- Name: consent; Type: TABLE; Schema: fourseasons; Owner: -
--

CREATE TABLE fourseasons.consent (
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
    CONSTRAINT consent_entity_type_check CHECK ((entity_type = ANY (ARRAY['practitioner'::text, 'patient'::text, 'lead'::text]))),
    CONSTRAINT consent_legal_basis_check CHECK ((legal_basis = ANY (ARRAY['consent'::text, 'legitimate_interest'::text, 'contract'::text, 'legal_obligation'::text])))
);


--
-- Name: conversation; Type: TABLE; Schema: fourseasons; Owner: -
--

CREATE TABLE fourseasons.conversation (
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
);


--
-- Name: efpia_disclosure; Type: TABLE; Schema: fourseasons; Owner: -
--

CREATE TABLE fourseasons.efpia_disclosure (
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
);


--
-- Name: encounter; Type: TABLE; Schema: fourseasons; Owner: -
--

CREATE TABLE fourseasons.encounter (
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
);


--
-- Name: encounter_presentation; Type: TABLE; Schema: fourseasons; Owner: -
--

CREATE TABLE fourseasons.encounter_presentation (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    encounter_id uuid NOT NULL,
    presentation_id uuid NOT NULL,
    opened_at timestamp with time zone,
    closed_at timestamp with time zone,
    metadata jsonb,
    slide_views jsonb
);


--
-- Name: encounter_product; Type: TABLE; Schema: fourseasons; Owner: -
--

CREATE TABLE fourseasons.encounter_product (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    encounter_id uuid NOT NULL,
    product_id uuid NOT NULL,
    discussed boolean DEFAULT true NOT NULL,
    sampled boolean DEFAULT false NOT NULL,
    notes text,
    metadata jsonb
);


--
-- Name: event; Type: TABLE; Schema: fourseasons; Owner: -
--

CREATE TABLE fourseasons.event (
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
);


--
-- Name: event_attendee; Type: TABLE; Schema: fourseasons; Owner: -
--

CREATE TABLE fourseasons.event_attendee (
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
);


--
-- Name: file_attachment; Type: TABLE; Schema: fourseasons; Owner: -
--

CREATE TABLE fourseasons.file_attachment (
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
);


--
-- Name: i18n_overrides; Type: TABLE; Schema: fourseasons; Owner: -
--

CREATE TABLE fourseasons.i18n_overrides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    locale text NOT NULL,
    key text NOT NULL,
    value text NOT NULL,
    metadata jsonb,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: identities; Type: TABLE; Schema: fourseasons; Owner: -
--

CREATE TABLE fourseasons.identities (
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
    CONSTRAINT identities_gender_check CHECK ((gender = ANY (ARRAY['male'::text, 'female'::text, 'other'::text, 'prefer_not_to_say'::text, NULL::text])))
);


--
-- Name: kpi_snapshot; Type: TABLE; Schema: fourseasons; Owner: -
--

CREATE TABLE fourseasons.kpi_snapshot (
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
);


--
-- Name: lead; Type: TABLE; Schema: fourseasons; Owner: -
--

CREATE TABLE fourseasons.lead (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    identity_id uuid NOT NULL,
    source text,
    status text DEFAULT 'new'::text NOT NULL,
    country_code text,
    region text DEFAULT ''::text NOT NULL,
    territory_id uuid,
    assigned_to uuid,
    converted_to_id uuid,
    converted_to_type text,
    converted_at timestamp with time zone,
    metadata jsonb,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lead_converted_to_type_check CHECK ((converted_to_type = ANY (ARRAY['practitioner'::text, 'organization'::text, NULL::text]))),
    CONSTRAINT lead_status_check CHECK ((status = ANY (ARRAY['new'::text, 'contacted'::text, 'qualified'::text, 'inactive'::text, 'converted'::text])))
);


--
-- Name: lookup; Type: TABLE; Schema: fourseasons; Owner: -
--

CREATE TABLE fourseasons.lookup (
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
);


--
-- Name: magic_link_tokens; Type: TABLE; Schema: fourseasons; Owner: -
--

CREATE TABLE fourseasons.magic_link_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT magic_link_tokens_entity_type_check CHECK ((entity_type = ANY (ARRAY['practitioner'::text, 'patient'::text])))
);


--
-- Name: message; Type: TABLE; Schema: fourseasons; Owner: -
--

CREATE TABLE fourseasons.message (
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
);


--
-- Name: notification; Type: TABLE; Schema: fourseasons; Owner: -
--

CREATE TABLE fourseasons.notification (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    channel text DEFAULT 'in_app'::text NOT NULL,
    title text NOT NULL,
    body text,
    entity_type text,
    entity_id uuid,
    action_url text,
    read_at timestamp with time zone,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notification_channel_check CHECK ((channel = ANY (ARRAY['in_app'::text, 'push'::text, 'email'::text, 'sms'::text])))
);


--
-- Name: organization; Type: TABLE; Schema: fourseasons; Owner: -
--

CREATE TABLE fourseasons.organization (
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
    status text DEFAULT 'active'::text NOT NULL,
    metadata jsonb,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT organization_status_check CHECK ((status = ANY (ARRAY['pending_approval'::text, 'active'::text, 'inactive'::text]))),
    CONSTRAINT organization_type_check CHECK ((type = ANY (ARRAY['clinic'::text, 'hospital'::text, 'pharmacy'::text, 'practice'::text, 'other'::text])))
);


--
-- Name: password_reset_tokens; Type: TABLE; Schema: fourseasons; Owner: -
--

CREATE TABLE fourseasons.password_reset_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: patient; Type: TABLE; Schema: fourseasons; Owner: -
--

CREATE TABLE fourseasons.patient (
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
    country_code text,
    region text,
    territory_id uuid,
    status text DEFAULT 'active'::text NOT NULL,
    data_consent_at timestamp with time zone,
    data_consent_withdrawn_at timestamp with time zone,
    metadata jsonb,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT patient_status_check CHECK ((status = ANY (ARRAY['active'::text, 'follow_up'::text, 'discharged'::text])))
);


--
-- Name: patient_webauthn_credentials; Type: TABLE; Schema: fourseasons; Owner: -
--

CREATE TABLE fourseasons.patient_webauthn_credentials (
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
);


--
-- Name: practitioner; Type: TABLE; Schema: fourseasons; Owner: -
--

CREATE TABLE fourseasons.practitioner (
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
    country_code text,
    region text,
    territory_id uuid,
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
    CONSTRAINT practitioner_status_check CHECK ((status = ANY (ARRAY['pending_approval'::text, 'active'::text, 'inactive'::text])))
);


--
-- Name: practitioner_assignment; Type: TABLE; Schema: fourseasons; Owner: -
--

CREATE TABLE fourseasons.practitioner_assignment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    practitioner_id uuid NOT NULL,
    user_id uuid NOT NULL,
    primary_org_id uuid,
    relationship_notes text,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: practitioner_organization; Type: TABLE; Schema: fourseasons; Owner: -
--

CREATE TABLE fourseasons.practitioner_organization (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    practitioner_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    role text,
    is_primary boolean DEFAULT false NOT NULL,
    valid_from date,
    valid_to date,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: presentation; Type: TABLE; Schema: fourseasons; Owner: -
--

CREATE TABLE fourseasons.presentation (
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
);


--
-- Name: product; Type: TABLE; Schema: fourseasons; Owner: -
--

CREATE TABLE fourseasons.product (
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
);


--
-- Name: purchase_order; Type: TABLE; Schema: fourseasons; Owner: -
--

CREATE TABLE fourseasons.purchase_order (
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
);


--
-- Name: purchase_order_item; Type: TABLE; Schema: fourseasons; Owner: -
--

CREATE TABLE fourseasons.purchase_order_item (
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
);


--
-- Name: push_subscription; Type: TABLE; Schema: fourseasons; Owner: -
--

CREATE TABLE fourseasons.push_subscription (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    user_agent text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: remember_me_tokens; Type: TABLE; Schema: fourseasons; Owner: -
--

CREATE TABLE fourseasons.remember_me_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    last_used_at timestamp with time zone,
    revoked_at timestamp with time zone,
    device_name text,
    user_agent text,
    ip_address inet,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: request_log; Type: TABLE; Schema: fourseasons; Owner: -
--

CREATE TABLE fourseasons.request_log (
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
);


--
-- Name: sample_batch; Type: TABLE; Schema: fourseasons; Owner: -
--

CREATE TABLE fourseasons.sample_batch (
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
);


--
-- Name: sample_request; Type: TABLE; Schema: fourseasons; Owner: -
--

CREATE TABLE fourseasons.sample_request (
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
);


--
-- Name: sample_stock; Type: TABLE; Schema: fourseasons; Owner: -
--

CREATE TABLE fourseasons.sample_stock (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    product_id uuid NOT NULL,
    quantity integer DEFAULT 0 NOT NULL,
    metadata jsonb,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sample_stock_quantity_check CHECK ((quantity >= 0))
);


--
-- Name: sample_transaction; Type: TABLE; Schema: fourseasons; Owner: -
--

CREATE TABLE fourseasons.sample_transaction (
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
);


--
-- Name: segment; Type: TABLE; Schema: fourseasons; Owner: -
--

CREATE TABLE fourseasons.segment (
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
);


--
-- Name: segment_member; Type: TABLE; Schema: fourseasons; Owner: -
--

CREATE TABLE fourseasons.segment_member (
    segment_id uuid NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    added_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb,
    CONSTRAINT segment_member_entity_type_check CHECK ((entity_type = ANY (ARRAY['practitioner'::text, 'patient'::text, 'lead'::text])))
);


--
-- Name: sleep_study; Type: TABLE; Schema: fourseasons; Owner: -
--

CREATE TABLE fourseasons.sleep_study (
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
    CONSTRAINT sleep_study_status_check CHECK ((status = ANY (ARRAY['ordered'::text, 'device_shipped'::text, 'device_delivered'::text, 'study_complete'::text, 'results_received'::text, 'interpreted'::text, 'cancelled'::text])))
);


--
-- Name: supplier; Type: TABLE; Schema: fourseasons; Owner: -
--

CREATE TABLE fourseasons.supplier (
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
);


--
-- Name: support_ticket; Type: TABLE; Schema: fourseasons; Owner: -
--

CREATE TABLE fourseasons.support_ticket (
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
);


--
-- Name: sync_queue; Type: TABLE; Schema: fourseasons; Owner: -
--

CREATE TABLE fourseasons.sync_queue (
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
);


--
-- Name: target; Type: TABLE; Schema: fourseasons; Owner: -
--

CREATE TABLE fourseasons.target (
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
);


--
-- Name: territory; Type: TABLE; Schema: fourseasons; Owner: -
--

CREATE TABLE fourseasons.territory (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    code text,
    country_code text NOT NULL,
    parent_id uuid,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: territory_user; Type: TABLE; Schema: fourseasons; Owner: -
--

CREATE TABLE fourseasons.territory_user (
    territory_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'rep'::text NOT NULL,
    valid_from date DEFAULT CURRENT_DATE NOT NULL,
    valid_to date,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT territory_user_role_check CHECK ((role = ANY (ARRAY['rep'::text, 'kam'::text, 'ffm'::text, 'msl'::text, 'backup'::text])))
);


--
-- Name: training_course; Type: TABLE; Schema: fourseasons; Owner: -
--

CREATE TABLE fourseasons.training_course (
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
);


--
-- Name: training_lesson; Type: TABLE; Schema: fourseasons; Owner: -
--

CREATE TABLE fourseasons.training_lesson (
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
);


--
-- Name: training_progress; Type: TABLE; Schema: fourseasons; Owner: -
--

CREATE TABLE fourseasons.training_progress (
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
);


--
-- Name: treatment_plan; Type: TABLE; Schema: fourseasons; Owner: -
--

CREATE TABLE fourseasons.treatment_plan (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    sleep_study_id uuid NOT NULL,
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
    CONSTRAINT treatment_plan_status_check CHECK ((status = ANY (ARRAY['initiated'::text, 'patient_notified'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text, 'on_hold'::text]))),
    CONSTRAINT treatment_plan_type_check CHECK ((type = ANY (ARRAY['cpap'::text, 'apap'::text, 'dental_appliance'::text, 'positional'::text, 'lifestyle'::text, 'watchful_waiting'::text])))
);


--
-- Name: user_roles; Type: TABLE; Schema: fourseasons; Owner: -
--

CREATE TABLE fourseasons.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role text NOT NULL,
    region text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_roles_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'ffm'::text, 'kam'::text, 'msl'::text, 'rep'::text])))
);


--
-- Name: user_session; Type: TABLE; Schema: fourseasons; Owner: -
--

CREATE TABLE fourseasons.user_session (
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
);


--
-- Name: users; Type: TABLE; Schema: fourseasons; Owner: -
--

CREATE TABLE fourseasons.users (
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
    country_code text,
    region text,
    territory_id uuid,
    status text DEFAULT 'active'::text NOT NULL,
    deleted_at timestamp with time zone,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT users_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'suspended'::text])))
);


--
-- Name: visit_plan; Type: TABLE; Schema: fourseasons; Owner: -
--

CREATE TABLE fourseasons.visit_plan (
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
);


--
-- Name: webauthn_credentials; Type: TABLE; Schema: fourseasons; Owner: -
--

CREATE TABLE fourseasons.webauthn_credentials (
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
);


--
-- Name: webhook_event; Type: TABLE; Schema: fourseasons; Owner: -
--

CREATE TABLE fourseasons.webhook_event (
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
);


--
-- Name: ai_generation_log; Type: TABLE; Schema: neosleep; Owner: -
--

CREATE TABLE neosleep.ai_generation_log (
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
);


--
-- Name: ai_insight; Type: TABLE; Schema: neosleep; Owner: -
--

CREATE TABLE neosleep.ai_insight (
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
);


--
-- Name: app_config; Type: TABLE; Schema: neosleep; Owner: -
--

CREATE TABLE neosleep.app_config (
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
);


--
-- Name: audit_log; Type: TABLE; Schema: neosleep; Owner: -
--

CREATE TABLE neosleep.audit_log (
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
);


--
-- Name: consent; Type: TABLE; Schema: neosleep; Owner: -
--

CREATE TABLE neosleep.consent (
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
    CONSTRAINT consent_entity_type_check CHECK ((entity_type = ANY (ARRAY['practitioner'::text, 'patient'::text, 'lead'::text]))),
    CONSTRAINT consent_legal_basis_check CHECK ((legal_basis = ANY (ARRAY['consent'::text, 'legitimate_interest'::text, 'contract'::text, 'legal_obligation'::text])))
);


--
-- Name: conversation; Type: TABLE; Schema: neosleep; Owner: -
--

CREATE TABLE neosleep.conversation (
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
);


--
-- Name: efpia_disclosure; Type: TABLE; Schema: neosleep; Owner: -
--

CREATE TABLE neosleep.efpia_disclosure (
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
);


--
-- Name: encounter; Type: TABLE; Schema: neosleep; Owner: -
--

CREATE TABLE neosleep.encounter (
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
);


--
-- Name: encounter_presentation; Type: TABLE; Schema: neosleep; Owner: -
--

CREATE TABLE neosleep.encounter_presentation (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    encounter_id uuid NOT NULL,
    presentation_id uuid NOT NULL,
    opened_at timestamp with time zone,
    closed_at timestamp with time zone,
    metadata jsonb,
    slide_views jsonb
);


--
-- Name: encounter_product; Type: TABLE; Schema: neosleep; Owner: -
--

CREATE TABLE neosleep.encounter_product (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    encounter_id uuid NOT NULL,
    product_id uuid NOT NULL,
    discussed boolean DEFAULT true NOT NULL,
    sampled boolean DEFAULT false NOT NULL,
    notes text,
    metadata jsonb
);


--
-- Name: event; Type: TABLE; Schema: neosleep; Owner: -
--

CREATE TABLE neosleep.event (
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
);


--
-- Name: event_attendee; Type: TABLE; Schema: neosleep; Owner: -
--

CREATE TABLE neosleep.event_attendee (
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
);


--
-- Name: file_attachment; Type: TABLE; Schema: neosleep; Owner: -
--

CREATE TABLE neosleep.file_attachment (
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
);


--
-- Name: i18n_overrides; Type: TABLE; Schema: neosleep; Owner: -
--

CREATE TABLE neosleep.i18n_overrides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    locale text NOT NULL,
    key text NOT NULL,
    value text NOT NULL,
    metadata jsonb,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: identities; Type: TABLE; Schema: neosleep; Owner: -
--

CREATE TABLE neosleep.identities (
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
    CONSTRAINT identities_gender_check CHECK ((gender = ANY (ARRAY['male'::text, 'female'::text, 'other'::text, 'prefer_not_to_say'::text, NULL::text])))
);


--
-- Name: kpi_snapshot; Type: TABLE; Schema: neosleep; Owner: -
--

CREATE TABLE neosleep.kpi_snapshot (
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
);


--
-- Name: lead; Type: TABLE; Schema: neosleep; Owner: -
--

CREATE TABLE neosleep.lead (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    identity_id uuid NOT NULL,
    source text,
    status text DEFAULT 'new'::text NOT NULL,
    country_code text,
    region text DEFAULT ''::text NOT NULL,
    territory_id uuid,
    assigned_to uuid,
    converted_to_id uuid,
    converted_to_type text,
    converted_at timestamp with time zone,
    metadata jsonb,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lead_converted_to_type_check CHECK ((converted_to_type = ANY (ARRAY['practitioner'::text, 'organization'::text, NULL::text]))),
    CONSTRAINT lead_status_check CHECK ((status = ANY (ARRAY['new'::text, 'contacted'::text, 'qualified'::text, 'inactive'::text, 'converted'::text])))
);


--
-- Name: lookup; Type: TABLE; Schema: neosleep; Owner: -
--

CREATE TABLE neosleep.lookup (
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
);


--
-- Name: magic_link_tokens; Type: TABLE; Schema: neosleep; Owner: -
--

CREATE TABLE neosleep.magic_link_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT magic_link_tokens_entity_type_check CHECK ((entity_type = ANY (ARRAY['practitioner'::text, 'patient'::text])))
);


--
-- Name: message; Type: TABLE; Schema: neosleep; Owner: -
--

CREATE TABLE neosleep.message (
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
);


--
-- Name: notification; Type: TABLE; Schema: neosleep; Owner: -
--

CREATE TABLE neosleep.notification (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    channel text DEFAULT 'in_app'::text NOT NULL,
    title text NOT NULL,
    body text,
    entity_type text,
    entity_id uuid,
    action_url text,
    read_at timestamp with time zone,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notification_channel_check CHECK ((channel = ANY (ARRAY['in_app'::text, 'push'::text, 'email'::text, 'sms'::text])))
);


--
-- Name: organization; Type: TABLE; Schema: neosleep; Owner: -
--

CREATE TABLE neosleep.organization (
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
    status text DEFAULT 'active'::text NOT NULL,
    metadata jsonb,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT organization_status_check CHECK ((status = ANY (ARRAY['pending_approval'::text, 'active'::text, 'inactive'::text]))),
    CONSTRAINT organization_type_check CHECK ((type = ANY (ARRAY['clinic'::text, 'hospital'::text, 'pharmacy'::text, 'practice'::text, 'other'::text])))
);


--
-- Name: password_reset_tokens; Type: TABLE; Schema: neosleep; Owner: -
--

CREATE TABLE neosleep.password_reset_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: patient; Type: TABLE; Schema: neosleep; Owner: -
--

CREATE TABLE neosleep.patient (
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
    country_code text,
    region text,
    territory_id uuid,
    status text DEFAULT 'active'::text NOT NULL,
    data_consent_at timestamp with time zone,
    data_consent_withdrawn_at timestamp with time zone,
    metadata jsonb,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT patient_status_check CHECK ((status = ANY (ARRAY['active'::text, 'follow_up'::text, 'discharged'::text])))
);


--
-- Name: patient_webauthn_credentials; Type: TABLE; Schema: neosleep; Owner: -
--

CREATE TABLE neosleep.patient_webauthn_credentials (
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
);


--
-- Name: practitioner; Type: TABLE; Schema: neosleep; Owner: -
--

CREATE TABLE neosleep.practitioner (
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
    country_code text,
    region text,
    territory_id uuid,
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
    CONSTRAINT practitioner_status_check CHECK ((status = ANY (ARRAY['pending_approval'::text, 'active'::text, 'inactive'::text])))
);


--
-- Name: practitioner_assignment; Type: TABLE; Schema: neosleep; Owner: -
--

CREATE TABLE neosleep.practitioner_assignment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    practitioner_id uuid NOT NULL,
    user_id uuid NOT NULL,
    primary_org_id uuid,
    relationship_notes text,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: practitioner_organization; Type: TABLE; Schema: neosleep; Owner: -
--

CREATE TABLE neosleep.practitioner_organization (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    practitioner_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    role text,
    is_primary boolean DEFAULT false NOT NULL,
    valid_from date,
    valid_to date,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: presentation; Type: TABLE; Schema: neosleep; Owner: -
--

CREATE TABLE neosleep.presentation (
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
);


--
-- Name: product; Type: TABLE; Schema: neosleep; Owner: -
--

CREATE TABLE neosleep.product (
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
);


--
-- Name: purchase_order; Type: TABLE; Schema: neosleep; Owner: -
--

CREATE TABLE neosleep.purchase_order (
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
);


--
-- Name: purchase_order_item; Type: TABLE; Schema: neosleep; Owner: -
--

CREATE TABLE neosleep.purchase_order_item (
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
);


--
-- Name: push_subscription; Type: TABLE; Schema: neosleep; Owner: -
--

CREATE TABLE neosleep.push_subscription (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    user_agent text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: remember_me_tokens; Type: TABLE; Schema: neosleep; Owner: -
--

CREATE TABLE neosleep.remember_me_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    last_used_at timestamp with time zone,
    revoked_at timestamp with time zone,
    device_name text,
    user_agent text,
    ip_address inet,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: request_log; Type: TABLE; Schema: neosleep; Owner: -
--

CREATE TABLE neosleep.request_log (
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
);


--
-- Name: sample_batch; Type: TABLE; Schema: neosleep; Owner: -
--

CREATE TABLE neosleep.sample_batch (
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
);


--
-- Name: sample_request; Type: TABLE; Schema: neosleep; Owner: -
--

CREATE TABLE neosleep.sample_request (
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
);


--
-- Name: sample_stock; Type: TABLE; Schema: neosleep; Owner: -
--

CREATE TABLE neosleep.sample_stock (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    product_id uuid NOT NULL,
    quantity integer DEFAULT 0 NOT NULL,
    metadata jsonb,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sample_stock_quantity_check CHECK ((quantity >= 0))
);


--
-- Name: sample_transaction; Type: TABLE; Schema: neosleep; Owner: -
--

CREATE TABLE neosleep.sample_transaction (
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
);


--
-- Name: segment; Type: TABLE; Schema: neosleep; Owner: -
--

CREATE TABLE neosleep.segment (
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
);


--
-- Name: segment_member; Type: TABLE; Schema: neosleep; Owner: -
--

CREATE TABLE neosleep.segment_member (
    segment_id uuid NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    added_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb,
    CONSTRAINT segment_member_entity_type_check CHECK ((entity_type = ANY (ARRAY['practitioner'::text, 'patient'::text, 'lead'::text])))
);


--
-- Name: sleep_study; Type: TABLE; Schema: neosleep; Owner: -
--

CREATE TABLE neosleep.sleep_study (
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
    CONSTRAINT sleep_study_status_check CHECK ((status = ANY (ARRAY['ordered'::text, 'device_shipped'::text, 'device_delivered'::text, 'study_complete'::text, 'results_received'::text, 'interpreted'::text, 'cancelled'::text])))
);


--
-- Name: supplier; Type: TABLE; Schema: neosleep; Owner: -
--

CREATE TABLE neosleep.supplier (
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
);


--
-- Name: support_ticket; Type: TABLE; Schema: neosleep; Owner: -
--

CREATE TABLE neosleep.support_ticket (
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
);


--
-- Name: sync_queue; Type: TABLE; Schema: neosleep; Owner: -
--

CREATE TABLE neosleep.sync_queue (
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
);


--
-- Name: target; Type: TABLE; Schema: neosleep; Owner: -
--

CREATE TABLE neosleep.target (
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
);


--
-- Name: territory; Type: TABLE; Schema: neosleep; Owner: -
--

CREATE TABLE neosleep.territory (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    code text,
    country_code text NOT NULL,
    parent_id uuid,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: territory_user; Type: TABLE; Schema: neosleep; Owner: -
--

CREATE TABLE neosleep.territory_user (
    territory_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'rep'::text NOT NULL,
    valid_from date DEFAULT CURRENT_DATE NOT NULL,
    valid_to date,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT territory_user_role_check CHECK ((role = ANY (ARRAY['rep'::text, 'kam'::text, 'ffm'::text, 'msl'::text, 'backup'::text])))
);


--
-- Name: training_course; Type: TABLE; Schema: neosleep; Owner: -
--

CREATE TABLE neosleep.training_course (
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
);


--
-- Name: training_lesson; Type: TABLE; Schema: neosleep; Owner: -
--

CREATE TABLE neosleep.training_lesson (
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
);


--
-- Name: training_progress; Type: TABLE; Schema: neosleep; Owner: -
--

CREATE TABLE neosleep.training_progress (
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
);


--
-- Name: treatment_plan; Type: TABLE; Schema: neosleep; Owner: -
--

CREATE TABLE neosleep.treatment_plan (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id uuid NOT NULL,
    sleep_study_id uuid NOT NULL,
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
    CONSTRAINT treatment_plan_status_check CHECK ((status = ANY (ARRAY['initiated'::text, 'patient_notified'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text, 'on_hold'::text]))),
    CONSTRAINT treatment_plan_type_check CHECK ((type = ANY (ARRAY['cpap'::text, 'apap'::text, 'dental_appliance'::text, 'positional'::text, 'lifestyle'::text, 'watchful_waiting'::text])))
);


--
-- Name: user_roles; Type: TABLE; Schema: neosleep; Owner: -
--

CREATE TABLE neosleep.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role text NOT NULL,
    region text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_roles_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'ffm'::text, 'kam'::text, 'msl'::text, 'rep'::text])))
);


--
-- Name: user_session; Type: TABLE; Schema: neosleep; Owner: -
--

CREATE TABLE neosleep.user_session (
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
);


--
-- Name: users; Type: TABLE; Schema: neosleep; Owner: -
--

CREATE TABLE neosleep.users (
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
    country_code text,
    region text,
    territory_id uuid,
    status text DEFAULT 'active'::text NOT NULL,
    deleted_at timestamp with time zone,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT users_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'suspended'::text])))
);


--
-- Name: visit_plan; Type: TABLE; Schema: neosleep; Owner: -
--

CREATE TABLE neosleep.visit_plan (
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
);


--
-- Name: webauthn_credentials; Type: TABLE; Schema: neosleep; Owner: -
--

CREATE TABLE neosleep.webauthn_credentials (
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
);


--
-- Name: webhook_event; Type: TABLE; Schema: neosleep; Owner: -
--

CREATE TABLE neosleep.webhook_event (
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
);


--
-- Name: audit; Type: TABLE; Schema: platform; Owner: -
--

CREATE TABLE platform.audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_id uuid,
    actor_email text,
    action text NOT NULL,
    target_type text,
    target_id text,
    before jsonb,
    after jsonb,
    ip_address inet,
    user_agent text
);


--
-- Name: companies; Type: TABLE; Schema: platform; Owner: -
--

CREATE TABLE platform.companies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    plan text DEFAULT 'mvp'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT companies_plan_check CHECK ((plan = ANY (ARRAY['mvp'::text, 'pro'::text, 'enterprise'::text]))),
    CONSTRAINT companies_status_check CHECK ((status = ANY (ARRAY['trial'::text, 'active'::text, 'suspended'::text, 'churned'::text])))
);


--
-- Name: diagnostics; Type: TABLE; Schema: platform; Owner: -
--

CREATE TABLE platform.diagnostics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_slug text,
    level text DEFAULT 'error'::text NOT NULL,
    message text NOT NULL,
    message_hash text,
    stack text,
    source text DEFAULT 'api'::text NOT NULL,
    env text DEFAULT 'production'::text NOT NULL,
    user_id text,
    request_id text,
    count integer DEFAULT 1 NOT NULL,
    first_seen timestamp with time zone DEFAULT now() NOT NULL,
    last_seen timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    metadata jsonb,
    CONSTRAINT diagnostics_level_check CHECK ((level = ANY (ARRAY['log'::text, 'info'::text, 'warn'::text, 'error'::text, 'fatal'::text]))),
    CONSTRAINT diagnostics_source_check CHECK ((source = ANY (ARRAY['api'::text, 'frontend'::text, 'worker'::text, 'migration'::text]))),
    CONSTRAINT diagnostics_status_check CHECK ((status = ANY (ARRAY['open'::text, 'resolved'::text, 'dismissed'::text])))
);


--
-- Name: dpa_agreement; Type: TABLE; Schema: platform; Owner: -
--

CREATE TABLE platform.dpa_agreement (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    version text NOT NULL,
    signed_by text NOT NULL,
    signed_title text,
    signed_at timestamp with time zone NOT NULL,
    document_url text,
    jurisdiction text NOT NULL,
    valid_from date NOT NULL,
    valid_until date,
    is_current boolean DEFAULT true NOT NULL,
    notes text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT dpa_agreement_jurisdiction_check CHECK ((jurisdiction = ANY (ARRAY['EU'::text, 'MX'::text, 'TH'::text, 'US'::text, 'OTHER'::text])))
);


--
-- Name: feature_flags; Type: TABLE; Schema: platform; Owner: -
--

CREATE TABLE platform.feature_flags (
    tenant_id uuid NOT NULL,
    feature_key text NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    locked boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: invoice; Type: TABLE; Schema: platform; Owner: -
--

CREATE TABLE platform.invoice (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    stripe_invoice_id text,
    currency text DEFAULT 'USD'::text NOT NULL,
    subtotal numeric(12,2) NOT NULL,
    tax numeric(12,2) DEFAULT 0 NOT NULL,
    total numeric(12,2) NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    due_date date,
    paid_at timestamp with time zone,
    invoice_pdf_url text,
    notes text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT invoice_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'open'::text, 'paid'::text, 'void'::text, 'uncollectible'::text])))
);


--
-- Name: lookups; Type: TABLE; Schema: platform; Owner: -
--

CREATE TABLE platform.lookups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type text NOT NULL,
    key text NOT NULL,
    locale text DEFAULT 'en'::text NOT NULL,
    value text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    locked boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: payment_method; Type: TABLE; Schema: platform; Owner: -
--

CREATE TABLE platform.payment_method (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_type text NOT NULL,
    owner_id text NOT NULL,
    stripe_customer_id text NOT NULL,
    stripe_pm_id text NOT NULL,
    type text DEFAULT 'card'::text NOT NULL,
    card_brand text,
    card_last4 text,
    card_exp_month integer,
    card_exp_year integer,
    is_default boolean DEFAULT false NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payment_method_owner_type_check CHECK ((owner_type = ANY (ARRAY['tenant'::text, 'patient'::text]))),
    CONSTRAINT payment_method_type_check CHECK ((type = ANY (ARRAY['card'::text, 'blik'::text, 'bank_transfer'::text, 'sepa_debit'::text])))
);


--
-- Name: tenants; Type: TABLE; Schema: platform; Owner: -
--

CREATE TABLE platform.tenants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    slug text NOT NULL,
    db_schema text NOT NULL,
    country_codes text[] DEFAULT '{}'::text[] NOT NULL,
    default_locale text DEFAULT 'en'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tenants_status_check CHECK ((status = ANY (ARRAY['provisioning'::text, 'active'::text, 'suspended'::text, 'archived'::text])))
);


--
-- Name: users; Type: TABLE; Schema: platform; Owner: -
--

CREATE TABLE platform.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    name text NOT NULL,
    password_hash text,
    role text DEFAULT 'support'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    last_login_at timestamp with time zone,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT users_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'support'::text, 'readonly'::text])))
);


--
-- Name: ai_generation_log ai_generation_log_pkey; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.ai_generation_log
    ADD CONSTRAINT ai_generation_log_pkey PRIMARY KEY (id);


--
-- Name: ai_insight ai_insight_entity_type_entity_id_metric_key; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.ai_insight
    ADD CONSTRAINT ai_insight_entity_type_entity_id_metric_key UNIQUE (entity_type, entity_id, metric);


--
-- Name: ai_insight ai_insight_pkey; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.ai_insight
    ADD CONSTRAINT ai_insight_pkey PRIMARY KEY (id);


--
-- Name: app_config app_config_pkey; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.app_config
    ADD CONSTRAINT app_config_pkey PRIMARY KEY (id);


--
-- Name: app_config app_config_singleton_key; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.app_config
    ADD CONSTRAINT app_config_singleton_key UNIQUE (singleton);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: consent consent_pkey; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.consent
    ADD CONSTRAINT consent_pkey PRIMARY KEY (id);


--
-- Name: conversation conversation_pkey; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.conversation
    ADD CONSTRAINT conversation_pkey PRIMARY KEY (id);


--
-- Name: conversation conversation_user_id_contact_type_contact_id_channel_key; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.conversation
    ADD CONSTRAINT conversation_user_id_contact_type_contact_id_channel_key UNIQUE (user_id, contact_type, contact_id, channel);


--
-- Name: efpia_disclosure efpia_disclosure_pkey; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.efpia_disclosure
    ADD CONSTRAINT efpia_disclosure_pkey PRIMARY KEY (id);


--
-- Name: efpia_disclosure efpia_disclosure_practitioner_id_year_key; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.efpia_disclosure
    ADD CONSTRAINT efpia_disclosure_practitioner_id_year_key UNIQUE (practitioner_id, year);


--
-- Name: encounter encounter_pkey; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.encounter
    ADD CONSTRAINT encounter_pkey PRIMARY KEY (id);


--
-- Name: encounter_presentation encounter_presentation_encounter_id_presentation_id_key; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.encounter_presentation
    ADD CONSTRAINT encounter_presentation_encounter_id_presentation_id_key UNIQUE (encounter_id, presentation_id);


--
-- Name: encounter_presentation encounter_presentation_pkey; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.encounter_presentation
    ADD CONSTRAINT encounter_presentation_pkey PRIMARY KEY (id);


--
-- Name: encounter_product encounter_product_encounter_id_product_id_key; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.encounter_product
    ADD CONSTRAINT encounter_product_encounter_id_product_id_key UNIQUE (encounter_id, product_id);


--
-- Name: encounter_product encounter_product_pkey; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.encounter_product
    ADD CONSTRAINT encounter_product_pkey PRIMARY KEY (id);


--
-- Name: event_attendee event_attendee_event_id_attendee_type_attendee_id_key; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.event_attendee
    ADD CONSTRAINT event_attendee_event_id_attendee_type_attendee_id_key UNIQUE (event_id, attendee_type, attendee_id);


--
-- Name: event_attendee event_attendee_pkey; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.event_attendee
    ADD CONSTRAINT event_attendee_pkey PRIMARY KEY (id);


--
-- Name: event event_pkey; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.event
    ADD CONSTRAINT event_pkey PRIMARY KEY (id);


--
-- Name: file_attachment file_attachment_pkey; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.file_attachment
    ADD CONSTRAINT file_attachment_pkey PRIMARY KEY (id);


--
-- Name: i18n_overrides i18n_overrides_locale_key_key; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.i18n_overrides
    ADD CONSTRAINT i18n_overrides_locale_key_key UNIQUE (locale, key);


--
-- Name: i18n_overrides i18n_overrides_pkey; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.i18n_overrides
    ADD CONSTRAINT i18n_overrides_pkey PRIMARY KEY (id);


--
-- Name: identities identities_email_key; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.identities
    ADD CONSTRAINT identities_email_key UNIQUE (email);


--
-- Name: identities identities_pkey; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.identities
    ADD CONSTRAINT identities_pkey PRIMARY KEY (id);


--
-- Name: kpi_snapshot kpi_snapshot_pkey; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.kpi_snapshot
    ADD CONSTRAINT kpi_snapshot_pkey PRIMARY KEY (id);


--
-- Name: lead lead_pkey; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.lead
    ADD CONSTRAINT lead_pkey PRIMARY KEY (id);


--
-- Name: lookup lookup_pkey; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.lookup
    ADD CONSTRAINT lookup_pkey PRIMARY KEY (id);


--
-- Name: lookup lookup_type_key_locale_key; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.lookup
    ADD CONSTRAINT lookup_type_key_locale_key UNIQUE (type, key, locale);


--
-- Name: magic_link_tokens magic_link_tokens_pkey; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.magic_link_tokens
    ADD CONSTRAINT magic_link_tokens_pkey PRIMARY KEY (id);


--
-- Name: magic_link_tokens magic_link_tokens_token_hash_key; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.magic_link_tokens
    ADD CONSTRAINT magic_link_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: message message_pkey; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.message
    ADD CONSTRAINT message_pkey PRIMARY KEY (id);


--
-- Name: notification notification_pkey; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.notification
    ADD CONSTRAINT notification_pkey PRIMARY KEY (id);


--
-- Name: organization organization_pkey; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.organization
    ADD CONSTRAINT organization_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);


--
-- Name: patient patient_google_sub_key; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.patient
    ADD CONSTRAINT patient_google_sub_key UNIQUE (google_sub);


--
-- Name: patient patient_pkey; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.patient
    ADD CONSTRAINT patient_pkey PRIMARY KEY (id);


--
-- Name: patient_webauthn_credentials patient_webauthn_credentials_credential_id_key; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.patient_webauthn_credentials
    ADD CONSTRAINT patient_webauthn_credentials_credential_id_key UNIQUE (credential_id);


--
-- Name: patient_webauthn_credentials patient_webauthn_credentials_pkey; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.patient_webauthn_credentials
    ADD CONSTRAINT patient_webauthn_credentials_pkey PRIMARY KEY (id);


--
-- Name: practitioner_assignment practitioner_assignment_pkey; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.practitioner_assignment
    ADD CONSTRAINT practitioner_assignment_pkey PRIMARY KEY (id);


--
-- Name: practitioner_assignment practitioner_assignment_practitioner_id_user_id_key; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.practitioner_assignment
    ADD CONSTRAINT practitioner_assignment_practitioner_id_user_id_key UNIQUE (practitioner_id, user_id);


--
-- Name: practitioner_organization practitioner_organization_pkey; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.practitioner_organization
    ADD CONSTRAINT practitioner_organization_pkey PRIMARY KEY (id);


--
-- Name: practitioner_organization practitioner_organization_practitioner_id_organization_id_key; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.practitioner_organization
    ADD CONSTRAINT practitioner_organization_practitioner_id_organization_id_key UNIQUE (practitioner_id, organization_id);


--
-- Name: practitioner practitioner_pkey; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.practitioner
    ADD CONSTRAINT practitioner_pkey PRIMARY KEY (id);


--
-- Name: presentation presentation_pkey; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.presentation
    ADD CONSTRAINT presentation_pkey PRIMARY KEY (id);


--
-- Name: product product_code_key; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.product
    ADD CONSTRAINT product_code_key UNIQUE (code);


--
-- Name: product product_pkey; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.product
    ADD CONSTRAINT product_pkey PRIMARY KEY (id);


--
-- Name: purchase_order_item purchase_order_item_pkey; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.purchase_order_item
    ADD CONSTRAINT purchase_order_item_pkey PRIMARY KEY (id);


--
-- Name: purchase_order purchase_order_pkey; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.purchase_order
    ADD CONSTRAINT purchase_order_pkey PRIMARY KEY (id);


--
-- Name: purchase_order purchase_order_stripe_payment_intent_id_key; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.purchase_order
    ADD CONSTRAINT purchase_order_stripe_payment_intent_id_key UNIQUE (stripe_payment_intent_id);


--
-- Name: push_subscription push_subscription_endpoint_key; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.push_subscription
    ADD CONSTRAINT push_subscription_endpoint_key UNIQUE (endpoint);


--
-- Name: push_subscription push_subscription_pkey; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.push_subscription
    ADD CONSTRAINT push_subscription_pkey PRIMARY KEY (id);


--
-- Name: remember_me_tokens remember_me_tokens_pkey; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.remember_me_tokens
    ADD CONSTRAINT remember_me_tokens_pkey PRIMARY KEY (id);


--
-- Name: remember_me_tokens remember_me_tokens_token_hash_key; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.remember_me_tokens
    ADD CONSTRAINT remember_me_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: request_log request_log_pkey; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.request_log
    ADD CONSTRAINT request_log_pkey PRIMARY KEY (id);


--
-- Name: request_log request_log_request_id_key; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.request_log
    ADD CONSTRAINT request_log_request_id_key UNIQUE (request_id);


--
-- Name: sample_batch sample_batch_pkey; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.sample_batch
    ADD CONSTRAINT sample_batch_pkey PRIMARY KEY (id);


--
-- Name: sample_batch sample_batch_product_id_lot_number_key; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.sample_batch
    ADD CONSTRAINT sample_batch_product_id_lot_number_key UNIQUE (product_id, lot_number);


--
-- Name: sample_request sample_request_pkey; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.sample_request
    ADD CONSTRAINT sample_request_pkey PRIMARY KEY (id);


--
-- Name: sample_stock sample_stock_pkey; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.sample_stock
    ADD CONSTRAINT sample_stock_pkey PRIMARY KEY (id);


--
-- Name: sample_stock sample_stock_user_id_product_id_key; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.sample_stock
    ADD CONSTRAINT sample_stock_user_id_product_id_key UNIQUE (user_id, product_id);


--
-- Name: sample_transaction sample_transaction_pkey; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.sample_transaction
    ADD CONSTRAINT sample_transaction_pkey PRIMARY KEY (id);


--
-- Name: segment_member segment_member_pkey; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.segment_member
    ADD CONSTRAINT segment_member_pkey PRIMARY KEY (segment_id, entity_type, entity_id);


--
-- Name: segment segment_pkey; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.segment
    ADD CONSTRAINT segment_pkey PRIMARY KEY (id);


--
-- Name: sleep_study sleep_study_pkey; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.sleep_study
    ADD CONSTRAINT sleep_study_pkey PRIMARY KEY (id);


--
-- Name: supplier supplier_pkey; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.supplier
    ADD CONSTRAINT supplier_pkey PRIMARY KEY (id);


--
-- Name: support_ticket support_ticket_pkey; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.support_ticket
    ADD CONSTRAINT support_ticket_pkey PRIMARY KEY (id);


--
-- Name: sync_queue sync_queue_pkey; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.sync_queue
    ADD CONSTRAINT sync_queue_pkey PRIMARY KEY (id);


--
-- Name: target target_pkey; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.target
    ADD CONSTRAINT target_pkey PRIMARY KEY (id);


--
-- Name: target target_user_id_territory_id_period_metric_key; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.target
    ADD CONSTRAINT target_user_id_territory_id_period_metric_key UNIQUE (user_id, territory_id, period, metric);


--
-- Name: territory territory_code_key; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.territory
    ADD CONSTRAINT territory_code_key UNIQUE (code);


--
-- Name: territory territory_pkey; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.territory
    ADD CONSTRAINT territory_pkey PRIMARY KEY (id);


--
-- Name: territory_user territory_user_pkey; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.territory_user
    ADD CONSTRAINT territory_user_pkey PRIMARY KEY (territory_id, user_id);


--
-- Name: training_course training_course_pkey; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.training_course
    ADD CONSTRAINT training_course_pkey PRIMARY KEY (id);


--
-- Name: training_lesson training_lesson_pkey; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.training_lesson
    ADD CONSTRAINT training_lesson_pkey PRIMARY KEY (id);


--
-- Name: training_progress training_progress_pkey; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.training_progress
    ADD CONSTRAINT training_progress_pkey PRIMARY KEY (id);


--
-- Name: training_progress training_progress_user_id_lesson_id_key; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.training_progress
    ADD CONSTRAINT training_progress_user_id_lesson_id_key UNIQUE (user_id, lesson_id);


--
-- Name: treatment_plan treatment_plan_pkey; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.treatment_plan
    ADD CONSTRAINT treatment_plan_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_region_key; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.user_roles
    ADD CONSTRAINT user_roles_user_id_role_region_key UNIQUE (user_id, role, region);


--
-- Name: user_session user_session_pkey; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.user_session
    ADD CONSTRAINT user_session_pkey PRIMARY KEY (id);


--
-- Name: users users_google_sub_key; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.users
    ADD CONSTRAINT users_google_sub_key UNIQUE (google_sub);


--
-- Name: users users_identity_id_key; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.users
    ADD CONSTRAINT users_identity_id_key UNIQUE (identity_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: visit_plan visit_plan_pkey; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.visit_plan
    ADD CONSTRAINT visit_plan_pkey PRIMARY KEY (id);


--
-- Name: webauthn_credentials webauthn_credentials_credential_id_key; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.webauthn_credentials
    ADD CONSTRAINT webauthn_credentials_credential_id_key UNIQUE (credential_id);


--
-- Name: webauthn_credentials webauthn_credentials_pkey; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.webauthn_credentials
    ADD CONSTRAINT webauthn_credentials_pkey PRIMARY KEY (id);


--
-- Name: webhook_event webhook_event_pkey; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.webhook_event
    ADD CONSTRAINT webhook_event_pkey PRIMARY KEY (id);


--
-- Name: webhook_event webhook_event_source_external_id_key; Type: CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.webhook_event
    ADD CONSTRAINT webhook_event_source_external_id_key UNIQUE (source, external_id);


--
-- Name: ai_generation_log ai_generation_log_pkey; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.ai_generation_log
    ADD CONSTRAINT ai_generation_log_pkey PRIMARY KEY (id);


--
-- Name: ai_insight ai_insight_entity_type_entity_id_metric_key; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.ai_insight
    ADD CONSTRAINT ai_insight_entity_type_entity_id_metric_key UNIQUE (entity_type, entity_id, metric);


--
-- Name: ai_insight ai_insight_pkey; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.ai_insight
    ADD CONSTRAINT ai_insight_pkey PRIMARY KEY (id);


--
-- Name: app_config app_config_pkey; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.app_config
    ADD CONSTRAINT app_config_pkey PRIMARY KEY (id);


--
-- Name: app_config app_config_singleton_key; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.app_config
    ADD CONSTRAINT app_config_singleton_key UNIQUE (singleton);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: consent consent_pkey; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.consent
    ADD CONSTRAINT consent_pkey PRIMARY KEY (id);


--
-- Name: conversation conversation_pkey; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.conversation
    ADD CONSTRAINT conversation_pkey PRIMARY KEY (id);


--
-- Name: conversation conversation_user_id_contact_type_contact_id_channel_key; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.conversation
    ADD CONSTRAINT conversation_user_id_contact_type_contact_id_channel_key UNIQUE (user_id, contact_type, contact_id, channel);


--
-- Name: efpia_disclosure efpia_disclosure_pkey; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.efpia_disclosure
    ADD CONSTRAINT efpia_disclosure_pkey PRIMARY KEY (id);


--
-- Name: efpia_disclosure efpia_disclosure_practitioner_id_year_key; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.efpia_disclosure
    ADD CONSTRAINT efpia_disclosure_practitioner_id_year_key UNIQUE (practitioner_id, year);


--
-- Name: encounter encounter_pkey; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.encounter
    ADD CONSTRAINT encounter_pkey PRIMARY KEY (id);


--
-- Name: encounter_presentation encounter_presentation_encounter_id_presentation_id_key; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.encounter_presentation
    ADD CONSTRAINT encounter_presentation_encounter_id_presentation_id_key UNIQUE (encounter_id, presentation_id);


--
-- Name: encounter_presentation encounter_presentation_pkey; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.encounter_presentation
    ADD CONSTRAINT encounter_presentation_pkey PRIMARY KEY (id);


--
-- Name: encounter_product encounter_product_encounter_id_product_id_key; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.encounter_product
    ADD CONSTRAINT encounter_product_encounter_id_product_id_key UNIQUE (encounter_id, product_id);


--
-- Name: encounter_product encounter_product_pkey; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.encounter_product
    ADD CONSTRAINT encounter_product_pkey PRIMARY KEY (id);


--
-- Name: event_attendee event_attendee_event_id_attendee_type_attendee_id_key; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.event_attendee
    ADD CONSTRAINT event_attendee_event_id_attendee_type_attendee_id_key UNIQUE (event_id, attendee_type, attendee_id);


--
-- Name: event_attendee event_attendee_pkey; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.event_attendee
    ADD CONSTRAINT event_attendee_pkey PRIMARY KEY (id);


--
-- Name: event event_pkey; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.event
    ADD CONSTRAINT event_pkey PRIMARY KEY (id);


--
-- Name: file_attachment file_attachment_pkey; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.file_attachment
    ADD CONSTRAINT file_attachment_pkey PRIMARY KEY (id);


--
-- Name: i18n_overrides i18n_overrides_locale_key_key; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.i18n_overrides
    ADD CONSTRAINT i18n_overrides_locale_key_key UNIQUE (locale, key);


--
-- Name: i18n_overrides i18n_overrides_pkey; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.i18n_overrides
    ADD CONSTRAINT i18n_overrides_pkey PRIMARY KEY (id);


--
-- Name: identities identities_email_key; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.identities
    ADD CONSTRAINT identities_email_key UNIQUE (email);


--
-- Name: identities identities_pkey; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.identities
    ADD CONSTRAINT identities_pkey PRIMARY KEY (id);


--
-- Name: kpi_snapshot kpi_snapshot_pkey; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.kpi_snapshot
    ADD CONSTRAINT kpi_snapshot_pkey PRIMARY KEY (id);


--
-- Name: lead lead_pkey; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.lead
    ADD CONSTRAINT lead_pkey PRIMARY KEY (id);


--
-- Name: lookup lookup_pkey; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.lookup
    ADD CONSTRAINT lookup_pkey PRIMARY KEY (id);


--
-- Name: lookup lookup_type_key_locale_key; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.lookup
    ADD CONSTRAINT lookup_type_key_locale_key UNIQUE (type, key, locale);


--
-- Name: magic_link_tokens magic_link_tokens_pkey; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.magic_link_tokens
    ADD CONSTRAINT magic_link_tokens_pkey PRIMARY KEY (id);


--
-- Name: magic_link_tokens magic_link_tokens_token_hash_key; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.magic_link_tokens
    ADD CONSTRAINT magic_link_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: message message_pkey; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.message
    ADD CONSTRAINT message_pkey PRIMARY KEY (id);


--
-- Name: notification notification_pkey; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.notification
    ADD CONSTRAINT notification_pkey PRIMARY KEY (id);


--
-- Name: organization organization_pkey; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.organization
    ADD CONSTRAINT organization_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);


--
-- Name: patient patient_google_sub_key; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.patient
    ADD CONSTRAINT patient_google_sub_key UNIQUE (google_sub);


--
-- Name: patient patient_pkey; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.patient
    ADD CONSTRAINT patient_pkey PRIMARY KEY (id);


--
-- Name: patient_webauthn_credentials patient_webauthn_credentials_credential_id_key; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.patient_webauthn_credentials
    ADD CONSTRAINT patient_webauthn_credentials_credential_id_key UNIQUE (credential_id);


--
-- Name: patient_webauthn_credentials patient_webauthn_credentials_pkey; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.patient_webauthn_credentials
    ADD CONSTRAINT patient_webauthn_credentials_pkey PRIMARY KEY (id);


--
-- Name: practitioner_assignment practitioner_assignment_pkey; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.practitioner_assignment
    ADD CONSTRAINT practitioner_assignment_pkey PRIMARY KEY (id);


--
-- Name: practitioner_assignment practitioner_assignment_practitioner_id_user_id_key; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.practitioner_assignment
    ADD CONSTRAINT practitioner_assignment_practitioner_id_user_id_key UNIQUE (practitioner_id, user_id);


--
-- Name: practitioner_organization practitioner_organization_pkey; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.practitioner_organization
    ADD CONSTRAINT practitioner_organization_pkey PRIMARY KEY (id);


--
-- Name: practitioner_organization practitioner_organization_practitioner_id_organization_id_key; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.practitioner_organization
    ADD CONSTRAINT practitioner_organization_practitioner_id_organization_id_key UNIQUE (practitioner_id, organization_id);


--
-- Name: practitioner practitioner_pkey; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.practitioner
    ADD CONSTRAINT practitioner_pkey PRIMARY KEY (id);


--
-- Name: presentation presentation_pkey; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.presentation
    ADD CONSTRAINT presentation_pkey PRIMARY KEY (id);


--
-- Name: product product_code_key; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.product
    ADD CONSTRAINT product_code_key UNIQUE (code);


--
-- Name: product product_pkey; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.product
    ADD CONSTRAINT product_pkey PRIMARY KEY (id);


--
-- Name: purchase_order_item purchase_order_item_pkey; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.purchase_order_item
    ADD CONSTRAINT purchase_order_item_pkey PRIMARY KEY (id);


--
-- Name: purchase_order purchase_order_pkey; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.purchase_order
    ADD CONSTRAINT purchase_order_pkey PRIMARY KEY (id);


--
-- Name: purchase_order purchase_order_stripe_payment_intent_id_key; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.purchase_order
    ADD CONSTRAINT purchase_order_stripe_payment_intent_id_key UNIQUE (stripe_payment_intent_id);


--
-- Name: push_subscription push_subscription_endpoint_key; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.push_subscription
    ADD CONSTRAINT push_subscription_endpoint_key UNIQUE (endpoint);


--
-- Name: push_subscription push_subscription_pkey; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.push_subscription
    ADD CONSTRAINT push_subscription_pkey PRIMARY KEY (id);


--
-- Name: remember_me_tokens remember_me_tokens_pkey; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.remember_me_tokens
    ADD CONSTRAINT remember_me_tokens_pkey PRIMARY KEY (id);


--
-- Name: remember_me_tokens remember_me_tokens_token_hash_key; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.remember_me_tokens
    ADD CONSTRAINT remember_me_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: request_log request_log_pkey; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.request_log
    ADD CONSTRAINT request_log_pkey PRIMARY KEY (id);


--
-- Name: request_log request_log_request_id_key; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.request_log
    ADD CONSTRAINT request_log_request_id_key UNIQUE (request_id);


--
-- Name: sample_batch sample_batch_pkey; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.sample_batch
    ADD CONSTRAINT sample_batch_pkey PRIMARY KEY (id);


--
-- Name: sample_batch sample_batch_product_id_lot_number_key; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.sample_batch
    ADD CONSTRAINT sample_batch_product_id_lot_number_key UNIQUE (product_id, lot_number);


--
-- Name: sample_request sample_request_pkey; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.sample_request
    ADD CONSTRAINT sample_request_pkey PRIMARY KEY (id);


--
-- Name: sample_stock sample_stock_pkey; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.sample_stock
    ADD CONSTRAINT sample_stock_pkey PRIMARY KEY (id);


--
-- Name: sample_stock sample_stock_user_id_product_id_key; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.sample_stock
    ADD CONSTRAINT sample_stock_user_id_product_id_key UNIQUE (user_id, product_id);


--
-- Name: sample_transaction sample_transaction_pkey; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.sample_transaction
    ADD CONSTRAINT sample_transaction_pkey PRIMARY KEY (id);


--
-- Name: segment_member segment_member_pkey; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.segment_member
    ADD CONSTRAINT segment_member_pkey PRIMARY KEY (segment_id, entity_type, entity_id);


--
-- Name: segment segment_pkey; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.segment
    ADD CONSTRAINT segment_pkey PRIMARY KEY (id);


--
-- Name: sleep_study sleep_study_pkey; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.sleep_study
    ADD CONSTRAINT sleep_study_pkey PRIMARY KEY (id);


--
-- Name: supplier supplier_pkey; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.supplier
    ADD CONSTRAINT supplier_pkey PRIMARY KEY (id);


--
-- Name: support_ticket support_ticket_pkey; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.support_ticket
    ADD CONSTRAINT support_ticket_pkey PRIMARY KEY (id);


--
-- Name: sync_queue sync_queue_pkey; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.sync_queue
    ADD CONSTRAINT sync_queue_pkey PRIMARY KEY (id);


--
-- Name: target target_pkey; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.target
    ADD CONSTRAINT target_pkey PRIMARY KEY (id);


--
-- Name: target target_user_id_territory_id_period_metric_key; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.target
    ADD CONSTRAINT target_user_id_territory_id_period_metric_key UNIQUE (user_id, territory_id, period, metric);


--
-- Name: territory territory_code_key; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.territory
    ADD CONSTRAINT territory_code_key UNIQUE (code);


--
-- Name: territory territory_pkey; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.territory
    ADD CONSTRAINT territory_pkey PRIMARY KEY (id);


--
-- Name: territory_user territory_user_pkey; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.territory_user
    ADD CONSTRAINT territory_user_pkey PRIMARY KEY (territory_id, user_id);


--
-- Name: training_course training_course_pkey; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.training_course
    ADD CONSTRAINT training_course_pkey PRIMARY KEY (id);


--
-- Name: training_lesson training_lesson_pkey; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.training_lesson
    ADD CONSTRAINT training_lesson_pkey PRIMARY KEY (id);


--
-- Name: training_progress training_progress_pkey; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.training_progress
    ADD CONSTRAINT training_progress_pkey PRIMARY KEY (id);


--
-- Name: training_progress training_progress_user_id_lesson_id_key; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.training_progress
    ADD CONSTRAINT training_progress_user_id_lesson_id_key UNIQUE (user_id, lesson_id);


--
-- Name: treatment_plan treatment_plan_pkey; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.treatment_plan
    ADD CONSTRAINT treatment_plan_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_region_key; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.user_roles
    ADD CONSTRAINT user_roles_user_id_role_region_key UNIQUE (user_id, role, region);


--
-- Name: user_session user_session_pkey; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.user_session
    ADD CONSTRAINT user_session_pkey PRIMARY KEY (id);


--
-- Name: users users_google_sub_key; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.users
    ADD CONSTRAINT users_google_sub_key UNIQUE (google_sub);


--
-- Name: users users_identity_id_key; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.users
    ADD CONSTRAINT users_identity_id_key UNIQUE (identity_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: visit_plan visit_plan_pkey; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.visit_plan
    ADD CONSTRAINT visit_plan_pkey PRIMARY KEY (id);


--
-- Name: webauthn_credentials webauthn_credentials_credential_id_key; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.webauthn_credentials
    ADD CONSTRAINT webauthn_credentials_credential_id_key UNIQUE (credential_id);


--
-- Name: webauthn_credentials webauthn_credentials_pkey; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.webauthn_credentials
    ADD CONSTRAINT webauthn_credentials_pkey PRIMARY KEY (id);


--
-- Name: webhook_event webhook_event_pkey; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.webhook_event
    ADD CONSTRAINT webhook_event_pkey PRIMARY KEY (id);


--
-- Name: webhook_event webhook_event_source_external_id_key; Type: CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.webhook_event
    ADD CONSTRAINT webhook_event_source_external_id_key UNIQUE (source, external_id);


--
-- Name: audit audit_pkey; Type: CONSTRAINT; Schema: platform; Owner: -
--

ALTER TABLE ONLY platform.audit
    ADD CONSTRAINT audit_pkey PRIMARY KEY (id);


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: platform; Owner: -
--

ALTER TABLE ONLY platform.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);


--
-- Name: companies companies_slug_key; Type: CONSTRAINT; Schema: platform; Owner: -
--

ALTER TABLE ONLY platform.companies
    ADD CONSTRAINT companies_slug_key UNIQUE (slug);


--
-- Name: diagnostics diagnostics_pkey; Type: CONSTRAINT; Schema: platform; Owner: -
--

ALTER TABLE ONLY platform.diagnostics
    ADD CONSTRAINT diagnostics_pkey PRIMARY KEY (id);


--
-- Name: dpa_agreement dpa_agreement_pkey; Type: CONSTRAINT; Schema: platform; Owner: -
--

ALTER TABLE ONLY platform.dpa_agreement
    ADD CONSTRAINT dpa_agreement_pkey PRIMARY KEY (id);


--
-- Name: feature_flags feature_flags_pkey; Type: CONSTRAINT; Schema: platform; Owner: -
--

ALTER TABLE ONLY platform.feature_flags
    ADD CONSTRAINT feature_flags_pkey PRIMARY KEY (tenant_id, feature_key);


--
-- Name: invoice invoice_pkey; Type: CONSTRAINT; Schema: platform; Owner: -
--

ALTER TABLE ONLY platform.invoice
    ADD CONSTRAINT invoice_pkey PRIMARY KEY (id);


--
-- Name: invoice invoice_stripe_invoice_id_key; Type: CONSTRAINT; Schema: platform; Owner: -
--

ALTER TABLE ONLY platform.invoice
    ADD CONSTRAINT invoice_stripe_invoice_id_key UNIQUE (stripe_invoice_id);


--
-- Name: lookups lookups_pkey; Type: CONSTRAINT; Schema: platform; Owner: -
--

ALTER TABLE ONLY platform.lookups
    ADD CONSTRAINT lookups_pkey PRIMARY KEY (id);


--
-- Name: lookups lookups_type_key_locale_key; Type: CONSTRAINT; Schema: platform; Owner: -
--

ALTER TABLE ONLY platform.lookups
    ADD CONSTRAINT lookups_type_key_locale_key UNIQUE (type, key, locale);


--
-- Name: payment_method payment_method_pkey; Type: CONSTRAINT; Schema: platform; Owner: -
--

ALTER TABLE ONLY platform.payment_method
    ADD CONSTRAINT payment_method_pkey PRIMARY KEY (id);


--
-- Name: payment_method payment_method_stripe_pm_id_key; Type: CONSTRAINT; Schema: platform; Owner: -
--

ALTER TABLE ONLY platform.payment_method
    ADD CONSTRAINT payment_method_stripe_pm_id_key UNIQUE (stripe_pm_id);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: platform; Owner: -
--

ALTER TABLE ONLY platform.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: tenants tenants_slug_key; Type: CONSTRAINT; Schema: platform; Owner: -
--

ALTER TABLE ONLY platform.tenants
    ADD CONSTRAINT tenants_slug_key UNIQUE (slug);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: platform; Owner: -
--

ALTER TABLE ONLY platform.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: platform; Owner: -
--

ALTER TABLE ONLY platform.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: fourseasons_ai_insight_entity_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_ai_insight_entity_idx ON fourseasons.ai_insight USING btree (entity_type, entity_id);


--
-- Name: fourseasons_ai_insight_expires_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_ai_insight_expires_idx ON fourseasons.ai_insight USING btree (expires_at) WHERE (is_stale = false);


--
-- Name: fourseasons_ai_log_entity_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_ai_log_entity_idx ON fourseasons.ai_generation_log USING btree (entity_type, entity_id);


--
-- Name: fourseasons_ai_log_feature_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_ai_log_feature_idx ON fourseasons.ai_generation_log USING btree (feature);


--
-- Name: fourseasons_ai_log_user_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_ai_log_user_idx ON fourseasons.ai_generation_log USING btree (user_id, created_at);


--
-- Name: fourseasons_attachment_entity_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_attachment_entity_idx ON fourseasons.file_attachment USING btree (entity_type, entity_id);


--
-- Name: fourseasons_audit_created_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_audit_created_idx ON fourseasons.audit_log USING btree (created_at);


--
-- Name: fourseasons_audit_entity_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_audit_entity_idx ON fourseasons.audit_log USING btree (entity_type, entity_id);


--
-- Name: fourseasons_audit_user_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_audit_user_idx ON fourseasons.audit_log USING btree (user_id);


--
-- Name: fourseasons_consent_entity_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_consent_entity_idx ON fourseasons.consent USING btree (entity_type, entity_id);


--
-- Name: fourseasons_consent_jurisdiction_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_consent_jurisdiction_idx ON fourseasons.consent USING btree (jurisdiction);


--
-- Name: fourseasons_conv_contact_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_conv_contact_idx ON fourseasons.conversation USING btree (contact_type, contact_id);


--
-- Name: fourseasons_conv_last_msg_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_conv_last_msg_idx ON fourseasons.conversation USING btree (last_message_at);


--
-- Name: fourseasons_conv_user_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_conv_user_idx ON fourseasons.conversation USING btree (user_id);


--
-- Name: fourseasons_course_role_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_course_role_idx ON fourseasons.training_course USING btree (required_role) WHERE (is_active = true);


--
-- Name: fourseasons_efpia_pending_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_efpia_pending_idx ON fourseasons.efpia_disclosure USING btree (status) WHERE (status <> 'disclosed'::text);


--
-- Name: fourseasons_efpia_prac_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_efpia_prac_idx ON fourseasons.efpia_disclosure USING btree (practitioner_id);


--
-- Name: fourseasons_efpia_year_status_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_efpia_year_status_idx ON fourseasons.efpia_disclosure USING btree (year, status);


--
-- Name: fourseasons_enc_prac_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_enc_prac_idx ON fourseasons.encounter USING btree (practitioner_id);


--
-- Name: fourseasons_enc_prac_start_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_enc_prac_start_idx ON fourseasons.encounter USING btree (practitioner_id, start_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: fourseasons_enc_start_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_enc_start_idx ON fourseasons.encounter USING btree (start_at);


--
-- Name: fourseasons_enc_status_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_enc_status_idx ON fourseasons.encounter USING btree (status) WHERE (deleted_at IS NULL);


--
-- Name: fourseasons_enc_territory_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_enc_territory_idx ON fourseasons.encounter USING btree (territory_id);


--
-- Name: fourseasons_enc_user_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_enc_user_idx ON fourseasons.encounter USING btree (user_id);


--
-- Name: fourseasons_enc_user_start_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_enc_user_start_idx ON fourseasons.encounter USING btree (user_id, start_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: fourseasons_encpres_enc_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_encpres_enc_idx ON fourseasons.encounter_presentation USING btree (encounter_id);


--
-- Name: fourseasons_encprod_enc_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_encprod_enc_idx ON fourseasons.encounter_product USING btree (encounter_id);


--
-- Name: fourseasons_event_att_event_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_event_att_event_idx ON fourseasons.event_attendee USING btree (event_id);


--
-- Name: fourseasons_event_att_who_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_event_att_who_idx ON fourseasons.event_attendee USING btree (attendee_type, attendee_id);


--
-- Name: fourseasons_event_country_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_event_country_idx ON fourseasons.event USING btree (country_code);


--
-- Name: fourseasons_event_starts_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_event_starts_idx ON fourseasons.event USING btree (starts_at);


--
-- Name: fourseasons_event_status_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_event_status_idx ON fourseasons.event USING btree (status) WHERE (deleted_at IS NULL);


--
-- Name: fourseasons_identities_email_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_identities_email_idx ON fourseasons.identities USING btree (email);


--
-- Name: fourseasons_kpi_metric_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_kpi_metric_idx ON fourseasons.kpi_snapshot USING btree (metric, period_type);


--
-- Name: fourseasons_kpi_scope_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_kpi_scope_idx ON fourseasons.kpi_snapshot USING btree (scope_type, scope_id, period);


--
-- Name: fourseasons_kpi_unique_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE UNIQUE INDEX fourseasons_kpi_unique_idx ON fourseasons.kpi_snapshot USING btree (period, period_type, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid), metric);


--
-- Name: fourseasons_lead_assigned_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_lead_assigned_idx ON fourseasons.lead USING btree (assigned_to);


--
-- Name: fourseasons_lead_status_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_lead_status_idx ON fourseasons.lead USING btree (status) WHERE (deleted_at IS NULL);


--
-- Name: fourseasons_lead_territory_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_lead_territory_idx ON fourseasons.lead USING btree (territory_id);


--
-- Name: fourseasons_lesson_course_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_lesson_course_idx ON fourseasons.training_lesson USING btree (course_id, sort_order);


--
-- Name: fourseasons_message_conv_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_message_conv_idx ON fourseasons.message USING btree (conversation_id, sent_at);


--
-- Name: fourseasons_message_sender_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_message_sender_idx ON fourseasons.message USING btree (sender_type, sender_id);


--
-- Name: fourseasons_mlt_entity_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_mlt_entity_idx ON fourseasons.magic_link_tokens USING btree (entity_type, entity_id);


--
-- Name: fourseasons_mlt_hash_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_mlt_hash_idx ON fourseasons.magic_link_tokens USING btree (token_hash);


--
-- Name: fourseasons_notif_created_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_notif_created_idx ON fourseasons.notification USING btree (created_at);


--
-- Name: fourseasons_notif_user_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_notif_user_idx ON fourseasons.notification USING btree (user_id, read_at);


--
-- Name: fourseasons_org_country_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_org_country_idx ON fourseasons.organization USING btree (country_code);


--
-- Name: fourseasons_org_status_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_org_status_idx ON fourseasons.organization USING btree (status) WHERE (deleted_at IS NULL);


--
-- Name: fourseasons_org_territory_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_org_territory_idx ON fourseasons.organization USING btree (territory_id) WHERE (deleted_at IS NULL);


--
-- Name: fourseasons_pat_webauthn_user_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_pat_webauthn_user_idx ON fourseasons.patient_webauthn_credentials USING btree (patient_id);


--
-- Name: fourseasons_patient_country_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_patient_country_idx ON fourseasons.patient USING btree (country_code);


--
-- Name: fourseasons_patient_google_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_patient_google_idx ON fourseasons.patient USING btree (google_sub);


--
-- Name: fourseasons_patient_prac_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_patient_prac_idx ON fourseasons.patient USING btree (practitioner_id);


--
-- Name: fourseasons_patient_status_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_patient_status_idx ON fourseasons.patient USING btree (status) WHERE (deleted_at IS NULL);


--
-- Name: fourseasons_pitem_order_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_pitem_order_idx ON fourseasons.purchase_order_item USING btree (order_id);


--
-- Name: fourseasons_pitem_supplier_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_pitem_supplier_idx ON fourseasons.purchase_order_item USING btree (fulfillment_supplier_id);


--
-- Name: fourseasons_porder_patient_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_porder_patient_idx ON fourseasons.purchase_order USING btree (patient_id);


--
-- Name: fourseasons_porder_status_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_porder_status_idx ON fourseasons.purchase_order USING btree (status);


--
-- Name: fourseasons_porder_stripe_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_porder_stripe_idx ON fourseasons.purchase_order USING btree (stripe_payment_intent_id);


--
-- Name: fourseasons_prac_identity_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_prac_identity_idx ON fourseasons.practitioner USING btree (identity_id);


--
-- Name: fourseasons_prac_org_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_prac_org_idx ON fourseasons.practitioner USING btree (organization_id);


--
-- Name: fourseasons_prac_specialties_gin; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_prac_specialties_gin ON fourseasons.practitioner USING gin (specialties);


--
-- Name: fourseasons_prac_specialty_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_prac_specialty_idx ON fourseasons.practitioner USING btree (primary_specialty) WHERE (deleted_at IS NULL);


--
-- Name: fourseasons_prac_status_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_prac_status_idx ON fourseasons.practitioner USING btree (status) WHERE (deleted_at IS NULL);


--
-- Name: fourseasons_prac_tags_gin; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_prac_tags_gin ON fourseasons.practitioner USING gin (tags);


--
-- Name: fourseasons_prac_territory_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_prac_territory_idx ON fourseasons.practitioner USING btree (territory_id) WHERE (deleted_at IS NULL);


--
-- Name: fourseasons_prac_tier_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_prac_tier_idx ON fourseasons.practitioner USING btree (influence_tier);


--
-- Name: fourseasons_pracassign_prac_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_pracassign_prac_idx ON fourseasons.practitioner_assignment USING btree (practitioner_id);


--
-- Name: fourseasons_pracassign_user_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_pracassign_user_idx ON fourseasons.practitioner_assignment USING btree (user_id);


--
-- Name: fourseasons_pracorg_org_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_pracorg_org_idx ON fourseasons.practitioner_organization USING btree (organization_id);


--
-- Name: fourseasons_pracorg_prac_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_pracorg_prac_idx ON fourseasons.practitioner_organization USING btree (practitioner_id);


--
-- Name: fourseasons_pres_keywords_gin; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_pres_keywords_gin ON fourseasons.presentation USING gin (keywords);


--
-- Name: fourseasons_pres_product_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_pres_product_idx ON fourseasons.presentation USING btree (product_id) WHERE (deleted_at IS NULL);


--
-- Name: fourseasons_pres_status_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_pres_status_idx ON fourseasons.presentation USING btree (status) WHERE (deleted_at IS NULL);


--
-- Name: fourseasons_product_keywords_gin; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_product_keywords_gin ON fourseasons.product USING gin (keywords);


--
-- Name: fourseasons_progress_user_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_progress_user_idx ON fourseasons.training_progress USING btree (user_id, status);


--
-- Name: fourseasons_prt_expires_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_prt_expires_idx ON fourseasons.password_reset_tokens USING btree (expires_at);


--
-- Name: fourseasons_prt_hash_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_prt_hash_idx ON fourseasons.password_reset_tokens USING btree (token_hash);


--
-- Name: fourseasons_push_user_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_push_user_idx ON fourseasons.push_subscription USING btree (user_id);


--
-- Name: fourseasons_reqlog_created_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_reqlog_created_idx ON fourseasons.request_log USING btree (created_at);


--
-- Name: fourseasons_reqlog_route_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_reqlog_route_idx ON fourseasons.request_log USING btree (route, status_code);


--
-- Name: fourseasons_reqlog_session_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_reqlog_session_idx ON fourseasons.request_log USING btree (session_id);


--
-- Name: fourseasons_reqlog_user_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_reqlog_user_idx ON fourseasons.request_log USING btree (user_id, created_at);


--
-- Name: fourseasons_rmt_expires_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_rmt_expires_idx ON fourseasons.remember_me_tokens USING btree (expires_at);


--
-- Name: fourseasons_rmt_hash_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_rmt_hash_idx ON fourseasons.remember_me_tokens USING btree (token_hash);


--
-- Name: fourseasons_rmt_user_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_rmt_user_idx ON fourseasons.remember_me_tokens USING btree (user_id);


--
-- Name: fourseasons_sbatch_expiry_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_sbatch_expiry_idx ON fourseasons.sample_batch USING btree (expiry_date);


--
-- Name: fourseasons_sbatch_product_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_sbatch_product_idx ON fourseasons.sample_batch USING btree (product_id);


--
-- Name: fourseasons_segmember_entity_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_segmember_entity_idx ON fourseasons.segment_member USING btree (entity_type, entity_id);


--
-- Name: fourseasons_segment_type_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_segment_type_idx ON fourseasons.segment USING btree (entity_type) WHERE (deleted_at IS NULL);


--
-- Name: fourseasons_session_active_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_session_active_idx ON fourseasons.user_session USING btree (is_active) WHERE (is_active = true);


--
-- Name: fourseasons_session_started_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_session_started_idx ON fourseasons.user_session USING btree (started_at);


--
-- Name: fourseasons_session_user_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_session_user_idx ON fourseasons.user_session USING btree (user_id);


--
-- Name: fourseasons_sreq_requester_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_sreq_requester_idx ON fourseasons.sample_request USING btree (requester_id);


--
-- Name: fourseasons_sreq_status_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_sreq_status_idx ON fourseasons.sample_request USING btree (status);


--
-- Name: fourseasons_sstock_user_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_sstock_user_idx ON fourseasons.sample_stock USING btree (user_id);


--
-- Name: fourseasons_study_doctor_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_study_doctor_idx ON fourseasons.sleep_study USING btree (interpreted_by);


--
-- Name: fourseasons_study_patient_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_study_patient_idx ON fourseasons.sleep_study USING btree (patient_id);


--
-- Name: fourseasons_study_status_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_study_status_idx ON fourseasons.sleep_study USING btree (status);


--
-- Name: fourseasons_stxn_batch_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_stxn_batch_idx ON fourseasons.sample_transaction USING btree (batch_id);


--
-- Name: fourseasons_stxn_encounter_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_stxn_encounter_idx ON fourseasons.sample_transaction USING btree (encounter_id);


--
-- Name: fourseasons_stxn_type_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_stxn_type_idx ON fourseasons.sample_transaction USING btree (type);


--
-- Name: fourseasons_stxn_user_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_stxn_user_idx ON fourseasons.sample_transaction USING btree (user_id, created_at);


--
-- Name: fourseasons_supplier_type_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_supplier_type_idx ON fourseasons.supplier USING btree (type) WHERE (is_active = true);


--
-- Name: fourseasons_sync_status_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_sync_status_idx ON fourseasons.sync_queue USING btree (status, created_at);


--
-- Name: fourseasons_sync_user_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_sync_user_idx ON fourseasons.sync_queue USING btree (user_id, status);


--
-- Name: fourseasons_target_user_period_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_target_user_period_idx ON fourseasons.target USING btree (user_id, period);


--
-- Name: fourseasons_territory_country_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_territory_country_idx ON fourseasons.territory USING btree (country_code);


--
-- Name: fourseasons_territory_user_user_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_territory_user_user_idx ON fourseasons.territory_user USING btree (user_id);


--
-- Name: fourseasons_ticket_assignee_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_ticket_assignee_idx ON fourseasons.support_ticket USING btree (assigned_to, status);


--
-- Name: fourseasons_ticket_patient_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_ticket_patient_idx ON fourseasons.support_ticket USING btree (patient_id);


--
-- Name: fourseasons_ticket_status_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_ticket_status_idx ON fourseasons.support_ticket USING btree (status);


--
-- Name: fourseasons_tx_dentist_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_tx_dentist_idx ON fourseasons.treatment_plan USING btree (dentist_id);


--
-- Name: fourseasons_tx_patient_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_tx_patient_idx ON fourseasons.treatment_plan USING btree (patient_id);


--
-- Name: fourseasons_tx_study_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_tx_study_idx ON fourseasons.treatment_plan USING btree (sleep_study_id);


--
-- Name: fourseasons_tx_type_status_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_tx_type_status_idx ON fourseasons.treatment_plan USING btree (type, status);


--
-- Name: fourseasons_user_roles_user_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_user_roles_user_idx ON fourseasons.user_roles USING btree (user_id);


--
-- Name: fourseasons_users_identity_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_users_identity_idx ON fourseasons.users USING btree (identity_id);


--
-- Name: fourseasons_users_manager_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_users_manager_idx ON fourseasons.users USING btree (manager_id);


--
-- Name: fourseasons_users_status_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_users_status_idx ON fourseasons.users USING btree (status) WHERE (deleted_at IS NULL);


--
-- Name: fourseasons_vplan_date_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_vplan_date_idx ON fourseasons.visit_plan USING btree (planned_at);


--
-- Name: fourseasons_vplan_user_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_vplan_user_idx ON fourseasons.visit_plan USING btree (user_id);


--
-- Name: fourseasons_webauthn_user_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_webauthn_user_idx ON fourseasons.webauthn_credentials USING btree (user_id);


--
-- Name: fourseasons_webhook_source_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_webhook_source_idx ON fourseasons.webhook_event USING btree (source);


--
-- Name: fourseasons_webhook_status_idx; Type: INDEX; Schema: fourseasons; Owner: -
--

CREATE INDEX fourseasons_webhook_status_idx ON fourseasons.webhook_event USING btree (status, created_at);


--
-- Name: neosleep_ai_insight_entity_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_ai_insight_entity_idx ON neosleep.ai_insight USING btree (entity_type, entity_id);


--
-- Name: neosleep_ai_insight_expires_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_ai_insight_expires_idx ON neosleep.ai_insight USING btree (expires_at) WHERE (is_stale = false);


--
-- Name: neosleep_ai_log_entity_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_ai_log_entity_idx ON neosleep.ai_generation_log USING btree (entity_type, entity_id);


--
-- Name: neosleep_ai_log_feature_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_ai_log_feature_idx ON neosleep.ai_generation_log USING btree (feature);


--
-- Name: neosleep_ai_log_user_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_ai_log_user_idx ON neosleep.ai_generation_log USING btree (user_id, created_at);


--
-- Name: neosleep_attachment_entity_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_attachment_entity_idx ON neosleep.file_attachment USING btree (entity_type, entity_id);


--
-- Name: neosleep_audit_created_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_audit_created_idx ON neosleep.audit_log USING btree (created_at);


--
-- Name: neosleep_audit_entity_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_audit_entity_idx ON neosleep.audit_log USING btree (entity_type, entity_id);


--
-- Name: neosleep_audit_user_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_audit_user_idx ON neosleep.audit_log USING btree (user_id);


--
-- Name: neosleep_consent_entity_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_consent_entity_idx ON neosleep.consent USING btree (entity_type, entity_id);


--
-- Name: neosleep_consent_jurisdiction_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_consent_jurisdiction_idx ON neosleep.consent USING btree (jurisdiction);


--
-- Name: neosleep_conv_contact_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_conv_contact_idx ON neosleep.conversation USING btree (contact_type, contact_id);


--
-- Name: neosleep_conv_last_msg_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_conv_last_msg_idx ON neosleep.conversation USING btree (last_message_at);


--
-- Name: neosleep_conv_user_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_conv_user_idx ON neosleep.conversation USING btree (user_id);


--
-- Name: neosleep_course_role_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_course_role_idx ON neosleep.training_course USING btree (required_role) WHERE (is_active = true);


--
-- Name: neosleep_efpia_pending_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_efpia_pending_idx ON neosleep.efpia_disclosure USING btree (status) WHERE (status <> 'disclosed'::text);


--
-- Name: neosleep_efpia_prac_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_efpia_prac_idx ON neosleep.efpia_disclosure USING btree (practitioner_id);


--
-- Name: neosleep_efpia_year_status_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_efpia_year_status_idx ON neosleep.efpia_disclosure USING btree (year, status);


--
-- Name: neosleep_enc_prac_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_enc_prac_idx ON neosleep.encounter USING btree (practitioner_id);


--
-- Name: neosleep_enc_prac_start_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_enc_prac_start_idx ON neosleep.encounter USING btree (practitioner_id, start_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: neosleep_enc_start_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_enc_start_idx ON neosleep.encounter USING btree (start_at);


--
-- Name: neosleep_enc_status_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_enc_status_idx ON neosleep.encounter USING btree (status) WHERE (deleted_at IS NULL);


--
-- Name: neosleep_enc_territory_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_enc_territory_idx ON neosleep.encounter USING btree (territory_id);


--
-- Name: neosleep_enc_user_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_enc_user_idx ON neosleep.encounter USING btree (user_id);


--
-- Name: neosleep_enc_user_start_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_enc_user_start_idx ON neosleep.encounter USING btree (user_id, start_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: neosleep_encpres_enc_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_encpres_enc_idx ON neosleep.encounter_presentation USING btree (encounter_id);


--
-- Name: neosleep_encprod_enc_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_encprod_enc_idx ON neosleep.encounter_product USING btree (encounter_id);


--
-- Name: neosleep_event_att_event_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_event_att_event_idx ON neosleep.event_attendee USING btree (event_id);


--
-- Name: neosleep_event_att_who_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_event_att_who_idx ON neosleep.event_attendee USING btree (attendee_type, attendee_id);


--
-- Name: neosleep_event_country_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_event_country_idx ON neosleep.event USING btree (country_code);


--
-- Name: neosleep_event_starts_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_event_starts_idx ON neosleep.event USING btree (starts_at);


--
-- Name: neosleep_event_status_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_event_status_idx ON neosleep.event USING btree (status) WHERE (deleted_at IS NULL);


--
-- Name: neosleep_identities_email_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_identities_email_idx ON neosleep.identities USING btree (email);


--
-- Name: neosleep_kpi_metric_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_kpi_metric_idx ON neosleep.kpi_snapshot USING btree (metric, period_type);


--
-- Name: neosleep_kpi_scope_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_kpi_scope_idx ON neosleep.kpi_snapshot USING btree (scope_type, scope_id, period);


--
-- Name: neosleep_kpi_unique_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE UNIQUE INDEX neosleep_kpi_unique_idx ON neosleep.kpi_snapshot USING btree (period, period_type, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid), metric);


--
-- Name: neosleep_lead_assigned_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_lead_assigned_idx ON neosleep.lead USING btree (assigned_to);


--
-- Name: neosleep_lead_status_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_lead_status_idx ON neosleep.lead USING btree (status) WHERE (deleted_at IS NULL);


--
-- Name: neosleep_lead_territory_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_lead_territory_idx ON neosleep.lead USING btree (territory_id);


--
-- Name: neosleep_lesson_course_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_lesson_course_idx ON neosleep.training_lesson USING btree (course_id, sort_order);


--
-- Name: neosleep_message_conv_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_message_conv_idx ON neosleep.message USING btree (conversation_id, sent_at);


--
-- Name: neosleep_message_sender_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_message_sender_idx ON neosleep.message USING btree (sender_type, sender_id);


--
-- Name: neosleep_mlt_entity_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_mlt_entity_idx ON neosleep.magic_link_tokens USING btree (entity_type, entity_id);


--
-- Name: neosleep_mlt_hash_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_mlt_hash_idx ON neosleep.magic_link_tokens USING btree (token_hash);


--
-- Name: neosleep_notif_created_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_notif_created_idx ON neosleep.notification USING btree (created_at);


--
-- Name: neosleep_notif_user_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_notif_user_idx ON neosleep.notification USING btree (user_id, read_at);


--
-- Name: neosleep_org_country_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_org_country_idx ON neosleep.organization USING btree (country_code);


--
-- Name: neosleep_org_status_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_org_status_idx ON neosleep.organization USING btree (status) WHERE (deleted_at IS NULL);


--
-- Name: neosleep_org_territory_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_org_territory_idx ON neosleep.organization USING btree (territory_id) WHERE (deleted_at IS NULL);


--
-- Name: neosleep_pat_webauthn_user_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_pat_webauthn_user_idx ON neosleep.patient_webauthn_credentials USING btree (patient_id);


--
-- Name: neosleep_patient_country_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_patient_country_idx ON neosleep.patient USING btree (country_code);


--
-- Name: neosleep_patient_google_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_patient_google_idx ON neosleep.patient USING btree (google_sub);


--
-- Name: neosleep_patient_prac_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_patient_prac_idx ON neosleep.patient USING btree (practitioner_id);


--
-- Name: neosleep_patient_status_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_patient_status_idx ON neosleep.patient USING btree (status) WHERE (deleted_at IS NULL);


--
-- Name: neosleep_pitem_order_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_pitem_order_idx ON neosleep.purchase_order_item USING btree (order_id);


--
-- Name: neosleep_pitem_supplier_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_pitem_supplier_idx ON neosleep.purchase_order_item USING btree (fulfillment_supplier_id);


--
-- Name: neosleep_porder_patient_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_porder_patient_idx ON neosleep.purchase_order USING btree (patient_id);


--
-- Name: neosleep_porder_status_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_porder_status_idx ON neosleep.purchase_order USING btree (status);


--
-- Name: neosleep_porder_stripe_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_porder_stripe_idx ON neosleep.purchase_order USING btree (stripe_payment_intent_id);


--
-- Name: neosleep_prac_identity_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_prac_identity_idx ON neosleep.practitioner USING btree (identity_id);


--
-- Name: neosleep_prac_org_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_prac_org_idx ON neosleep.practitioner USING btree (organization_id);


--
-- Name: neosleep_prac_specialties_gin; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_prac_specialties_gin ON neosleep.practitioner USING gin (specialties);


--
-- Name: neosleep_prac_specialty_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_prac_specialty_idx ON neosleep.practitioner USING btree (primary_specialty) WHERE (deleted_at IS NULL);


--
-- Name: neosleep_prac_status_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_prac_status_idx ON neosleep.practitioner USING btree (status) WHERE (deleted_at IS NULL);


--
-- Name: neosleep_prac_tags_gin; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_prac_tags_gin ON neosleep.practitioner USING gin (tags);


--
-- Name: neosleep_prac_territory_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_prac_territory_idx ON neosleep.practitioner USING btree (territory_id) WHERE (deleted_at IS NULL);


--
-- Name: neosleep_prac_tier_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_prac_tier_idx ON neosleep.practitioner USING btree (influence_tier);


--
-- Name: neosleep_pracassign_prac_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_pracassign_prac_idx ON neosleep.practitioner_assignment USING btree (practitioner_id);


--
-- Name: neosleep_pracassign_user_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_pracassign_user_idx ON neosleep.practitioner_assignment USING btree (user_id);


--
-- Name: neosleep_pracorg_org_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_pracorg_org_idx ON neosleep.practitioner_organization USING btree (organization_id);


--
-- Name: neosleep_pracorg_prac_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_pracorg_prac_idx ON neosleep.practitioner_organization USING btree (practitioner_id);


--
-- Name: neosleep_pres_keywords_gin; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_pres_keywords_gin ON neosleep.presentation USING gin (keywords);


--
-- Name: neosleep_pres_product_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_pres_product_idx ON neosleep.presentation USING btree (product_id) WHERE (deleted_at IS NULL);


--
-- Name: neosleep_pres_status_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_pres_status_idx ON neosleep.presentation USING btree (status) WHERE (deleted_at IS NULL);


--
-- Name: neosleep_product_keywords_gin; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_product_keywords_gin ON neosleep.product USING gin (keywords);


--
-- Name: neosleep_progress_user_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_progress_user_idx ON neosleep.training_progress USING btree (user_id, status);


--
-- Name: neosleep_prt_expires_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_prt_expires_idx ON neosleep.password_reset_tokens USING btree (expires_at);


--
-- Name: neosleep_prt_hash_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_prt_hash_idx ON neosleep.password_reset_tokens USING btree (token_hash);


--
-- Name: neosleep_push_user_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_push_user_idx ON neosleep.push_subscription USING btree (user_id);


--
-- Name: neosleep_reqlog_created_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_reqlog_created_idx ON neosleep.request_log USING btree (created_at);


--
-- Name: neosleep_reqlog_route_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_reqlog_route_idx ON neosleep.request_log USING btree (route, status_code);


--
-- Name: neosleep_reqlog_session_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_reqlog_session_idx ON neosleep.request_log USING btree (session_id);


--
-- Name: neosleep_reqlog_user_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_reqlog_user_idx ON neosleep.request_log USING btree (user_id, created_at);


--
-- Name: neosleep_rmt_expires_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_rmt_expires_idx ON neosleep.remember_me_tokens USING btree (expires_at);


--
-- Name: neosleep_rmt_hash_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_rmt_hash_idx ON neosleep.remember_me_tokens USING btree (token_hash);


--
-- Name: neosleep_rmt_user_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_rmt_user_idx ON neosleep.remember_me_tokens USING btree (user_id);


--
-- Name: neosleep_sbatch_expiry_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_sbatch_expiry_idx ON neosleep.sample_batch USING btree (expiry_date);


--
-- Name: neosleep_sbatch_product_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_sbatch_product_idx ON neosleep.sample_batch USING btree (product_id);


--
-- Name: neosleep_segmember_entity_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_segmember_entity_idx ON neosleep.segment_member USING btree (entity_type, entity_id);


--
-- Name: neosleep_segment_type_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_segment_type_idx ON neosleep.segment USING btree (entity_type) WHERE (deleted_at IS NULL);


--
-- Name: neosleep_session_active_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_session_active_idx ON neosleep.user_session USING btree (is_active) WHERE (is_active = true);


--
-- Name: neosleep_session_started_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_session_started_idx ON neosleep.user_session USING btree (started_at);


--
-- Name: neosleep_session_user_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_session_user_idx ON neosleep.user_session USING btree (user_id);


--
-- Name: neosleep_sreq_requester_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_sreq_requester_idx ON neosleep.sample_request USING btree (requester_id);


--
-- Name: neosleep_sreq_status_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_sreq_status_idx ON neosleep.sample_request USING btree (status);


--
-- Name: neosleep_sstock_user_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_sstock_user_idx ON neosleep.sample_stock USING btree (user_id);


--
-- Name: neosleep_study_doctor_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_study_doctor_idx ON neosleep.sleep_study USING btree (interpreted_by);


--
-- Name: neosleep_study_patient_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_study_patient_idx ON neosleep.sleep_study USING btree (patient_id);


--
-- Name: neosleep_study_status_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_study_status_idx ON neosleep.sleep_study USING btree (status);


--
-- Name: neosleep_stxn_batch_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_stxn_batch_idx ON neosleep.sample_transaction USING btree (batch_id);


--
-- Name: neosleep_stxn_encounter_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_stxn_encounter_idx ON neosleep.sample_transaction USING btree (encounter_id);


--
-- Name: neosleep_stxn_type_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_stxn_type_idx ON neosleep.sample_transaction USING btree (type);


--
-- Name: neosleep_stxn_user_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_stxn_user_idx ON neosleep.sample_transaction USING btree (user_id, created_at);


--
-- Name: neosleep_supplier_type_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_supplier_type_idx ON neosleep.supplier USING btree (type) WHERE (is_active = true);


--
-- Name: neosleep_sync_status_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_sync_status_idx ON neosleep.sync_queue USING btree (status, created_at);


--
-- Name: neosleep_sync_user_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_sync_user_idx ON neosleep.sync_queue USING btree (user_id, status);


--
-- Name: neosleep_target_user_period_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_target_user_period_idx ON neosleep.target USING btree (user_id, period);


--
-- Name: neosleep_territory_country_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_territory_country_idx ON neosleep.territory USING btree (country_code);


--
-- Name: neosleep_territory_user_user_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_territory_user_user_idx ON neosleep.territory_user USING btree (user_id);


--
-- Name: neosleep_ticket_assignee_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_ticket_assignee_idx ON neosleep.support_ticket USING btree (assigned_to, status);


--
-- Name: neosleep_ticket_patient_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_ticket_patient_idx ON neosleep.support_ticket USING btree (patient_id);


--
-- Name: neosleep_ticket_status_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_ticket_status_idx ON neosleep.support_ticket USING btree (status);


--
-- Name: neosleep_tx_dentist_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_tx_dentist_idx ON neosleep.treatment_plan USING btree (dentist_id);


--
-- Name: neosleep_tx_patient_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_tx_patient_idx ON neosleep.treatment_plan USING btree (patient_id);


--
-- Name: neosleep_tx_study_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_tx_study_idx ON neosleep.treatment_plan USING btree (sleep_study_id);


--
-- Name: neosleep_tx_type_status_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_tx_type_status_idx ON neosleep.treatment_plan USING btree (type, status);


--
-- Name: neosleep_user_roles_user_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_user_roles_user_idx ON neosleep.user_roles USING btree (user_id);


--
-- Name: neosleep_users_identity_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_users_identity_idx ON neosleep.users USING btree (identity_id);


--
-- Name: neosleep_users_manager_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_users_manager_idx ON neosleep.users USING btree (manager_id);


--
-- Name: neosleep_users_status_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_users_status_idx ON neosleep.users USING btree (status) WHERE (deleted_at IS NULL);


--
-- Name: neosleep_vplan_date_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_vplan_date_idx ON neosleep.visit_plan USING btree (planned_at);


--
-- Name: neosleep_vplan_user_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_vplan_user_idx ON neosleep.visit_plan USING btree (user_id);


--
-- Name: neosleep_webauthn_user_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_webauthn_user_idx ON neosleep.webauthn_credentials USING btree (user_id);


--
-- Name: neosleep_webhook_source_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_webhook_source_idx ON neosleep.webhook_event USING btree (source);


--
-- Name: neosleep_webhook_status_idx; Type: INDEX; Schema: neosleep; Owner: -
--

CREATE INDEX neosleep_webhook_status_idx ON neosleep.webhook_event USING btree (status, created_at);


--
-- Name: idx_platform_audit_action; Type: INDEX; Schema: platform; Owner: -
--

CREATE INDEX idx_platform_audit_action ON platform.audit USING btree (action);


--
-- Name: idx_platform_audit_actor; Type: INDEX; Schema: platform; Owner: -
--

CREATE INDEX idx_platform_audit_actor ON platform.audit USING btree (actor_id);


--
-- Name: idx_platform_audit_created; Type: INDEX; Schema: platform; Owner: -
--

CREATE INDEX idx_platform_audit_created ON platform.audit USING btree (created_at);


--
-- Name: idx_platform_diagnostics_created; Type: INDEX; Schema: platform; Owner: -
--

CREATE INDEX idx_platform_diagnostics_created ON platform.diagnostics USING btree (created_at);


--
-- Name: idx_platform_diagnostics_hash; Type: INDEX; Schema: platform; Owner: -
--

CREATE INDEX idx_platform_diagnostics_hash ON platform.diagnostics USING btree (message_hash);


--
-- Name: idx_platform_diagnostics_level; Type: INDEX; Schema: platform; Owner: -
--

CREATE INDEX idx_platform_diagnostics_level ON platform.diagnostics USING btree (level);


--
-- Name: idx_platform_diagnostics_status; Type: INDEX; Schema: platform; Owner: -
--

CREATE INDEX idx_platform_diagnostics_status ON platform.diagnostics USING btree (status);


--
-- Name: idx_platform_diagnostics_tenant; Type: INDEX; Schema: platform; Owner: -
--

CREATE INDEX idx_platform_diagnostics_tenant ON platform.diagnostics USING btree (tenant_slug);


--
-- Name: idx_platform_dpa_current; Type: INDEX; Schema: platform; Owner: -
--

CREATE INDEX idx_platform_dpa_current ON platform.dpa_agreement USING btree (tenant_id) WHERE (is_current = true);


--
-- Name: idx_platform_dpa_tenant; Type: INDEX; Schema: platform; Owner: -
--

CREATE INDEX idx_platform_dpa_tenant ON platform.dpa_agreement USING btree (tenant_id);


--
-- Name: idx_platform_invoice_period; Type: INDEX; Schema: platform; Owner: -
--

CREATE INDEX idx_platform_invoice_period ON platform.invoice USING btree (period_start, period_end);


--
-- Name: idx_platform_invoice_status; Type: INDEX; Schema: platform; Owner: -
--

CREATE INDEX idx_platform_invoice_status ON platform.invoice USING btree (status);


--
-- Name: idx_platform_invoice_tenant; Type: INDEX; Schema: platform; Owner: -
--

CREATE INDEX idx_platform_invoice_tenant ON platform.invoice USING btree (tenant_id);


--
-- Name: idx_platform_lookups_locale; Type: INDEX; Schema: platform; Owner: -
--

CREATE INDEX idx_platform_lookups_locale ON platform.lookups USING btree (locale);


--
-- Name: idx_platform_lookups_type; Type: INDEX; Schema: platform; Owner: -
--

CREATE INDEX idx_platform_lookups_type ON platform.lookups USING btree (type);


--
-- Name: idx_platform_pm_owner; Type: INDEX; Schema: platform; Owner: -
--

CREATE INDEX idx_platform_pm_owner ON platform.payment_method USING btree (owner_type, owner_id);


--
-- Name: idx_platform_pm_stripe_cust; Type: INDEX; Schema: platform; Owner: -
--

CREATE INDEX idx_platform_pm_stripe_cust ON platform.payment_method USING btree (stripe_customer_id);


--
-- Name: idx_platform_tenants_company; Type: INDEX; Schema: platform; Owner: -
--

CREATE INDEX idx_platform_tenants_company ON platform.tenants USING btree (company_id);


--
-- Name: idx_platform_tenants_status; Type: INDEX; Schema: platform; Owner: -
--

CREATE INDEX idx_platform_tenants_status ON platform.tenants USING btree (status);


--
-- Name: ai_generation_log ai_generation_log_user_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.ai_generation_log
    ADD CONSTRAINT ai_generation_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES fourseasons.users(id) ON DELETE SET NULL;


--
-- Name: audit_log audit_log_session_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.audit_log
    ADD CONSTRAINT audit_log_session_id_fkey FOREIGN KEY (session_id) REFERENCES fourseasons.user_session(id) ON DELETE SET NULL;


--
-- Name: audit_log audit_log_user_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.audit_log
    ADD CONSTRAINT audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES fourseasons.users(id) ON DELETE SET NULL;


--
-- Name: consent consent_collected_by_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.consent
    ADD CONSTRAINT consent_collected_by_fkey FOREIGN KEY (collected_by) REFERENCES fourseasons.users(id) ON DELETE SET NULL;


--
-- Name: conversation conversation_user_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.conversation
    ADD CONSTRAINT conversation_user_id_fkey FOREIGN KEY (user_id) REFERENCES fourseasons.users(id) ON DELETE CASCADE;


--
-- Name: efpia_disclosure efpia_disclosure_approved_by_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.efpia_disclosure
    ADD CONSTRAINT efpia_disclosure_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES fourseasons.users(id) ON DELETE SET NULL;


--
-- Name: efpia_disclosure efpia_disclosure_practitioner_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.efpia_disclosure
    ADD CONSTRAINT efpia_disclosure_practitioner_id_fkey FOREIGN KEY (practitioner_id) REFERENCES fourseasons.practitioner(id) ON DELETE RESTRICT;


--
-- Name: encounter encounter_organization_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.encounter
    ADD CONSTRAINT encounter_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES fourseasons.organization(id) ON DELETE SET NULL;


--
-- Name: encounter encounter_practitioner_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.encounter
    ADD CONSTRAINT encounter_practitioner_id_fkey FOREIGN KEY (practitioner_id) REFERENCES fourseasons.practitioner(id) ON DELETE SET NULL;


--
-- Name: encounter_presentation encounter_presentation_encounter_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.encounter_presentation
    ADD CONSTRAINT encounter_presentation_encounter_id_fkey FOREIGN KEY (encounter_id) REFERENCES fourseasons.encounter(id) ON DELETE CASCADE;


--
-- Name: encounter_presentation encounter_presentation_presentation_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.encounter_presentation
    ADD CONSTRAINT encounter_presentation_presentation_id_fkey FOREIGN KEY (presentation_id) REFERENCES fourseasons.presentation(id) ON DELETE CASCADE;


--
-- Name: encounter_product encounter_product_encounter_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.encounter_product
    ADD CONSTRAINT encounter_product_encounter_id_fkey FOREIGN KEY (encounter_id) REFERENCES fourseasons.encounter(id) ON DELETE CASCADE;


--
-- Name: encounter_product encounter_product_product_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.encounter_product
    ADD CONSTRAINT encounter_product_product_id_fkey FOREIGN KEY (product_id) REFERENCES fourseasons.product(id) ON DELETE CASCADE;


--
-- Name: encounter encounter_territory_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.encounter
    ADD CONSTRAINT encounter_territory_id_fkey FOREIGN KEY (territory_id) REFERENCES fourseasons.territory(id) ON DELETE SET NULL;


--
-- Name: encounter encounter_user_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.encounter
    ADD CONSTRAINT encounter_user_id_fkey FOREIGN KEY (user_id) REFERENCES fourseasons.users(id) ON DELETE CASCADE;


--
-- Name: event_attendee event_attendee_event_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.event_attendee
    ADD CONSTRAINT event_attendee_event_id_fkey FOREIGN KEY (event_id) REFERENCES fourseasons.event(id) ON DELETE CASCADE;


--
-- Name: event event_territory_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.event
    ADD CONSTRAINT event_territory_id_fkey FOREIGN KEY (territory_id) REFERENCES fourseasons.territory(id) ON DELETE SET NULL;


--
-- Name: file_attachment file_attachment_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.file_attachment
    ADD CONSTRAINT file_attachment_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES fourseasons.users(id) ON DELETE SET NULL;


--
-- Name: purchase_order_item fourseasons_pitem_product_fk; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.purchase_order_item
    ADD CONSTRAINT fourseasons_pitem_product_fk FOREIGN KEY (product_id) REFERENCES fourseasons.product(id) ON DELETE SET NULL;


--
-- Name: sleep_study fourseasons_study_order_fk; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.sleep_study
    ADD CONSTRAINT fourseasons_study_order_fk FOREIGN KEY (purchase_order_id) REFERENCES fourseasons.purchase_order(id) ON DELETE SET NULL;


--
-- Name: support_ticket fourseasons_ticket_conv_fk; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.support_ticket
    ADD CONSTRAINT fourseasons_ticket_conv_fk FOREIGN KEY (conversation_id) REFERENCES fourseasons.conversation(id) ON DELETE CASCADE;


--
-- Name: treatment_plan fourseasons_tx_product_fk; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.treatment_plan
    ADD CONSTRAINT fourseasons_tx_product_fk FOREIGN KEY (device_product_id) REFERENCES fourseasons.product(id) ON DELETE SET NULL;


--
-- Name: treatment_plan fourseasons_tx_purchase_order_fk; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.treatment_plan
    ADD CONSTRAINT fourseasons_tx_purchase_order_fk FOREIGN KEY (device_purchase_order_id) REFERENCES fourseasons.purchase_order(id) ON DELETE SET NULL;


--
-- Name: users fourseasons_users_territory_fk; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.users
    ADD CONSTRAINT fourseasons_users_territory_fk FOREIGN KEY (territory_id) REFERENCES fourseasons.territory(id) ON DELETE SET NULL;


--
-- Name: lead lead_assigned_to_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.lead
    ADD CONSTRAINT lead_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES fourseasons.users(id) ON DELETE SET NULL;


--
-- Name: lead lead_identity_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.lead
    ADD CONSTRAINT lead_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES fourseasons.identities(id) ON DELETE CASCADE;


--
-- Name: lead lead_territory_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.lead
    ADD CONSTRAINT lead_territory_id_fkey FOREIGN KEY (territory_id) REFERENCES fourseasons.territory(id) ON DELETE SET NULL;


--
-- Name: lookup lookup_global_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.lookup
    ADD CONSTRAINT lookup_global_id_fkey FOREIGN KEY (global_id) REFERENCES platform.lookups(id) ON DELETE SET NULL;


--
-- Name: message message_conversation_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.message
    ADD CONSTRAINT message_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES fourseasons.conversation(id) ON DELETE CASCADE;


--
-- Name: notification notification_user_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.notification
    ADD CONSTRAINT notification_user_id_fkey FOREIGN KEY (user_id) REFERENCES fourseasons.users(id) ON DELETE CASCADE;


--
-- Name: organization organization_territory_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.organization
    ADD CONSTRAINT organization_territory_id_fkey FOREIGN KEY (territory_id) REFERENCES fourseasons.territory(id) ON DELETE SET NULL;


--
-- Name: password_reset_tokens password_reset_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES fourseasons.users(id) ON DELETE CASCADE;


--
-- Name: patient patient_identity_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.patient
    ADD CONSTRAINT patient_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES fourseasons.identities(id) ON DELETE CASCADE;


--
-- Name: patient patient_practitioner_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.patient
    ADD CONSTRAINT patient_practitioner_id_fkey FOREIGN KEY (practitioner_id) REFERENCES fourseasons.practitioner(id) ON DELETE SET NULL;


--
-- Name: patient patient_territory_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.patient
    ADD CONSTRAINT patient_territory_id_fkey FOREIGN KEY (territory_id) REFERENCES fourseasons.territory(id) ON DELETE SET NULL;


--
-- Name: patient_webauthn_credentials patient_webauthn_credentials_patient_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.patient_webauthn_credentials
    ADD CONSTRAINT patient_webauthn_credentials_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES fourseasons.patient(id) ON DELETE CASCADE;


--
-- Name: practitioner_assignment practitioner_assignment_practitioner_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.practitioner_assignment
    ADD CONSTRAINT practitioner_assignment_practitioner_id_fkey FOREIGN KEY (practitioner_id) REFERENCES fourseasons.practitioner(id) ON DELETE CASCADE;


--
-- Name: practitioner_assignment practitioner_assignment_primary_org_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.practitioner_assignment
    ADD CONSTRAINT practitioner_assignment_primary_org_id_fkey FOREIGN KEY (primary_org_id) REFERENCES fourseasons.organization(id) ON DELETE SET NULL;


--
-- Name: practitioner_assignment practitioner_assignment_user_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.practitioner_assignment
    ADD CONSTRAINT practitioner_assignment_user_id_fkey FOREIGN KEY (user_id) REFERENCES fourseasons.users(id) ON DELETE CASCADE;


--
-- Name: practitioner practitioner_identity_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.practitioner
    ADD CONSTRAINT practitioner_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES fourseasons.identities(id) ON DELETE CASCADE;


--
-- Name: practitioner practitioner_organization_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.practitioner
    ADD CONSTRAINT practitioner_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES fourseasons.organization(id) ON DELETE SET NULL;


--
-- Name: practitioner_organization practitioner_organization_organization_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.practitioner_organization
    ADD CONSTRAINT practitioner_organization_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES fourseasons.organization(id) ON DELETE CASCADE;


--
-- Name: practitioner_organization practitioner_organization_practitioner_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.practitioner_organization
    ADD CONSTRAINT practitioner_organization_practitioner_id_fkey FOREIGN KEY (practitioner_id) REFERENCES fourseasons.practitioner(id) ON DELETE CASCADE;


--
-- Name: practitioner practitioner_territory_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.practitioner
    ADD CONSTRAINT practitioner_territory_id_fkey FOREIGN KEY (territory_id) REFERENCES fourseasons.territory(id) ON DELETE SET NULL;


--
-- Name: presentation presentation_product_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.presentation
    ADD CONSTRAINT presentation_product_id_fkey FOREIGN KEY (product_id) REFERENCES fourseasons.product(id) ON DELETE SET NULL;


--
-- Name: presentation presentation_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.presentation
    ADD CONSTRAINT presentation_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES fourseasons.users(id) ON DELETE SET NULL;


--
-- Name: purchase_order_item purchase_order_item_fulfillment_supplier_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.purchase_order_item
    ADD CONSTRAINT purchase_order_item_fulfillment_supplier_id_fkey FOREIGN KEY (fulfillment_supplier_id) REFERENCES fourseasons.supplier(id) ON DELETE SET NULL;


--
-- Name: purchase_order_item purchase_order_item_order_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.purchase_order_item
    ADD CONSTRAINT purchase_order_item_order_id_fkey FOREIGN KEY (order_id) REFERENCES fourseasons.purchase_order(id) ON DELETE CASCADE;


--
-- Name: purchase_order purchase_order_patient_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.purchase_order
    ADD CONSTRAINT purchase_order_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES fourseasons.patient(id) ON DELETE RESTRICT;


--
-- Name: push_subscription push_subscription_user_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.push_subscription
    ADD CONSTRAINT push_subscription_user_id_fkey FOREIGN KEY (user_id) REFERENCES fourseasons.users(id) ON DELETE CASCADE;


--
-- Name: remember_me_tokens remember_me_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.remember_me_tokens
    ADD CONSTRAINT remember_me_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES fourseasons.users(id) ON DELETE CASCADE;


--
-- Name: request_log request_log_session_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.request_log
    ADD CONSTRAINT request_log_session_id_fkey FOREIGN KEY (session_id) REFERENCES fourseasons.user_session(id) ON DELETE SET NULL;


--
-- Name: request_log request_log_user_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.request_log
    ADD CONSTRAINT request_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES fourseasons.users(id) ON DELETE SET NULL;


--
-- Name: sample_batch sample_batch_product_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.sample_batch
    ADD CONSTRAINT sample_batch_product_id_fkey FOREIGN KEY (product_id) REFERENCES fourseasons.product(id) ON DELETE RESTRICT;


--
-- Name: sample_batch sample_batch_received_by_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.sample_batch
    ADD CONSTRAINT sample_batch_received_by_fkey FOREIGN KEY (received_by) REFERENCES fourseasons.users(id) ON DELETE SET NULL;


--
-- Name: sample_request sample_request_approved_by_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.sample_request
    ADD CONSTRAINT sample_request_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES fourseasons.users(id) ON DELETE SET NULL;


--
-- Name: sample_request sample_request_product_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.sample_request
    ADD CONSTRAINT sample_request_product_id_fkey FOREIGN KEY (product_id) REFERENCES fourseasons.product(id) ON DELETE RESTRICT;


--
-- Name: sample_request sample_request_requester_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.sample_request
    ADD CONSTRAINT sample_request_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES fourseasons.users(id) ON DELETE CASCADE;


--
-- Name: sample_stock sample_stock_product_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.sample_stock
    ADD CONSTRAINT sample_stock_product_id_fkey FOREIGN KEY (product_id) REFERENCES fourseasons.product(id) ON DELETE RESTRICT;


--
-- Name: sample_stock sample_stock_user_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.sample_stock
    ADD CONSTRAINT sample_stock_user_id_fkey FOREIGN KEY (user_id) REFERENCES fourseasons.users(id) ON DELETE CASCADE;


--
-- Name: sample_transaction sample_transaction_batch_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.sample_transaction
    ADD CONSTRAINT sample_transaction_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES fourseasons.sample_batch(id) ON DELETE RESTRICT;


--
-- Name: sample_transaction sample_transaction_encounter_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.sample_transaction
    ADD CONSTRAINT sample_transaction_encounter_id_fkey FOREIGN KEY (encounter_id) REFERENCES fourseasons.encounter(id) ON DELETE SET NULL;


--
-- Name: sample_transaction sample_transaction_practitioner_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.sample_transaction
    ADD CONSTRAINT sample_transaction_practitioner_id_fkey FOREIGN KEY (practitioner_id) REFERENCES fourseasons.practitioner(id) ON DELETE SET NULL;


--
-- Name: sample_transaction sample_transaction_product_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.sample_transaction
    ADD CONSTRAINT sample_transaction_product_id_fkey FOREIGN KEY (product_id) REFERENCES fourseasons.product(id) ON DELETE RESTRICT;


--
-- Name: sample_transaction sample_transaction_to_user_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.sample_transaction
    ADD CONSTRAINT sample_transaction_to_user_id_fkey FOREIGN KEY (to_user_id) REFERENCES fourseasons.users(id) ON DELETE SET NULL;


--
-- Name: sample_transaction sample_transaction_user_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.sample_transaction
    ADD CONSTRAINT sample_transaction_user_id_fkey FOREIGN KEY (user_id) REFERENCES fourseasons.users(id) ON DELETE RESTRICT;


--
-- Name: segment segment_created_by_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.segment
    ADD CONSTRAINT segment_created_by_fkey FOREIGN KEY (created_by) REFERENCES fourseasons.users(id) ON DELETE SET NULL;


--
-- Name: segment_member segment_member_segment_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.segment_member
    ADD CONSTRAINT segment_member_segment_id_fkey FOREIGN KEY (segment_id) REFERENCES fourseasons.segment(id) ON DELETE CASCADE;


--
-- Name: sleep_study sleep_study_interpreted_by_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.sleep_study
    ADD CONSTRAINT sleep_study_interpreted_by_fkey FOREIGN KEY (interpreted_by) REFERENCES fourseasons.practitioner(id) ON DELETE SET NULL;


--
-- Name: sleep_study sleep_study_patient_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.sleep_study
    ADD CONSTRAINT sleep_study_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES fourseasons.patient(id) ON DELETE CASCADE;


--
-- Name: sleep_study sleep_study_supplier_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.sleep_study
    ADD CONSTRAINT sleep_study_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES fourseasons.supplier(id) ON DELETE SET NULL;


--
-- Name: support_ticket support_ticket_assigned_to_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.support_ticket
    ADD CONSTRAINT support_ticket_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES fourseasons.users(id) ON DELETE SET NULL;


--
-- Name: support_ticket support_ticket_patient_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.support_ticket
    ADD CONSTRAINT support_ticket_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES fourseasons.patient(id) ON DELETE SET NULL;


--
-- Name: sync_queue sync_queue_user_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.sync_queue
    ADD CONSTRAINT sync_queue_user_id_fkey FOREIGN KEY (user_id) REFERENCES fourseasons.users(id) ON DELETE CASCADE;


--
-- Name: target target_approved_by_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.target
    ADD CONSTRAINT target_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES fourseasons.users(id) ON DELETE SET NULL;


--
-- Name: target target_set_by_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.target
    ADD CONSTRAINT target_set_by_fkey FOREIGN KEY (set_by) REFERENCES fourseasons.users(id) ON DELETE SET NULL;


--
-- Name: target target_territory_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.target
    ADD CONSTRAINT target_territory_id_fkey FOREIGN KEY (territory_id) REFERENCES fourseasons.territory(id) ON DELETE SET NULL;


--
-- Name: target target_user_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.target
    ADD CONSTRAINT target_user_id_fkey FOREIGN KEY (user_id) REFERENCES fourseasons.users(id) ON DELETE CASCADE;


--
-- Name: territory territory_parent_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.territory
    ADD CONSTRAINT territory_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES fourseasons.territory(id) ON DELETE SET NULL;


--
-- Name: territory_user territory_user_territory_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.territory_user
    ADD CONSTRAINT territory_user_territory_id_fkey FOREIGN KEY (territory_id) REFERENCES fourseasons.territory(id) ON DELETE CASCADE;


--
-- Name: territory_user territory_user_user_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.territory_user
    ADD CONSTRAINT territory_user_user_id_fkey FOREIGN KEY (user_id) REFERENCES fourseasons.users(id) ON DELETE CASCADE;


--
-- Name: training_lesson training_lesson_course_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.training_lesson
    ADD CONSTRAINT training_lesson_course_id_fkey FOREIGN KEY (course_id) REFERENCES fourseasons.training_course(id) ON DELETE CASCADE;


--
-- Name: training_progress training_progress_lesson_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.training_progress
    ADD CONSTRAINT training_progress_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES fourseasons.training_lesson(id) ON DELETE CASCADE;


--
-- Name: training_progress training_progress_user_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.training_progress
    ADD CONSTRAINT training_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES fourseasons.users(id) ON DELETE CASCADE;


--
-- Name: treatment_plan treatment_plan_appliance_supplier_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.treatment_plan
    ADD CONSTRAINT treatment_plan_appliance_supplier_id_fkey FOREIGN KEY (appliance_supplier_id) REFERENCES fourseasons.supplier(id) ON DELETE SET NULL;


--
-- Name: treatment_plan treatment_plan_dentist_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.treatment_plan
    ADD CONSTRAINT treatment_plan_dentist_id_fkey FOREIGN KEY (dentist_id) REFERENCES fourseasons.practitioner(id) ON DELETE SET NULL;


--
-- Name: treatment_plan treatment_plan_patient_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.treatment_plan
    ADD CONSTRAINT treatment_plan_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES fourseasons.patient(id) ON DELETE CASCADE;


--
-- Name: treatment_plan treatment_plan_recommended_by_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.treatment_plan
    ADD CONSTRAINT treatment_plan_recommended_by_fkey FOREIGN KEY (recommended_by) REFERENCES fourseasons.practitioner(id) ON DELETE SET NULL;


--
-- Name: treatment_plan treatment_plan_scan_supplier_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.treatment_plan
    ADD CONSTRAINT treatment_plan_scan_supplier_id_fkey FOREIGN KEY (scan_supplier_id) REFERENCES fourseasons.supplier(id) ON DELETE SET NULL;


--
-- Name: treatment_plan treatment_plan_sleep_study_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.treatment_plan
    ADD CONSTRAINT treatment_plan_sleep_study_id_fkey FOREIGN KEY (sleep_study_id) REFERENCES fourseasons.sleep_study(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES fourseasons.users(id) ON DELETE CASCADE;


--
-- Name: user_session user_session_user_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.user_session
    ADD CONSTRAINT user_session_user_id_fkey FOREIGN KEY (user_id) REFERENCES fourseasons.users(id) ON DELETE CASCADE;


--
-- Name: users users_identity_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.users
    ADD CONSTRAINT users_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES fourseasons.identities(id) ON DELETE CASCADE;


--
-- Name: users users_manager_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.users
    ADD CONSTRAINT users_manager_id_fkey FOREIGN KEY (manager_id) REFERENCES fourseasons.users(id) ON DELETE SET NULL;


--
-- Name: visit_plan visit_plan_organization_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.visit_plan
    ADD CONSTRAINT visit_plan_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES fourseasons.organization(id) ON DELETE SET NULL;


--
-- Name: visit_plan visit_plan_practitioner_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.visit_plan
    ADD CONSTRAINT visit_plan_practitioner_id_fkey FOREIGN KEY (practitioner_id) REFERENCES fourseasons.practitioner(id) ON DELETE SET NULL;


--
-- Name: visit_plan visit_plan_territory_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.visit_plan
    ADD CONSTRAINT visit_plan_territory_id_fkey FOREIGN KEY (territory_id) REFERENCES fourseasons.territory(id) ON DELETE SET NULL;


--
-- Name: visit_plan visit_plan_user_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.visit_plan
    ADD CONSTRAINT visit_plan_user_id_fkey FOREIGN KEY (user_id) REFERENCES fourseasons.users(id) ON DELETE CASCADE;


--
-- Name: webauthn_credentials webauthn_credentials_user_id_fkey; Type: FK CONSTRAINT; Schema: fourseasons; Owner: -
--

ALTER TABLE ONLY fourseasons.webauthn_credentials
    ADD CONSTRAINT webauthn_credentials_user_id_fkey FOREIGN KEY (user_id) REFERENCES fourseasons.users(id) ON DELETE CASCADE;


--
-- Name: ai_generation_log ai_generation_log_user_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.ai_generation_log
    ADD CONSTRAINT ai_generation_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES neosleep.users(id) ON DELETE SET NULL;


--
-- Name: audit_log audit_log_session_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.audit_log
    ADD CONSTRAINT audit_log_session_id_fkey FOREIGN KEY (session_id) REFERENCES neosleep.user_session(id) ON DELETE SET NULL;


--
-- Name: audit_log audit_log_user_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.audit_log
    ADD CONSTRAINT audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES neosleep.users(id) ON DELETE SET NULL;


--
-- Name: consent consent_collected_by_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.consent
    ADD CONSTRAINT consent_collected_by_fkey FOREIGN KEY (collected_by) REFERENCES neosleep.users(id) ON DELETE SET NULL;


--
-- Name: conversation conversation_user_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.conversation
    ADD CONSTRAINT conversation_user_id_fkey FOREIGN KEY (user_id) REFERENCES neosleep.users(id) ON DELETE CASCADE;


--
-- Name: efpia_disclosure efpia_disclosure_approved_by_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.efpia_disclosure
    ADD CONSTRAINT efpia_disclosure_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES neosleep.users(id) ON DELETE SET NULL;


--
-- Name: efpia_disclosure efpia_disclosure_practitioner_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.efpia_disclosure
    ADD CONSTRAINT efpia_disclosure_practitioner_id_fkey FOREIGN KEY (practitioner_id) REFERENCES neosleep.practitioner(id) ON DELETE RESTRICT;


--
-- Name: encounter encounter_organization_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.encounter
    ADD CONSTRAINT encounter_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES neosleep.organization(id) ON DELETE SET NULL;


--
-- Name: encounter encounter_practitioner_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.encounter
    ADD CONSTRAINT encounter_practitioner_id_fkey FOREIGN KEY (practitioner_id) REFERENCES neosleep.practitioner(id) ON DELETE SET NULL;


--
-- Name: encounter_presentation encounter_presentation_encounter_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.encounter_presentation
    ADD CONSTRAINT encounter_presentation_encounter_id_fkey FOREIGN KEY (encounter_id) REFERENCES neosleep.encounter(id) ON DELETE CASCADE;


--
-- Name: encounter_presentation encounter_presentation_presentation_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.encounter_presentation
    ADD CONSTRAINT encounter_presentation_presentation_id_fkey FOREIGN KEY (presentation_id) REFERENCES neosleep.presentation(id) ON DELETE CASCADE;


--
-- Name: encounter_product encounter_product_encounter_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.encounter_product
    ADD CONSTRAINT encounter_product_encounter_id_fkey FOREIGN KEY (encounter_id) REFERENCES neosleep.encounter(id) ON DELETE CASCADE;


--
-- Name: encounter_product encounter_product_product_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.encounter_product
    ADD CONSTRAINT encounter_product_product_id_fkey FOREIGN KEY (product_id) REFERENCES neosleep.product(id) ON DELETE CASCADE;


--
-- Name: encounter encounter_territory_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.encounter
    ADD CONSTRAINT encounter_territory_id_fkey FOREIGN KEY (territory_id) REFERENCES neosleep.territory(id) ON DELETE SET NULL;


--
-- Name: encounter encounter_user_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.encounter
    ADD CONSTRAINT encounter_user_id_fkey FOREIGN KEY (user_id) REFERENCES neosleep.users(id) ON DELETE CASCADE;


--
-- Name: event_attendee event_attendee_event_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.event_attendee
    ADD CONSTRAINT event_attendee_event_id_fkey FOREIGN KEY (event_id) REFERENCES neosleep.event(id) ON DELETE CASCADE;


--
-- Name: event event_territory_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.event
    ADD CONSTRAINT event_territory_id_fkey FOREIGN KEY (territory_id) REFERENCES neosleep.territory(id) ON DELETE SET NULL;


--
-- Name: file_attachment file_attachment_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.file_attachment
    ADD CONSTRAINT file_attachment_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES neosleep.users(id) ON DELETE SET NULL;


--
-- Name: lead lead_assigned_to_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.lead
    ADD CONSTRAINT lead_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES neosleep.users(id) ON DELETE SET NULL;


--
-- Name: lead lead_identity_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.lead
    ADD CONSTRAINT lead_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES neosleep.identities(id) ON DELETE CASCADE;


--
-- Name: lead lead_territory_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.lead
    ADD CONSTRAINT lead_territory_id_fkey FOREIGN KEY (territory_id) REFERENCES neosleep.territory(id) ON DELETE SET NULL;


--
-- Name: lookup lookup_global_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.lookup
    ADD CONSTRAINT lookup_global_id_fkey FOREIGN KEY (global_id) REFERENCES platform.lookups(id) ON DELETE SET NULL;


--
-- Name: message message_conversation_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.message
    ADD CONSTRAINT message_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES neosleep.conversation(id) ON DELETE CASCADE;


--
-- Name: purchase_order_item neosleep_pitem_product_fk; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.purchase_order_item
    ADD CONSTRAINT neosleep_pitem_product_fk FOREIGN KEY (product_id) REFERENCES neosleep.product(id) ON DELETE SET NULL;


--
-- Name: sleep_study neosleep_study_order_fk; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.sleep_study
    ADD CONSTRAINT neosleep_study_order_fk FOREIGN KEY (purchase_order_id) REFERENCES neosleep.purchase_order(id) ON DELETE SET NULL;


--
-- Name: support_ticket neosleep_ticket_conv_fk; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.support_ticket
    ADD CONSTRAINT neosleep_ticket_conv_fk FOREIGN KEY (conversation_id) REFERENCES neosleep.conversation(id) ON DELETE CASCADE;


--
-- Name: treatment_plan neosleep_tx_product_fk; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.treatment_plan
    ADD CONSTRAINT neosleep_tx_product_fk FOREIGN KEY (device_product_id) REFERENCES neosleep.product(id) ON DELETE SET NULL;


--
-- Name: treatment_plan neosleep_tx_purchase_order_fk; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.treatment_plan
    ADD CONSTRAINT neosleep_tx_purchase_order_fk FOREIGN KEY (device_purchase_order_id) REFERENCES neosleep.purchase_order(id) ON DELETE SET NULL;


--
-- Name: users neosleep_users_territory_fk; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.users
    ADD CONSTRAINT neosleep_users_territory_fk FOREIGN KEY (territory_id) REFERENCES neosleep.territory(id) ON DELETE SET NULL;


--
-- Name: notification notification_user_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.notification
    ADD CONSTRAINT notification_user_id_fkey FOREIGN KEY (user_id) REFERENCES neosleep.users(id) ON DELETE CASCADE;


--
-- Name: organization organization_territory_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.organization
    ADD CONSTRAINT organization_territory_id_fkey FOREIGN KEY (territory_id) REFERENCES neosleep.territory(id) ON DELETE SET NULL;


--
-- Name: password_reset_tokens password_reset_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES neosleep.users(id) ON DELETE CASCADE;


--
-- Name: patient patient_identity_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.patient
    ADD CONSTRAINT patient_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES neosleep.identities(id) ON DELETE CASCADE;


--
-- Name: patient patient_practitioner_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.patient
    ADD CONSTRAINT patient_practitioner_id_fkey FOREIGN KEY (practitioner_id) REFERENCES neosleep.practitioner(id) ON DELETE SET NULL;


--
-- Name: patient patient_territory_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.patient
    ADD CONSTRAINT patient_territory_id_fkey FOREIGN KEY (territory_id) REFERENCES neosleep.territory(id) ON DELETE SET NULL;


--
-- Name: patient_webauthn_credentials patient_webauthn_credentials_patient_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.patient_webauthn_credentials
    ADD CONSTRAINT patient_webauthn_credentials_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES neosleep.patient(id) ON DELETE CASCADE;


--
-- Name: practitioner_assignment practitioner_assignment_practitioner_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.practitioner_assignment
    ADD CONSTRAINT practitioner_assignment_practitioner_id_fkey FOREIGN KEY (practitioner_id) REFERENCES neosleep.practitioner(id) ON DELETE CASCADE;


--
-- Name: practitioner_assignment practitioner_assignment_primary_org_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.practitioner_assignment
    ADD CONSTRAINT practitioner_assignment_primary_org_id_fkey FOREIGN KEY (primary_org_id) REFERENCES neosleep.organization(id) ON DELETE SET NULL;


--
-- Name: practitioner_assignment practitioner_assignment_user_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.practitioner_assignment
    ADD CONSTRAINT practitioner_assignment_user_id_fkey FOREIGN KEY (user_id) REFERENCES neosleep.users(id) ON DELETE CASCADE;


--
-- Name: practitioner practitioner_identity_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.practitioner
    ADD CONSTRAINT practitioner_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES neosleep.identities(id) ON DELETE CASCADE;


--
-- Name: practitioner practitioner_organization_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.practitioner
    ADD CONSTRAINT practitioner_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES neosleep.organization(id) ON DELETE SET NULL;


--
-- Name: practitioner_organization practitioner_organization_organization_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.practitioner_organization
    ADD CONSTRAINT practitioner_organization_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES neosleep.organization(id) ON DELETE CASCADE;


--
-- Name: practitioner_organization practitioner_organization_practitioner_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.practitioner_organization
    ADD CONSTRAINT practitioner_organization_practitioner_id_fkey FOREIGN KEY (practitioner_id) REFERENCES neosleep.practitioner(id) ON DELETE CASCADE;


--
-- Name: practitioner practitioner_territory_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.practitioner
    ADD CONSTRAINT practitioner_territory_id_fkey FOREIGN KEY (territory_id) REFERENCES neosleep.territory(id) ON DELETE SET NULL;


--
-- Name: presentation presentation_product_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.presentation
    ADD CONSTRAINT presentation_product_id_fkey FOREIGN KEY (product_id) REFERENCES neosleep.product(id) ON DELETE SET NULL;


--
-- Name: presentation presentation_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.presentation
    ADD CONSTRAINT presentation_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES neosleep.users(id) ON DELETE SET NULL;


--
-- Name: purchase_order_item purchase_order_item_fulfillment_supplier_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.purchase_order_item
    ADD CONSTRAINT purchase_order_item_fulfillment_supplier_id_fkey FOREIGN KEY (fulfillment_supplier_id) REFERENCES neosleep.supplier(id) ON DELETE SET NULL;


--
-- Name: purchase_order_item purchase_order_item_order_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.purchase_order_item
    ADD CONSTRAINT purchase_order_item_order_id_fkey FOREIGN KEY (order_id) REFERENCES neosleep.purchase_order(id) ON DELETE CASCADE;


--
-- Name: purchase_order purchase_order_patient_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.purchase_order
    ADD CONSTRAINT purchase_order_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES neosleep.patient(id) ON DELETE RESTRICT;


--
-- Name: push_subscription push_subscription_user_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.push_subscription
    ADD CONSTRAINT push_subscription_user_id_fkey FOREIGN KEY (user_id) REFERENCES neosleep.users(id) ON DELETE CASCADE;


--
-- Name: remember_me_tokens remember_me_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.remember_me_tokens
    ADD CONSTRAINT remember_me_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES neosleep.users(id) ON DELETE CASCADE;


--
-- Name: request_log request_log_session_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.request_log
    ADD CONSTRAINT request_log_session_id_fkey FOREIGN KEY (session_id) REFERENCES neosleep.user_session(id) ON DELETE SET NULL;


--
-- Name: request_log request_log_user_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.request_log
    ADD CONSTRAINT request_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES neosleep.users(id) ON DELETE SET NULL;


--
-- Name: sample_batch sample_batch_product_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.sample_batch
    ADD CONSTRAINT sample_batch_product_id_fkey FOREIGN KEY (product_id) REFERENCES neosleep.product(id) ON DELETE RESTRICT;


--
-- Name: sample_batch sample_batch_received_by_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.sample_batch
    ADD CONSTRAINT sample_batch_received_by_fkey FOREIGN KEY (received_by) REFERENCES neosleep.users(id) ON DELETE SET NULL;


--
-- Name: sample_request sample_request_approved_by_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.sample_request
    ADD CONSTRAINT sample_request_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES neosleep.users(id) ON DELETE SET NULL;


--
-- Name: sample_request sample_request_product_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.sample_request
    ADD CONSTRAINT sample_request_product_id_fkey FOREIGN KEY (product_id) REFERENCES neosleep.product(id) ON DELETE RESTRICT;


--
-- Name: sample_request sample_request_requester_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.sample_request
    ADD CONSTRAINT sample_request_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES neosleep.users(id) ON DELETE CASCADE;


--
-- Name: sample_stock sample_stock_product_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.sample_stock
    ADD CONSTRAINT sample_stock_product_id_fkey FOREIGN KEY (product_id) REFERENCES neosleep.product(id) ON DELETE RESTRICT;


--
-- Name: sample_stock sample_stock_user_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.sample_stock
    ADD CONSTRAINT sample_stock_user_id_fkey FOREIGN KEY (user_id) REFERENCES neosleep.users(id) ON DELETE CASCADE;


--
-- Name: sample_transaction sample_transaction_batch_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.sample_transaction
    ADD CONSTRAINT sample_transaction_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES neosleep.sample_batch(id) ON DELETE RESTRICT;


--
-- Name: sample_transaction sample_transaction_encounter_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.sample_transaction
    ADD CONSTRAINT sample_transaction_encounter_id_fkey FOREIGN KEY (encounter_id) REFERENCES neosleep.encounter(id) ON DELETE SET NULL;


--
-- Name: sample_transaction sample_transaction_practitioner_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.sample_transaction
    ADD CONSTRAINT sample_transaction_practitioner_id_fkey FOREIGN KEY (practitioner_id) REFERENCES neosleep.practitioner(id) ON DELETE SET NULL;


--
-- Name: sample_transaction sample_transaction_product_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.sample_transaction
    ADD CONSTRAINT sample_transaction_product_id_fkey FOREIGN KEY (product_id) REFERENCES neosleep.product(id) ON DELETE RESTRICT;


--
-- Name: sample_transaction sample_transaction_to_user_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.sample_transaction
    ADD CONSTRAINT sample_transaction_to_user_id_fkey FOREIGN KEY (to_user_id) REFERENCES neosleep.users(id) ON DELETE SET NULL;


--
-- Name: sample_transaction sample_transaction_user_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.sample_transaction
    ADD CONSTRAINT sample_transaction_user_id_fkey FOREIGN KEY (user_id) REFERENCES neosleep.users(id) ON DELETE RESTRICT;


--
-- Name: segment segment_created_by_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.segment
    ADD CONSTRAINT segment_created_by_fkey FOREIGN KEY (created_by) REFERENCES neosleep.users(id) ON DELETE SET NULL;


--
-- Name: segment_member segment_member_segment_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.segment_member
    ADD CONSTRAINT segment_member_segment_id_fkey FOREIGN KEY (segment_id) REFERENCES neosleep.segment(id) ON DELETE CASCADE;


--
-- Name: sleep_study sleep_study_interpreted_by_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.sleep_study
    ADD CONSTRAINT sleep_study_interpreted_by_fkey FOREIGN KEY (interpreted_by) REFERENCES neosleep.practitioner(id) ON DELETE SET NULL;


--
-- Name: sleep_study sleep_study_patient_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.sleep_study
    ADD CONSTRAINT sleep_study_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES neosleep.patient(id) ON DELETE CASCADE;


--
-- Name: sleep_study sleep_study_supplier_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.sleep_study
    ADD CONSTRAINT sleep_study_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES neosleep.supplier(id) ON DELETE SET NULL;


--
-- Name: support_ticket support_ticket_assigned_to_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.support_ticket
    ADD CONSTRAINT support_ticket_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES neosleep.users(id) ON DELETE SET NULL;


--
-- Name: support_ticket support_ticket_patient_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.support_ticket
    ADD CONSTRAINT support_ticket_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES neosleep.patient(id) ON DELETE SET NULL;


--
-- Name: sync_queue sync_queue_user_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.sync_queue
    ADD CONSTRAINT sync_queue_user_id_fkey FOREIGN KEY (user_id) REFERENCES neosleep.users(id) ON DELETE CASCADE;


--
-- Name: target target_approved_by_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.target
    ADD CONSTRAINT target_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES neosleep.users(id) ON DELETE SET NULL;


--
-- Name: target target_set_by_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.target
    ADD CONSTRAINT target_set_by_fkey FOREIGN KEY (set_by) REFERENCES neosleep.users(id) ON DELETE SET NULL;


--
-- Name: target target_territory_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.target
    ADD CONSTRAINT target_territory_id_fkey FOREIGN KEY (territory_id) REFERENCES neosleep.territory(id) ON DELETE SET NULL;


--
-- Name: target target_user_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.target
    ADD CONSTRAINT target_user_id_fkey FOREIGN KEY (user_id) REFERENCES neosleep.users(id) ON DELETE CASCADE;


--
-- Name: territory territory_parent_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.territory
    ADD CONSTRAINT territory_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES neosleep.territory(id) ON DELETE SET NULL;


--
-- Name: territory_user territory_user_territory_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.territory_user
    ADD CONSTRAINT territory_user_territory_id_fkey FOREIGN KEY (territory_id) REFERENCES neosleep.territory(id) ON DELETE CASCADE;


--
-- Name: territory_user territory_user_user_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.territory_user
    ADD CONSTRAINT territory_user_user_id_fkey FOREIGN KEY (user_id) REFERENCES neosleep.users(id) ON DELETE CASCADE;


--
-- Name: training_lesson training_lesson_course_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.training_lesson
    ADD CONSTRAINT training_lesson_course_id_fkey FOREIGN KEY (course_id) REFERENCES neosleep.training_course(id) ON DELETE CASCADE;


--
-- Name: training_progress training_progress_lesson_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.training_progress
    ADD CONSTRAINT training_progress_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES neosleep.training_lesson(id) ON DELETE CASCADE;


--
-- Name: training_progress training_progress_user_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.training_progress
    ADD CONSTRAINT training_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES neosleep.users(id) ON DELETE CASCADE;


--
-- Name: treatment_plan treatment_plan_appliance_supplier_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.treatment_plan
    ADD CONSTRAINT treatment_plan_appliance_supplier_id_fkey FOREIGN KEY (appliance_supplier_id) REFERENCES neosleep.supplier(id) ON DELETE SET NULL;


--
-- Name: treatment_plan treatment_plan_dentist_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.treatment_plan
    ADD CONSTRAINT treatment_plan_dentist_id_fkey FOREIGN KEY (dentist_id) REFERENCES neosleep.practitioner(id) ON DELETE SET NULL;


--
-- Name: treatment_plan treatment_plan_patient_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.treatment_plan
    ADD CONSTRAINT treatment_plan_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES neosleep.patient(id) ON DELETE CASCADE;


--
-- Name: treatment_plan treatment_plan_recommended_by_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.treatment_plan
    ADD CONSTRAINT treatment_plan_recommended_by_fkey FOREIGN KEY (recommended_by) REFERENCES neosleep.practitioner(id) ON DELETE SET NULL;


--
-- Name: treatment_plan treatment_plan_scan_supplier_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.treatment_plan
    ADD CONSTRAINT treatment_plan_scan_supplier_id_fkey FOREIGN KEY (scan_supplier_id) REFERENCES neosleep.supplier(id) ON DELETE SET NULL;


--
-- Name: treatment_plan treatment_plan_sleep_study_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.treatment_plan
    ADD CONSTRAINT treatment_plan_sleep_study_id_fkey FOREIGN KEY (sleep_study_id) REFERENCES neosleep.sleep_study(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES neosleep.users(id) ON DELETE CASCADE;


--
-- Name: user_session user_session_user_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.user_session
    ADD CONSTRAINT user_session_user_id_fkey FOREIGN KEY (user_id) REFERENCES neosleep.users(id) ON DELETE CASCADE;


--
-- Name: users users_identity_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.users
    ADD CONSTRAINT users_identity_id_fkey FOREIGN KEY (identity_id) REFERENCES neosleep.identities(id) ON DELETE CASCADE;


--
-- Name: users users_manager_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.users
    ADD CONSTRAINT users_manager_id_fkey FOREIGN KEY (manager_id) REFERENCES neosleep.users(id) ON DELETE SET NULL;


--
-- Name: visit_plan visit_plan_organization_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.visit_plan
    ADD CONSTRAINT visit_plan_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES neosleep.organization(id) ON DELETE SET NULL;


--
-- Name: visit_plan visit_plan_practitioner_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.visit_plan
    ADD CONSTRAINT visit_plan_practitioner_id_fkey FOREIGN KEY (practitioner_id) REFERENCES neosleep.practitioner(id) ON DELETE SET NULL;


--
-- Name: visit_plan visit_plan_territory_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.visit_plan
    ADD CONSTRAINT visit_plan_territory_id_fkey FOREIGN KEY (territory_id) REFERENCES neosleep.territory(id) ON DELETE SET NULL;


--
-- Name: visit_plan visit_plan_user_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.visit_plan
    ADD CONSTRAINT visit_plan_user_id_fkey FOREIGN KEY (user_id) REFERENCES neosleep.users(id) ON DELETE CASCADE;


--
-- Name: webauthn_credentials webauthn_credentials_user_id_fkey; Type: FK CONSTRAINT; Schema: neosleep; Owner: -
--

ALTER TABLE ONLY neosleep.webauthn_credentials
    ADD CONSTRAINT webauthn_credentials_user_id_fkey FOREIGN KEY (user_id) REFERENCES neosleep.users(id) ON DELETE CASCADE;


--
-- Name: audit audit_actor_id_fkey; Type: FK CONSTRAINT; Schema: platform; Owner: -
--

ALTER TABLE ONLY platform.audit
    ADD CONSTRAINT audit_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES platform.users(id) ON DELETE SET NULL;


--
-- Name: dpa_agreement dpa_agreement_tenant_id_fkey; Type: FK CONSTRAINT; Schema: platform; Owner: -
--

ALTER TABLE ONLY platform.dpa_agreement
    ADD CONSTRAINT dpa_agreement_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES platform.tenants(id) ON DELETE RESTRICT;


--
-- Name: feature_flags feature_flags_tenant_id_fkey; Type: FK CONSTRAINT; Schema: platform; Owner: -
--

ALTER TABLE ONLY platform.feature_flags
    ADD CONSTRAINT feature_flags_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES platform.tenants(id) ON DELETE CASCADE;


--
-- Name: invoice invoice_tenant_id_fkey; Type: FK CONSTRAINT; Schema: platform; Owner: -
--

ALTER TABLE ONLY platform.invoice
    ADD CONSTRAINT invoice_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES platform.tenants(id) ON DELETE RESTRICT;


--
-- Name: tenants tenants_company_id_fkey; Type: FK CONSTRAINT; Schema: platform; Owner: -
--

ALTER TABLE ONLY platform.tenants
    ADD CONSTRAINT tenants_company_id_fkey FOREIGN KEY (company_id) REFERENCES platform.companies(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict 2cb7Zjsa1qZ3Gbn20eL7tv6m5hGfcUHh6zbdlTVAKl4ZTeyEYM7JBG2fxRWI69n

