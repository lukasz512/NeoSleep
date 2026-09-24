import type { PoolClient } from "pg";
import { AppError, DatabaseError } from "../errors.js";
import { formatDisplayName, formatOptionalDisplayName } from "../utils/personName.js";

export interface PatientPdfContext {
  patient_name: string;
  /** First name only — all the public self-fill page may show (data minimisation: the link could be scanned by someone else). */
  patient_first_name: string;
  practitioner_name: string | null;
  organization_name: string | null;
}

/**
 * Patient + treating doctor + clinic names for pre-filling generated PDFs
 * and the patient self-fill page's greeting. db/patient.ts joins
 * practitioner+identities for practitioner_name but not organization for
 * the clinic name, hence this separate query.
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
       WHERE p.id = $1 AND p.deleted_at IS NULL`,
      [patientId]
    );
    const row = result.rows[0];
    if (!row) return null;

    return {
      patient_first_name: row.patient_first_name,
      patient_name: formatDisplayName({
        salutation: row.patient_salutation,
        first_name: row.patient_first_name,
        last_name: row.patient_last_name,
      }),
      practitioner_name: formatOptionalDisplayName({
        salutation: row.practitioner_salutation,
        first_name: row.practitioner_first_name,
        last_name: row.practitioner_last_name,
      }),
      organization_name: row.organization_name,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getPatientPdfContext", err);
  }
}
