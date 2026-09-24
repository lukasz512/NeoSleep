import type { PoolClient } from "pg";
import { DatabaseError } from "../errors.js";

/** Always the last intake form on every patient (NEO-54) — not admin-assignable like the document templates. */
export const POLYSOMNOGRAPHY_FORM_KEY = "polysomnography";

/**
 * "Has this form been collected for this patient?" — one EXISTS check per
 * @neo/documents templateKey, evaluated against the patient's own record
 * table (NEO-54). A templateKey with no entry here always reads as not
 * done: informedConsent has no per-patient record yet (planned: sent by
 * email + signed, a later ticket), so it stays pending until then.
 *
 * "polysomnography" isn't a document template: it's a sleep_study row, and
 * counts only once its results are in (results_received / interpreted), not
 * when the study is merely ordered.
 *
 * `ids.id` is the patient id from the unnest() below. The SQL fragments are
 * static strings, never user input.
 */
const COMPLETION_EXISTS_SQL: Record<string, string> = {
  historiaEndo: "EXISTS (SELECT 1 FROM endo_intake e WHERE e.patient_id = ids.id AND e.deleted_at IS NULL)",
  stopBang: "EXISTS (SELECT 1 FROM stop_bang_screening s WHERE s.patient_id = ids.id)",
  [POLYSOMNOGRAPHY_FORM_KEY]:
    "EXISTS (SELECT 1 FROM sleep_study ss WHERE ss.patient_id = ids.id AND ss.study_type = 'polysomnography' AND ss.status IN ('results_received', 'interpreted'))",
};

/** Returns patientId -> set of completed templateKeys, restricted to `templateKeys`. */
export async function getPatientFormCompletion(
  client: PoolClient,
  patientIds: string[],
  templateKeys: string[]
): Promise<Map<string, Set<string>>> {
  const result = new Map<string, Set<string>>(patientIds.map((id) => [id, new Set<string>()]));
  const checked = templateKeys.filter((key) => key in COMPLETION_EXISTS_SQL);
  if (patientIds.length === 0 || checked.length === 0) return result;

  const columns = checked.map((key, i) => `${COMPLETION_EXISTS_SQL[key]} AS c${i}`).join(", ");
  try {
    const { rows } = await client.query<Record<string, string | boolean>>(
      `SELECT ids.id, ${columns} FROM unnest($1::uuid[]) AS ids(id)`,
      [patientIds]
    );
    for (const row of rows) {
      const done = result.get(String(row.id));
      if (!done) continue;
      checked.forEach((key, i) => {
        if (row[`c${i}`] === true) done.add(key);
      });
    }
    return result;
  } catch (err) {
    throw new DatabaseError("getPatientFormCompletion", err);
  }
}
