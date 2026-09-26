import type { PoolClient } from "pg";
import { AppError, DatabaseError } from "../errors.js";
import {
  MEDICAL_HISTORY_QUESTIONS,
  ORAL_EXAM_QUESTIONS,
  STOP_QUESTIONS,
  BANG_QUESTIONS,
  type MedicalHistoryAnswers,
  type OralExamAnswers,
  type StopAnswers,
  type BangAnswers,
  type BangMeasurements,
} from "../commands/clinicalRecordFields.js";

/**
 * Clinical questionnaire rows — medical_history_questionnaire, oral_exam,
 * stop_bang_screening (migration 030, ADR-023). All three are APPEND-ONLY:
 * every fill is its own dated row (the patient's history is kept), unlike
 * the 026 endo_intake they replace, which was upserted in place. The only
 * UPDATE is completing a STOP-Bang's B-A-N-G half after the patient
 * answered S-T-O-P.
 */

export type RecordSource = "staff" | "patient";

interface RecordMeta {
  id: string;
  patient_id: string;
  source: RecordSource;
  recorded_by: string | null;
  recorded_by_name: string | null;
  request_id: string | null;
  created_at: Date;
}

export type MedicalHistoryRecord = RecordMeta & MedicalHistoryAnswers & { consent_accepted_at: Date | null };
export type OralExamRecord = Omit<RecordMeta, "source" | "request_id"> & OralExamAnswers;
export type StopBangRecord = RecordMeta &
  StopAnswers &
  BangAnswers &
  BangMeasurements & { score: number | null; consent_accepted_at: Date | null; updated_at: Date };

/** No measurements — a patient's S-T-O-P-only screening, or B-A-N-G answered as plain yes/no. */
export const NO_MEASUREMENTS: BangMeasurements = { height_cm: null, weight_kg: null, neck_cm: null, bmi: null };

/** Patient-submitted consent, stored on the record itself (GDPR Art.9 — who agreed to what, when). */
export interface ConsentStamp {
  accepted_at: Date;
  version: string;
}

interface InsertMeta {
  patient_id: string;
  source: RecordSource;
  recorded_by: string | null;
  request_id: string | null;
  consent: ConsentStamp | null;
}

// recorded_by_name via a correlated join, so the Estudios list can show
// "Dr. X" / "Patient" without an N+1 lookup.
const RECORDER_NAME = `(SELECT NULLIF(concat_ws(' ', ri.first_name, ri.last_name), '')
   FROM users ru JOIN identities ri ON ri.id = ru.identity_id WHERE ru.id = t.recorded_by) AS recorded_by_name`;

const MEDICAL_HISTORY_COLS = [...MEDICAL_HISTORY_QUESTIONS, "medical_history_other"];
const ORAL_EXAM_COLS = [...ORAL_EXAM_QUESTIONS, "skeletal_class", "tooth"];
const STOP_BANG_COLS = [...STOP_QUESTIONS, ...BANG_QUESTIONS];

function selectList(cols: string[], extra: string[]): string {
  return ["t.id", "t.patient_id", "t.recorded_by", "t.created_at", ...extra, ...cols.map((c) => `t.${c}`), RECORDER_NAME].join(", ");
}

const MEDICAL_HISTORY_SELECT = selectList(MEDICAL_HISTORY_COLS, ["t.source", "t.request_id", "t.consent_accepted_at"]);
const ORAL_EXAM_SELECT = selectList(ORAL_EXAM_COLS, []);
// NUMERIC comes back from pg as a string; the measurements are read as float8 so the record type holds numbers.
const STOP_BANG_MEASUREMENT_SELECT = ["height_cm", "weight_kg", "neck_cm", "bmi"].map((c) => `t.${c}::float8 AS ${c}`);
const STOP_BANG_SELECT = selectList(STOP_BANG_COLS, ["t.source", "t.request_id", "t.consent_accepted_at", "t.score", "t.updated_at", ...STOP_BANG_MEASUREMENT_SELECT]);

async function run<T>(operation: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError(operation, err);
  }
}

/** INSERT ... RETURNING only the id, then re-read through the shared SELECT, so every row shape (incl. recorded_by_name) comes from one place. */
async function insertRow(client: PoolClient, table: string, values: Record<string, unknown>): Promise<string> {
  const cols = Object.keys(values);
  const params = cols.map((_, i) => `$${i + 1}`);
  const result = await client.query<{ id: string }>(
    `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${params.join(", ")}) RETURNING id`,
    Object.values(values)
  );
  return result.rows[0]!.id;
}

function metaValues(meta: InsertMeta, { withSource }: { withSource: boolean }): Record<string, unknown> {
  const values: Record<string, unknown> = { patient_id: meta.patient_id, recorded_by: meta.recorded_by };
  if (withSource) {
    values.source = meta.source;
    values.request_id = meta.request_id;
    values.consent_accepted_at = meta.consent?.accepted_at ?? null;
    values.consent_version = meta.consent?.version ?? null;
  }
  return values;
}

// ---------------------------------------------------------------------------
// medical_history_questionnaire
// ---------------------------------------------------------------------------

