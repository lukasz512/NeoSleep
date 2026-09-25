import type { PoolClient } from "pg";
import { DatabaseError } from "../errors.js";
import type { ChecklistFillMode } from "./documentTemplateEntityType.js";

/** Always the last intake form on every patient (NEO-54) — not admin-assignable like the document templates. */
export const POLYSOMNOGRAPHY_FORM_KEY = "polysomnography";

export interface FormCompletionItem {
  key: string;
  /** From the Documents admin (platform.document_template_entity_type.fill_mode); null for polysomnography. */
  fillMode: ChecklistFillMode | null;
}

/** Clinical forms stored as their own append-only record tables (migration 030) — mirrors queries/patientChecklist.ts FORM_BINDINGS. */
const FORM_TABLE: Record<string, string> = {
  medicalHistory: "medical_history_questionnaire",
  oralExam: "oral_exam",
};

/**
 * "Is this patient's Estudios item done?" for a whole page of patients in
 * ONE query (the patient list's intake-form dots, NEO-54). Mirrors the
 * checklist's own rules (queries/patientChecklist.ts, ADR-024) exactly, so
 * the list and the patient's Estudios tab never disagree — the spec checks
 * both against the same patient states:
 *   - any item: a file the doctor attached to it ("Agregar estudio")
 *   - fill_mode consent: a non-withdrawn consent with purpose = key
 *   - medicalHistory / oralExam: a record exists
 *   - stopBang: the LATEST entry decides — an S-T-O-P-only screening
 *     (score NULL, awaiting B-A-N-G) is not done
 *   - polysomnography: a polysomnography study with results in
 *     (results_received / interpreted), or any report file
 *
 * `ids.id` is the patient id from the unnest() below; each item's key is a
 * bound parameter ($2[i]), table names come from the static map above.
 */
function uploadFor(keyParam: string): string {
  return `EXISTS (SELECT 1 FROM file_attachment f WHERE f.entity_type = 'patient' AND f.entity_id = ids.id
            AND f.metadata->>'document_type' = 'study_upload' AND f.metadata->>'checklist_item' = ${keyParam})`;
}

function doneSql(item: FormCompletionItem, keyParam: string): string {
  const upload = uploadFor(keyParam);
  if (item.key === POLYSOMNOGRAPHY_FORM_KEY) {
    return `(EXISTS (SELECT 1 FROM sleep_study ss WHERE ss.patient_id = ids.id AND ss.study_type = 'polysomnography'
               AND ss.status IN ('results_received', 'interpreted'))
             OR ${upload}
             OR EXISTS (SELECT 1 FROM file_attachment f JOIN sleep_study ss ON ss.id = f.entity_id
                         WHERE f.entity_type = 'sleep_study' AND ss.patient_id = ids.id))`;
  }
  if (item.fillMode === "consent") {
    return `(EXISTS (SELECT 1 FROM consent c WHERE c.entity_type = 'patient' AND c.entity_id = ids.id
               AND c.purpose = ${keyParam} AND c.withdrawn_at IS NULL) OR ${upload})`;
  }
  if (item.key === "stopBang") {
    return `COALESCE((SELECT x.ok FROM (
               SELECT s.created_at, s.score IS NOT NULL AS ok FROM stop_bang_screening s WHERE s.patient_id = ids.id
               UNION ALL
               SELECT f.created_at, true FROM file_attachment f WHERE f.entity_type = 'patient' AND f.entity_id = ids.id
                 AND f.metadata->>'document_type' = 'study_upload' AND f.metadata->>'checklist_item' = ${keyParam}
             ) x ORDER BY x.created_at DESC LIMIT 1), false)`;
  }
  const table = FORM_TABLE[item.key];
  if (table) return `(EXISTS (SELECT 1 FROM ${table} r WHERE r.patient_id = ids.id) OR ${upload})`;
  return upload;
}

/** Returns patientId -> set of done item keys, restricted to `items`. */
export async function getPatientFormCompletion(
  client: PoolClient,
  patientIds: string[],
  items: FormCompletionItem[]
): Promise<Map<string, Set<string>>> {
  const result = new Map<string, Set<string>>(patientIds.map((id) => [id, new Set<string>()]));
  if (patientIds.length === 0 || items.length === 0) return result;

  const columns = items.map((item, i) => `${doneSql(item, `($2::text[])[${i + 1}]`)} AS c${i}`).join(", ");
  try {
    const { rows } = await client.query<Record<string, string | boolean>>(
      `SELECT ids.id, ${columns} FROM unnest($1::uuid[]) AS ids(id)`,
      [patientIds, items.map((item) => item.key)]
    );
    for (const row of rows) {
      const done = result.get(String(row.id));
      if (!done) continue;
      items.forEach((item, i) => {
        if (row[`c${i}`] === true) done.add(item.key);
      });
    }
    return result;
  } catch (err) {
    throw new DatabaseError("getPatientFormCompletion", err);
  }
}
