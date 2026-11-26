import type { PoolClient } from "pg";
import { AppError, DatabaseError } from "../errors.js";

/**
 * Reads behind the patient's Detalles summary strip + grouped rows (NEO-206):
 * the identity/consent fields the base patient DTO leaves out, the latest
 * sleep study with results, and the next scheduled appointment.
 */

export interface PatientProfileExtras {
  preferred_name: string | null;
  /** {line1, city, postal_code, country_code} — free-form JSONB, any of them may be missing. */
  shipping_address: Record<string, unknown> | null;
  data_consent_at: string | null;
  data_consent_withdrawn_at: string | null;
}

export interface PatientLatestStudy {
  id: string;
  study_date: string | null;
  ahi_score: number | null;
  spo2_nadir: number | null;
  odi: number | null;
  diagnosis_code: Record<string, unknown> | null;
}

export interface PatientNextAppointment {
  id: string;
  start_at: string;
}

function iso(val: Date | null): string | null {
  return val ? val.toISOString() : null;
}

/** pg returns NUMERIC as a string. */
function num(val: string | null): number | null {
  return val === null ? null : Number(val);
}

export async function getPatientProfileExtras(client: PoolClient, patientId: string): Promise<PatientProfileExtras | null> {
  try {
    const result = await client.query<{
      preferred_name: string | null;
      shipping_address: Record<string, unknown> | null;
      data_consent_at: Date | null;
      data_consent_withdrawn_at: Date | null;
    }>(
      `SELECT i.preferred_name, p.shipping_address, p.data_consent_at, p.data_consent_withdrawn_at
         FROM patient p
         JOIN identities i ON i.id = p.identity_id
        WHERE p.id = $1 AND p.deleted_at IS NULL`,
      [patientId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      preferred_name: row.preferred_name?.trim() || null,
      shipping_address: row.shipping_address,
      data_consent_at: iso(row.data_consent_at),
      data_consent_withdrawn_at: iso(row.data_consent_withdrawn_at),
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getPatientProfileExtras", err);
  }
}

/** The newest non-cancelled study that has an AHI — a study still waiting for its device has nothing to summarise. */
export async function getLatestStudyWithResults(client: PoolClient, patientId: string): Promise<PatientLatestStudy | null> {
  try {
    const result = await client.query<{
      id: string;
      study_date: string | null;
      ahi_score: string | null;
      spo2_nadir: string | null;
      odi: string | null;
      diagnosis_code: Record<string, unknown> | null;
    }>(
      `SELECT id, to_char(study_date, 'YYYY-MM-DD') AS study_date, ahi_score, spo2_nadir, odi, diagnosis_code
         FROM sleep_study
        WHERE patient_id = $1 AND status <> 'cancelled' AND ahi_score IS NOT NULL
        ORDER BY COALESCE(study_date, results_received_at::date, created_at::date) DESC, created_at DESC
        LIMIT 1`,
      [patientId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      study_date: row.study_date,
      ahi_score: num(row.ahi_score),
      spo2_nadir: num(row.spo2_nadir),
      odi: num(row.odi),
      diagnosis_code: row.diagnosis_code,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getLatestStudyWithResults", err);
  }
}

export async function getNextAppointment(client: PoolClient, patientId: string): Promise<PatientNextAppointment | null> {
  try {
    const result = await client.query<{ id: string; start_at: Date }>(
      `SELECT id, start_at
         FROM appointment
        WHERE patient_id = $1 AND deleted_at IS NULL AND status = 'scheduled' AND start_at >= now()
        ORDER BY start_at
        LIMIT 1`,
      [patientId],
    );
    const row = result.rows[0];
    return row ? { id: row.id, start_at: row.start_at.toISOString() } : null;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getNextAppointment", err);
  }
}
