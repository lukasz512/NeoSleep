import type { TenantContext } from "../context/TenantContext.js";
import { insertAuditLog } from "../db.js";
import {
  insertMedicalHistory,
  insertOralExam,
  insertStopBang,
  completeStopBang,
  getStopBangById,
  type MedicalHistoryRecord,
  type OralExamRecord,
  type StopBangRecord,
} from "../db/clinicalRecords.js";
import { GetPatientByIdQuery } from "../queries/patient.js";
import { ConflictError, NotFoundError } from "../errors.js";
import {
  validateMedicalHistory,
  validateOralExam,
  validateStop,
  validateBang,
  type ClinicalRecordKind,
} from "./clinicalRecordFields.js";

/**
 * COMMANDS — clinical questionnaires recorded by staff (migration 030,
 * ADR-023; replaces commands/endoIntake.ts + commands/stopBangScreening.ts).
 * Printing lives in commands/patientChecklist.ts. Every command first resolves the patient
 * through GetPatientByIdQuery, which enforces territory access — the 026
 * read/PDF paths skipped that check.
 */

export type ClinicalRecord = MedicalHistoryRecord | OralExamRecord | StopBangRecord;

const AUDIT_ENTITY: Record<ClinicalRecordKind, string> = {
  medical_history: "MedicalHistoryQuestionnaire",
  oral_exam: "OralExam",
  stop_bang: "StopBangScreening",
};

async function requirePatient(ctx: TenantContext, patientId: string): Promise<void> {
  const patient = await GetPatientByIdQuery(ctx, patientId);
  if (!patient) throw new NotFoundError("Patient", patientId);
}

export async function RecordClinicalQuestionnaireCommand(
  ctx: TenantContext,
  patientId: string,
  kind: ClinicalRecordKind,
  input: Record<string, unknown>
): Promise<ClinicalRecord> {
  await requirePatient(ctx, patientId);
  const meta = { patient_id: patientId, source: "staff" as const, recorded_by: ctx.user.id, request_id: null, consent: null };

  let record: ClinicalRecord;
  if (kind === "medical_history") {
    record = await insertMedicalHistory(ctx.client, meta, validateMedicalHistory(input, { requireAll: false }));
  } else if (kind === "oral_exam") {
    record = await insertOralExam(ctx.client, meta, validateOralExam(input));
  } else {
    record = await insertStopBang(ctx.client, meta, validateStop(input), validateBang(input, { required: false }));
  }

  await insertAuditLog(ctx.client, {
    user_id: ctx.user.id,
    action: "create",
    entity_type: AUDIT_ENTITY[kind],
    entity_id: record.id,
    entity_after: { patient_id: patientId, source: "staff" },
    request_id: ctx.requestId,
  });
  return record;
}

/** The doctor completes B-A-N-G on a screening whose S-T-O-P the patient self-reported (or staff left for later). */
export async function CompleteStopBangCommand(
  ctx: TenantContext,
  patientId: string,
  screeningId: string,
  input: Record<string, unknown>
): Promise<StopBangRecord> {
  await requirePatient(ctx, patientId);
  const existing = await getStopBangById(ctx.client, screeningId);
  if (!existing || existing.patient_id !== patientId) throw new NotFoundError("StopBangScreening", screeningId);

  const completed = await completeStopBang(ctx.client, screeningId, ctx.user.id, validateBang(input, { required: true }));
  if (!completed) throw new ConflictError("This STOP-Bang screening is already complete");

  await insertAuditLog(ctx.client, {
    user_id: ctx.user.id,
    action: "update",
    entity_type: AUDIT_ENTITY.stop_bang,
    entity_id: screeningId,
    entity_after: { patient_id: patientId, score: completed.score },
    request_id: ctx.requestId,
  });
  return completed;
}