export function insertMedicalHistory(client: PoolClient, meta: InsertMeta, answers: MedicalHistoryAnswers): Promise<MedicalHistoryRecord> {
  return run("insertMedicalHistory", async () => {
    const id = await insertRow(client, "medical_history_questionnaire", { ...metaValues(meta, { withSource: true }), ...answers });
    return (await getMedicalHistoryById(client, id))!;
  });
}

export function getMedicalHistoryById(client: PoolClient, id: string): Promise<MedicalHistoryRecord | null> {
  return run("getMedicalHistoryById", async () => {
    const result = await client.query<MedicalHistoryRecord>(
      `SELECT ${MEDICAL_HISTORY_SELECT} FROM medical_history_questionnaire t WHERE t.id = $1`,
      [id]
    );
    return result.rows[0] ?? null;
  });
}

export function listMedicalHistoryForPatient(client: PoolClient, patientId: string): Promise<MedicalHistoryRecord[]> {
  return run("listMedicalHistoryForPatient", async () => {
    const result = await client.query<MedicalHistoryRecord>(
      `SELECT ${MEDICAL_HISTORY_SELECT} FROM medical_history_questionnaire t WHERE t.patient_id = $1 ORDER BY t.created_at DESC`,
      [patientId]
    );
    return result.rows;
  });
}

// ---------------------------------------------------------------------------
// oral_exam — dentist-recorded only, so no source/request/consent
// ---------------------------------------------------------------------------

export function insertOralExam(client: PoolClient, meta: InsertMeta, answers: OralExamAnswers): Promise<OralExamRecord> {
  return run("insertOralExam", async () => {
    const id = await insertRow(client, "oral_exam", { ...metaValues(meta, { withSource: false }), ...answers });
    return (await getOralExamById(client, id))!;
  });
}

export function getOralExamById(client: PoolClient, id: string): Promise<OralExamRecord | null> {
  return run("getOralExamById", async () => {
    const result = await client.query<OralExamRecord>(`SELECT ${ORAL_EXAM_SELECT} FROM oral_exam t WHERE t.id = $1`, [id]);
    return result.rows[0] ?? null;
  });
}

export function listOralExamsForPatient(client: PoolClient, patientId: string): Promise<OralExamRecord[]> {
  return run("listOralExamsForPatient", async () => {
    const result = await client.query<OralExamRecord>(
      `SELECT ${ORAL_EXAM_SELECT} FROM oral_exam t WHERE t.patient_id = $1 ORDER BY t.created_at DESC`,
      [patientId]
    );
    return result.rows;
  });
}

// ---------------------------------------------------------------------------
// stop_bang_screening — score is a Postgres GENERATED column, NULL until
// all eight answers exist; never computed in application code.
// ---------------------------------------------------------------------------

export function insertStopBang(
  client: PoolClient,
  meta: InsertMeta,
  stop: StopAnswers,
  bang: BangAnswers,
  measurements: BangMeasurements = NO_MEASUREMENTS
): Promise<StopBangRecord> {
  return run("insertStopBang", async () => {
    const id = await insertRow(client, "stop_bang_screening", { ...metaValues(meta, { withSource: true }), ...stop, ...bang, ...measurements });
    return (await getStopBangById(client, id))!;
  });
}

/** Fills in B-A-N-G on a screening whose patient answered only S-T-O-P. Only ever fills blanks — returns null if the row is already complete. */
export function completeStopBang(
  client: PoolClient,
  id: string,
  recordedBy: string,
  bang: BangAnswers,
  measurements: BangMeasurements = NO_MEASUREMENTS
): Promise<StopBangRecord | null> {
  return run("completeStopBang", async () => {
    const result = await client.query<{ id: string }>(
      `UPDATE stop_bang_screening
          SET bmi_over_35 = $2, age_over_50 = $3, neck_circumference_over_40cm = $4, is_male = $5,
              height_cm = $7, weight_kg = $8, neck_cm = $9, bmi = $10,
              recorded_by = COALESCE(recorded_by, $6), updated_at = now()
        WHERE id = $1 AND score IS NULL
        RETURNING id`,
      [
        id, bang.bmi_over_35, bang.age_over_50, bang.neck_circumference_over_40cm, bang.is_male, recordedBy,
        measurements.height_cm, measurements.weight_kg, measurements.neck_cm, measurements.bmi,
      ]
    );
    return result.rows[0] ? getStopBangById(client, id) : null;
  });
}

export function getStopBangById(client: PoolClient, id: string): Promise<StopBangRecord | null> {
  return run("getStopBangById", async () => {
    const result = await client.query<StopBangRecord>(`SELECT ${STOP_BANG_SELECT} FROM stop_bang_screening t WHERE t.id = $1`, [id]);
    return result.rows[0] ?? null;
  });
}

export function listStopBangForPatient(client: PoolClient, patientId: string): Promise<StopBangRecord[]> {
  return run("listStopBangForPatient", async () => {
    const result = await client.query<StopBangRecord>(
      `SELECT ${STOP_BANG_SELECT} FROM stop_bang_screening t WHERE t.patient_id = $1 ORDER BY t.created_at DESC`,
      [patientId]
    );
    return result.rows;
  });
}
