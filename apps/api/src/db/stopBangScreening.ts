import type { PoolClient } from "pg";
import { AppError, DatabaseError } from "../errors.js";

/**
 * stop_bang_screening rows — see apps/api/migrations/026_endo_intake.sql
 * and docs/ADR-022-endo-intake-and-stop-bang-schema.md. Multiple rows per
 * patient (a recurring screening, not a one-time intake) — deliberately
 * NOT one-row-per-patient like endo_intake.
 */
export interface StopBangScreening {
  id: string;
  patient_id: string;
  recorded_by: string | null;
  snoring: boolean;
  tiredness: boolean;
  observed_apnea: boolean;
  pressure: boolean;
  bmi_over_35: boolean;
  age_over_50: boolean;
  neck_circumference_over_40cm: boolean;
  is_male: boolean;
  score: number;
  created_at: Date;
}

export interface InsertStopBangScreeningInput {
  patient_id: string;
  recorded_by: string | null;
  snoring: boolean;
  tiredness: boolean;
  observed_apnea: boolean;
  pressure: boolean;
  bmi_over_35: boolean;
  age_over_50: boolean;
  neck_circumference_over_40cm: boolean;
  is_male: boolean;
}

const STOP_BANG_COLS =
  "id, patient_id, recorded_by, snoring, tiredness, observed_apnea, pressure, bmi_over_35, age_over_50, neck_circumference_over_40cm, is_male, score, created_at";

export async function insertStopBangScreening(
  client: PoolClient,
  input: InsertStopBangScreeningInput
): Promise<StopBangScreening> {
  try {
    const result = await client.query<StopBangScreening>(
      `INSERT INTO stop_bang_screening
         (patient_id, recorded_by, snoring, tiredness, observed_apnea, pressure, bmi_over_35, age_over_50, neck_circumference_over_40cm, is_male)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING ${STOP_BANG_COLS}`,
      [
        input.patient_id,
        input.recorded_by,
        input.snoring,
        input.tiredness,
        input.observed_apnea,
        input.pressure,
        input.bmi_over_35,
        input.age_over_50,
        input.neck_circumference_over_40cm,
        input.is_male,
      ]
    );
    return result.rows[0]!;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("insertStopBangScreening", err);
  }
}

export async function listStopBangScreeningsForPatient(client: PoolClient, patientId: string): Promise<StopBangScreening[]> {
  try {
    const result = await client.query<StopBangScreening>(
      `SELECT ${STOP_BANG_COLS} FROM stop_bang_screening WHERE patient_id = $1 ORDER BY created_at DESC`,
      [patientId]
    );
    return result.rows;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("listStopBangScreeningsForPatient", err);
  }
}

export async function getStopBangScreeningById(client: PoolClient, id: string): Promise<StopBangScreening | null> {
  try {
    const result = await client.query<StopBangScreening>(`SELECT ${STOP_BANG_COLS} FROM stop_bang_screening WHERE id = $1`, [id]);
    return result.rows[0] ?? null;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getStopBangScreeningById", err);
  }
}
