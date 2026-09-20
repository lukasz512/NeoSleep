import type { PoolClient } from "pg";
import { AppError, DatabaseError } from "../errors.js";
import { formatDisplayName } from "../utils/personName.js";

/**
 * endo_intake rows — see apps/api/migrations/026_endo_intake.sql and
 * docs/ADR-022-endo-intake-and-stop-bang-schema.md. One row per patient
 * (patient_id UNIQUE), upserted in place on re-intake.
 */
export interface EndoIntake {
  id: string;
  patient_id: string;
  recorded_by: string | null;
  has_anemia: boolean | null;
  has_diabetes: boolean | null;
  has_smoking: boolean | null;
  has_endocrine_disorder: boolean | null;
  has_sinusitis: boolean | null;
  has_alcoholism: boolean | null;
  has_hypertension: boolean | null;
  has_hepatitis: boolean | null;
  has_cancer: boolean | null;
  has_addictions: boolean | null;
  has_heart_disease: boolean | null;
  has_kidney_disease: boolean | null;
  has_hiv: boolean | null;
  has_neurological_disorder: boolean | null;
  medical_history_other: string | null;
  has_bruxism: boolean | null;
  has_narrow_palate: boolean | null;
  has_geographic_tongue: boolean | null;
  has_xerostomia: boolean | null;
  skeletal_class: "I" | "II" | "III" | null;
  is_mouth_breather: boolean | null;
  has_missing_teeth: boolean | null;
  has_periodontal_disease: boolean | null;
  has_tmj_finding: boolean | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

/** Every checklist column — used both for the upsert's column list and to type-guard EndoIntakeFields. */
export const ENDO_INTAKE_CHECKLIST_COLUMNS = [
  "has_anemia",
  "has_diabetes",
  "has_smoking",
  "has_endocrine_disorder",
  "has_sinusitis",
  "has_alcoholism",
  "has_hypertension",
  "has_hepatitis",
  "has_cancer",
  "has_addictions",
  "has_heart_disease",
  "has_kidney_disease",
  "has_hiv",
  "has_neurological_disorder",
  "medical_history_other",
  "has_bruxism",
  "has_narrow_palate",
  "has_geographic_tongue",
  "has_xerostomia",
  "skeletal_class",
  "is_mouth_breather",
  "has_missing_teeth",
  "has_periodontal_disease",
  "has_tmj_finding",
] as const;

export type EndoIntakeChecklistColumn = (typeof ENDO_INTAKE_CHECKLIST_COLUMNS)[number];
export type EndoIntakeFields = Partial<Record<EndoIntakeChecklistColumn, boolean | string | null>>;

const ENDO_INTAKE_COLS = `id, patient_id, recorded_by, ${ENDO_INTAKE_CHECKLIST_COLUMNS.join(", ")}, metadata, created_at, updated_at, deleted_at`;

export async function getEndoIntakeByPatientId(client: PoolClient, patientId: string): Promise<EndoIntake | null> {
  try {
    const result = await client.query<EndoIntake>(
      `SELECT ${ENDO_INTAKE_COLS} FROM endo_intake WHERE patient_id = $1 AND deleted_at IS NULL`,
      [patientId]
    );
    return result.rows[0] ?? null;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getEndoIntakeByPatientId", err);
  }
}

/** Full-replace upsert — matches the "one row per patient, re-intake overwrites in place" decision (ADR-022). Unset fields are not touched (partial save supported). */
export async function upsertEndoIntake(
  client: PoolClient,
  patientId: string,
  recordedBy: string | null,
  fields: EndoIntakeFields
): Promise<EndoIntake> {
  const setColumns = Object.keys(fields) as EndoIntakeChecklistColumn[];
  try {
    const insertCols = ["patient_id", "recorded_by", ...setColumns];
    const insertValues = [patientId, recordedBy, ...setColumns.map((c) => fields[c] ?? null)];
    const placeholders = insertValues.map((_, i) => `$${i + 1}`);
    const updateAssignments = [
      "recorded_by = EXCLUDED.recorded_by",
      ...setColumns.map((c) => `${c} = EXCLUDED.${c}`),
      "updated_at = now()",
    ];

    const result = await client.query<EndoIntake>(
      `INSERT INTO endo_intake (${insertCols.join(", ")})
       VALUES (${placeholders.join(", ")})
       ON CONFLICT (patient_id) DO UPDATE SET ${updateAssignments.join(", ")}
       RETURNING ${ENDO_INTAKE_COLS}`,
      insertValues
    );
    return result.rows[0]!;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("upsertEndoIntake", err);
  }
}

export interface PatientPdfContext {
  patient_name: string;
  practitioner_name: string | null;
  organization_name: string | null;
}

/**
 * The join chain confirmed missing from the existing patient queries
 * (db/patient.ts already joins practitioner+identities for
 * practitioner_name, but not organization for clinic name) — kept local to
 * this file since it's PDF-generation-specific, not general patient-detail
 * data.
 */
export async function getPatientPdfContext(client: PoolClient, patientId: string): Promise<PatientPdfContext | null> {
  try {
    const result = await client.query<{
      patient_salutation: string | null;
      patient_first_name: string;
      patient_last_name: string;
      practitioner_salutation: string | null;
      practitioner_first_name: string | null;
      practitioner_last_name: string | null;
      organization_name: string | null;
    }>(
      `SELECT
         pi.title AS patient_salutation, pi.first_name AS patient_first_name, pi.last_name AS patient_last_name,
         pri.title AS practitioner_salutation, pri.first_name AS practitioner_first_name, pri.last_name AS practitioner_last_name,
         o.name AS organization_name
       FROM patient p
       JOIN identities pi ON p.identity_id = pi.id
       LEFT JOIN practitioner pr ON p.practitioner_id = pr.id
       LEFT JOIN identities pri ON pr.identity_id = pri.id
       LEFT JOIN organization o ON pr.organization_id = o.id
       WHERE p.id = $1`,
      [patientId]
    );
    const row = result.rows[0];
    if (!row) return null;

    return {
      patient_name: formatDisplayName({
        salutation: row.patient_salutation,
        first_name: row.patient_first_name,
        last_name: row.patient_last_name,
      }),
      practitioner_name:
        row.practitioner_first_name || row.practitioner_last_name
          ? formatDisplayName({
              salutation: row.practitioner_salutation,
              first_name: row.practitioner_first_name ?? "",
              last_name: row.practitioner_last_name ?? "",
            })
          : null,
      organization_name: row.organization_name,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getPatientPdfContext", err);
  }
}
