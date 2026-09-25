import type { TenantContext } from "../context/TenantContext.js";
import {
  listMedicalHistoryForPatient,
  listOralExamsForPatient,
  listStopBangForPatient,
  type MedicalHistoryRecord,
  type OralExamRecord,
  type StopBangRecord,
} from "../db/clinicalRecords.js";
import { listPendingQuestionnaireRequestsForPatient, type QuestionnaireRequest } from "../db/questionnaireRequest.js";
import { GetPatientByIdQuery } from "./patient.js";
import { NotFoundError } from "../errors.js";

export type ClinicalRecordItem =
  | ({ kind: "medical_history" } & MedicalHistoryRecord)
  | ({ kind: "oral_exam"; source: "staff" } & OralExamRecord)
  | ({ kind: "stop_bang" } & StopBangRecord);

export interface ClinicalRecordsResult {
  /** Every questionnaire fill, all kinds merged, newest first. */
  records: ClinicalRecordItem[];
  /** QR links handed to the patient and not yet submitted / cancelled / expired. */
  pending_requests: QuestionnaireRequest[];
}

/** The Estudios list's clinical half (sleep_study rows come from their own endpoint). Territory-checked via GetPatientByIdQuery. */
export async function ListClinicalRecordsQuery(ctx: TenantContext, patientId: string): Promise<ClinicalRecordsResult> {
  const patient = await GetPatientByIdQuery(ctx, patientId);
  if (!patient) throw new NotFoundError("Patient", patientId);

  // Sequential on purpose: one PoolClient runs one query at a time anyway.
  const histories = await listMedicalHistoryForPatient(ctx.client, patientId);
  const exams = await listOralExamsForPatient(ctx.client, patientId);
  const screenings = await listStopBangForPatient(ctx.client, patientId);
  const pending = await listPendingQuestionnaireRequestsForPatient(ctx.client, patientId);

  const records: ClinicalRecordItem[] = [
    ...histories.map((r) => ({ kind: "medical_history" as const, ...r })),
    ...exams.map((r) => ({ kind: "oral_exam" as const, source: "staff" as const, ...r })),
    ...screenings.map((r) => ({ kind: "stop_bang" as const, ...r })),
  ].sort((a, b) => b.created_at.getTime() - a.created_at.getTime());

  return { records, pending_requests: pending };
}
