-- =============================================================================
-- Migration 026: endo_intake + stop_bang_screening
--
-- Structured dental intake checklist (endo_intake) and recurring OSA
-- screening (stop_bang_screening) — see
-- docs/stories/historia-endo-clinical-intake-and-printable-pdf.md and
-- docs/ADR-022-endo-intake-and-stop-bang-schema.md for the full design.
--
-- endo_intake: one row per patient (patient_id UNIQUE), upserted in place
-- on re-intake — not per visit or per tooth (Łukasz's explicit call).
-- Typed BOOLEAN columns per hardcoded checklist item (patient antecedentes
-- médicos + dentist oral-exam findings), matching sleep_study's own typed-
-- column style rather than a JSONB blob, since the question list is
-- hardcoded for v1.
--
-- stop_bang_screening: its OWN table, deliberately not embedded on
-- endo_intake and not added to sleep_study (see ADR-022) — STOP-Bang is a
-- recurring screening instrument, not a one-time intake, and sleep_study's
-- status column is a device-study state machine with a different
-- lifecycle. score is a GENERATED ALWAYS ... STORED column, computed by
-- Postgres, not duplicated in application code. pressure is its own
-- captured boolean, deliberately not derived from endo_intake.has_hypertension
-- — STOP-Bang is a validated instrument whose items must be asked and
-- stored as asked.
--
-- Both tables loop over platform.tenants using EXECUTE format(...), per
-- 021_sleep_study_type.sql's established pattern for adding a table to
-- already-provisioned tenant schemas after create_tenant_schema() was
-- first defined — a plain unqualified CREATE TABLE would only hit
-- whatever schema the migration runner's connection defaults to.
--
-- ROLLBACK SQL (run only if this migration must be reversed in production):
-- Preconditions: both tables must have 0 rows, or data migration run first.
--   DO $$ DECLARE r RECORD; BEGIN
--     FOR r IN SELECT db_schema FROM platform.tenants LOOP
--       EXECUTE format('DROP TABLE IF EXISTS %I.stop_bang_screening', r.db_schema);
--       EXECUTE format('DROP TABLE IF EXISTS %I.endo_intake', r.db_schema);
--     END LOOP;
--   END $$;
-- End of rollback block
--
-- Known gap (same tradeoff 021 documented): create_tenant_schema() in
-- 003_practitioner_drop_duplicate_salutation.sql is NOT updated here — per
-- CLAUDE.md's "never mutate old migrations" rule, a brand-new tenant
-- provisioned after this migration would need this same fixup re-applied.
--
-- Idempotent: safe to re-run.
-- =============================================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT db_schema FROM platform.tenants
  LOOP

    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.endo_intake (
        id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        patient_id                UUID        NOT NULL UNIQUE REFERENCES %I.patient(id) ON DELETE CASCADE,
        -- The logged-in staff user (rep/KAM/doctor-role) who saved this via
        -- the app: ctx.user.id, always a users.id, never a practitioner.id.
        -- Deliberately not linked to practitioner: a doctor-role staff user
        -- (users.role=doctor) has both a users row and a linked
        -- practitioner row (ADR-014), but the users row is what this
        -- command actually has on hand (TenantContext.user.id).
        recorded_by                UUID        REFERENCES %I.users(id) ON DELETE SET NULL,
        -- Antecedentes médicos (patient-reported, yes/no per condition — NULL = not yet asked)
        has_anemia                 BOOLEAN,
        has_diabetes                BOOLEAN,
        has_smoking                  BOOLEAN,
        has_endocrine_disorder       BOOLEAN,
        has_sinusitis                 BOOLEAN,
        has_alcoholism                 BOOLEAN,
        has_hypertension                BOOLEAN,
        has_hepatitis                    BOOLEAN,
        has_cancer                        BOOLEAN,
        has_addictions                     BOOLEAN,
        has_heart_disease                   BOOLEAN,
        has_kidney_disease                   BOOLEAN,
        has_hiv                               BOOLEAN,
        has_neurological_disorder              BOOLEAN,
        medical_history_other                   TEXT,      -- free-text "Otros"
        -- Oral exam findings (dentist-recorded, yes/no)
        has_bruxism                             BOOLEAN,
        has_narrow_palate                        BOOLEAN,
        has_geographic_tongue                     BOOLEAN,
        has_xerostomia                             BOOLEAN,
        skeletal_class                              TEXT CHECK (skeletal_class IN (''I'',''II'',''III'')),
        is_mouth_breather                            BOOLEAN,
        has_missing_teeth                             BOOLEAN,
        has_periodontal_disease                        BOOLEAN,
        has_tmj_finding                                 BOOLEAN,
        metadata                                         JSONB       NOT NULL DEFAULT ''{}'',
        created_at                                       TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at                                       TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at                                       TIMESTAMPTZ
      )', r.db_schema, r.db_schema, r.db_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.endo_intake (recorded_by)',
      r.db_schema||'_endo_intake_recorder_idx', r.db_schema);

    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I.stop_bang_screening (
        id                             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        patient_id                     UUID        NOT NULL REFERENCES %I.patient(id) ON DELETE CASCADE,
        -- Same reasoning as endo_intake.recorded_by above: linked to users, not practitioner.
        recorded_by                    UUID        REFERENCES %I.users(id) ON DELETE SET NULL,
        snoring                        BOOLEAN     NOT NULL,
        tiredness                      BOOLEAN     NOT NULL,
        observed_apnea                 BOOLEAN     NOT NULL,
        pressure                       BOOLEAN     NOT NULL,
        bmi_over_35                    BOOLEAN     NOT NULL,
        age_over_50                    BOOLEAN     NOT NULL,
        neck_circumference_over_40cm   BOOLEAN     NOT NULL,
        is_male                        BOOLEAN     NOT NULL,
        score                          INTEGER     GENERATED ALWAYS AS (
                                          snoring::int + tiredness::int + observed_apnea::int + pressure::int +
                                          bmi_over_35::int + age_over_50::int + neck_circumference_over_40cm::int + is_male::int
                                        ) STORED,
        created_at                     TIMESTAMPTZ NOT NULL DEFAULT now()
      )', r.db_schema, r.db_schema, r.db_schema);

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.stop_bang_screening (patient_id)',
      r.db_schema||'_stop_bang_patient_idx', r.db_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.stop_bang_screening (recorded_by)',
      r.db_schema||'_stop_bang_recorder_idx', r.db_schema);

  END LOOP;
END $$;
