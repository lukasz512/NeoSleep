import type { TenantContext } from "../context/TenantContext.js";
import { insertAuditLog, insertFileAttachment } from "../db.js";
import {
  insertMedicalHistory,
  insertOralExam,
  insertStopBang,
  completeStopBang,
  getMedicalHistoryById,
  getOralExamById,
  getStopBangById,
  listMedicalHistoryForPatient,
  listOralExamsForPatient,
  type MedicalHistoryRecord,
  type OralExamRecord,
  type StopBangRecord,
} from "../db/clinicalRecords.js";
import { getPatientPdfContext } from "../db/patientPdfContext.js";
import { GetPatientByIdQuery } from "../queries/patient.js";
import { GetCurrentDocumentContentQuery } from "../queries/documentContent.js";
import { renderDocumentHtml } from "@neo/documents";
import { renderHtmlToPdf } from "../services/documentRenderer.js";
import { uploadPartnerDocument, getPartnerDocumentSignedUrl, deletePartnerDocument } from "../services/partnerDocuments.js";
import { ConflictError, NotFoundError } from "../errors.js";
import {
  MEDICAL_HISTORY_QUESTIONS,
  ORAL_EXAM_QUESTIONS,
  STOP_QUESTIONS,
  BANG_QUESTIONS,
  validateMedicalHistory,
  validateOralExam,
  validateStop,
  validateBang,
  type ClinicalRecordKind,
} from "./clinicalRecordFields.js";

/**
 * COMMANDS — clinical questionnaires recorded by staff, plus their PDFs
 * (migration 030, ADR-023; replaces commands/endoIntake.ts +
 * commands/stopBangScreening.ts). Every command first resolves the patient
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

// ---------------------------------------------------------------------------
// PDF generation
// ---------------------------------------------------------------------------

/** "Sí" / "No" / "" (not answered) — the templates are Mexico-specific Spanish content. */
function yesNoBlank(value: boolean | null | undefined): string {
  if (value === true) return "Sí";
  if (value === false) return "No";
  return "";
}

/**
 * Both templates are Mexico-specific dental content (DOCUMENT_MANIFEST
 * restricts them to ["en","mx"], no Polish clinic uses them) — always
 * rendered in "mx", not derived from the patient's region.
 */
const PDF_LOCALE = "mx";
const formatDate = (date: Date) => date.toLocaleDateString("es-MX");

export interface GeneratedPdf {
  id: string;
  filename: string;
  /** Short-lived signed URL, so the client can open the PDF straight away without a second round trip. */
  url: string;
}

/**
 * Historia Endo = medical history + oral exam on one form. Generated from
 * either half; the other half is the patient's most recent record of that
 * kind (or left blank, for filling on paper, if there is none yet).
 */
async function historiaEndoFields(
  ctx: TenantContext,
  patientId: string,
  kind: "medical_history" | "oral_exam",
  recordId: string
): Promise<{ fields: Record<string, string>; recordDate: Date }> {
  let history: MedicalHistoryRecord | null;
  let exam: OralExamRecord | null;
  if (kind === "medical_history") {
    history = await getMedicalHistoryById(ctx.client, recordId);
    if (!history || history.patient_id !== patientId) throw new NotFoundError("MedicalHistoryQuestionnaire", recordId);
    exam = (await listOralExamsForPatient(ctx.client, patientId))[0] ?? null;
  } else {
    exam = await getOralExamById(ctx.client, recordId);
    if (!exam || exam.patient_id !== patientId) throw new NotFoundError("OralExam", recordId);
    history = (await listMedicalHistoryForPatient(ctx.client, patientId))[0] ?? null;
  }

  const fields: Record<string, string> = {
    medical_history_other: history?.medical_history_other ?? "",
    q_skeletal_class: exam?.skeletal_class ?? "",
    diente: exam?.tooth ?? "",
  };
  for (const key of MEDICAL_HISTORY_QUESTIONS) fields[`q_${key}`] = yesNoBlank(history?.[key]);
  for (const key of ORAL_EXAM_QUESTIONS) fields[`q_${key}`] = yesNoBlank(exam?.[key]);
  return { fields, recordDate: (kind === "medical_history" ? history!.created_at : exam!.created_at) };
}

/** Runs `fn` in its own tenant transaction with a fresh TenantContext — the route supplies it (withTenant + buildContext). */
export type TenantRunner = <T>(fn: (ctx: TenantContext) => Promise<T>) => Promise<T>;

interface PreparedPdf {
  templateKey: "historiaEndo" | "stopBang";
  html: string;
  dataFields: Record<string, string>;
  filename: string;
  contentVersionId: string | null;
}

async function preparePdf(ctx: TenantContext, patientId: string, kind: ClinicalRecordKind, recordId: string): Promise<PreparedPdf> {
  await requirePatient(ctx, patientId);
  const pdfContext = await getPatientPdfContext(ctx.client, patientId);
  if (!pdfContext) throw new NotFoundError("Patient", patientId);

  let templateKey: "historiaEndo" | "stopBang";
  let html: string;
  let fields: Record<string, string>;
  let recordDate: Date;
  let contentVersionId: string | null = null;

  if (kind === "stop_bang") {
    const screening = await getStopBangById(ctx.client, recordId);
    if (!screening || screening.patient_id !== patientId) throw new NotFoundError("StopBangScreening", recordId);
    templateKey = "stopBang";
    // No content slot — a fixed clinical instrument, not admin-editable prose.
    html = renderDocumentHtml("stopBang", PDF_LOCALE);
    fields = { score: screening.score === null ? "—" : String(screening.score) };
    for (const key of [...STOP_QUESTIONS, ...BANG_QUESTIONS]) fields[`q_${key}`] = yesNoBlank(screening[key]);
    recordDate = screening.created_at;
  } else {
    templateKey = "historiaEndo";
    // Throws NotFoundError until an admin has authored the consent text —
    // deliberate: a missing consent paragraph is a compliance gap, not cosmetic.
    const content = await GetCurrentDocumentContentQuery("historiaEndo", PDF_LOCALE);
    contentVersionId = content.id;
    html = renderDocumentHtml("historiaEndo", PDF_LOCALE, content.content_html);
    ({ fields, recordDate } = await historiaEndoFields(ctx, patientId, kind, recordId));
  }

  return {
    templateKey,
    html,
    contentVersionId,
    filename: `${templateKey === "historiaEndo" ? "historia-endo" : "stop-bang"}-${recordDate.toISOString().slice(0, 10)}.pdf`,
    dataFields: {
      nombre_paciente: pdfContext.patient_name,
      nombre_medico: pdfContext.practitioner_name ?? "",
      nombre_clinica: pdfContext.organization_name ?? "",
      fecha: formatDate(recordDate),
      ...fields,
    },
  };
}

/**
 * Three phases, deliberately NOT one transaction: (1) read + access check
 * in a tenant transaction, (2) render in Chromium and upload to Storage
 * with no DB connection held — a render takes seconds and queues behind
 * MAX_CONCURRENT_RENDERS, which would otherwise pin pooled connections
 * open — (3) record the file_attachment + audit row in a second
 * transaction. If (3) fails, the uploaded PDF (health data) is deleted
 * again rather than left orphaned in the bucket.
 */
export async function GenerateClinicalRecordPdfCommand(
  runInTenant: TenantRunner,
  patientId: string,
  kind: ClinicalRecordKind,
  recordId: string
): Promise<GeneratedPdf> {
  const prepared = await runInTenant((ctx) => preparePdf(ctx, patientId, kind, recordId));

  const pdfBytes = await renderHtmlToPdf(prepared.html, { dataFields: prepared.dataFields });
  const uploaded = await uploadPartnerDocument(`patient/${patientId}/${kind}-${recordId}-${Date.now()}.pdf`, pdfBytes, "application/pdf");

  let attachmentId: string;
  try {
    attachmentId = await runInTenant(async (ctx) => {
      const attachment = await insertFileAttachment(ctx.client, {
        entity_type: "patient",
        entity_id: patientId,
        url: uploaded.path,
        storage_provider: "supabase",
        bucket: uploaded.bucket,
        path: uploaded.path,
        filename: prepared.filename,
        mime_type: "application/pdf",
        size_bytes: pdfBytes.byteLength,
        is_public: false,
        uploaded_by: ctx.user.id,
        metadata: { document_type: prepared.templateKey, record_kind: kind, record_id: recordId, content_version_id: prepared.contentVersionId },
      });
      await insertAuditLog(ctx.client, {
        user_id: ctx.user.id,
        action: "create",
        entity_type: "FileAttachment",
        entity_id: attachment.id,
        entity_after: { document_type: prepared.templateKey, patient_id: patientId, record_kind: kind, record_id: recordId },
        request_id: ctx.requestId,
      });
      return attachment.id;
    });
  } catch (err) {
    await deletePartnerDocument(uploaded.path).catch((cleanupErr: unknown) =>
      console.error(`[clinicalRecords] could not delete orphaned PDF ${uploaded.path}:`, cleanupErr)
    );
    throw err;
  }

  return { id: attachmentId, filename: prepared.filename, url: await getPartnerDocumentSignedUrl(uploaded.path) };
}
