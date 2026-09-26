import type { TenantContext } from "../context/TenantContext.js";
import { insertAuditLog, insertFileAttachment, getFileAttachmentById, deleteFileAttachment } from "../db.js";
import type { MedicalHistoryRecord, OralExamRecord, StopBangRecord } from "../db/clinicalRecords.js";
import { getPatientPdfContext, formatBirthDate, patientDocumentFooter } from "../db/patientPdfContext.js";
import { GetPatientChecklistQuery, POLYSOMNOGRAPHY_KEY, type ChecklistItem } from "../queries/patientChecklist.js";
import { GetCurrentDocumentContentQuery } from "../queries/documentContent.js";
import { renderDocumentHtml, renderDocumentFooterHtml, getDocumentRefCode, documentT, DOCUMENT_MANIFEST } from "@neo/documents";
import { renderHtmlToPdf, type ChoiceField } from "../services/documentRenderer.js";
import { formatFormDate, formatFormDateTime } from "../utils/formDate.js";
import { uploadPartnerDocument, deletePartnerDocument, getPartnerDocumentSignedUrl } from "../services/partnerDocuments.js";
import { NotFoundError, ValidationError } from "../errors.js";
import { MEDICAL_HISTORY_QUESTIONS, ORAL_EXAM_QUESTIONS, STOP_QUESTIONS, BANG_QUESTIONS } from "./clinicalRecordFields.js";

/**
 * COMMANDS — the patient Estudios checklist (NEO-36 part 2, ADR-024):
 * print an item, upload a study file ("Agregar estudio"), delete an upload.
 */

// ---------------------------------------------------------------------------
// Print
// ---------------------------------------------------------------------------

const YES_NO = ["Sí", "No"] as const;
const SKELETAL_CLASSES = ["I", "II", "III"] as const;

/**
 * A yes/no question always prints both tick-boxes (document system,
 * 2026-09-26): the recorded answer filled, or both empty to fill in by hand
 * (drawn by the renderer, see choiceFields).
 */
function setYesNo(choices: Record<string, ChoiceField>, key: string, value: boolean | null | undefined): void {
  choices[key] = value == null ? YES_NO : { options: YES_NO, selected: value ? "Sí" : "No" };
}

/** STOP-Bang's official risk zones (0–2 / 3–4 / 5–8), the score's zone marked — same thresholds as the app's stopBangRisk(). */
function stopBangZones(locale: string, score: number | null): ChoiceField {
  const zones = (["low", "intermediate", "high"] as const).map((zone) => documentT(locale, `documents.stopBang.risk.${zone}`));
  if (score == null) return zones;
  return { options: zones, selected: zones[score >= 5 ? 2 : score >= 3 ? 1 : 0] };
}

/** Signature model A (Łukasz, 2026-09-26): answers the patient gave through their personal link carry an attribution stamp instead of a drawn signature. */
function patientStamp(locale: string, source: string | undefined, answeredAt: Date | undefined): string {
  if (source !== "patient" || !answeredAt) return "";
  return documentT(locale, "documents.common.patientStamp", { date: formatFormDateTime(answeredAt, locale) });
}

/** A measurement as printed on the form: one decimal, dropped when whole, decimal comma except for English. */
function formatMeasure(value: number, locale: string): string {
  const text = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return locale === "en" ? text : text.replace(".", ",");
}

/** What the specialist measured for B and N, printed under those two questions (migration 034). Empty when answered as a plain yes/no. */
function measurementDetails(locale: string, screening: StopBangRecord | null): Record<string, string> {
  const fields = { bmi_detail: "", neck_detail: "" };
  if (!screening) return fields;
  if (screening.bmi != null && screening.height_cm != null && screening.weight_kg != null) {
    fields.bmi_detail = documentT(locale, "documents.stopBang.bmiDetail", {
      bmi: formatMeasure(screening.bmi, locale),
      height: formatMeasure(screening.height_cm, locale),
      weight: formatMeasure(screening.weight_kg, locale),
    });
  }
  if (screening.neck_cm != null) fields.neck_detail = documentT(locale, "documents.stopBang.neckDetail", { neck: formatMeasure(screening.neck_cm, locale) });
  return fields;
}

/** The dental/sleep clinical templates are Mexican Spanish content; fall back to a template's first locale. */
function printLocale(templateKey: string): string {
  const locales = (DOCUMENT_MANIFEST.find((m) => m.templateKey === templateKey)?.locales ?? []) as readonly string[];
  return locales.includes("mx") ? "mx" : (locales[0] ?? "mx");
}

export type PrintResult =
  /** A freshly rendered PDF — the route streams it, nothing is stored (printing a blank form must not litter the patient's documents). */
  | { kind: "pdf"; bytes: Uint8Array; filename: string }
  /** An already stored document (a consent the patient signed) — a short-lived signed URL to it. */
  | { kind: "stored"; url: string };

function recordOf<T>(item: ChecklistItem, recordId: string | undefined): T | null {
  const entries = item.history.filter((h) => h.type === "record" && h.record);
  const entry = recordId ? entries.find((h) => h.id === recordId) : entries[0];
  if (recordId && !entry) throw new NotFoundError("Record", recordId);
  return (entry?.record as T | undefined) ?? null;
}

export async function PrintChecklistItemCommand(
  ctx: TenantContext,
  patientId: string,
  key: string,
  recordId?: string
): Promise<PrintResult> {
  const checklist = await GetPatientChecklistQuery(ctx, patientId); // territory-checked
  const item = checklist.items.find((i) => i.key === key);
  if (!item) throw new NotFoundError("Checklist item", key);
  if (!item.actions.print || key === POLYSOMNOGRAPHY_KEY) throw new ValidationError(`"${key}" has nothing to print`);

  // A signed consent prints as the signed document itself.
  const signed = item.fillMode === "consent" ? item.history.find((h) => h.type === "consent" && h.file_attachment_id) : null;
  if (signed?.file_attachment_id && !recordId) {
    const file = await getFileAttachmentById(ctx.client, signed.file_attachment_id);
    if (file?.path) return { kind: "stored", url: await getPartnerDocumentSignedUrl(file.path) };
  }

  const pdfContext = await getPatientPdfContext(ctx.client, patientId, ctx.user.id);
  if (!pdfContext) throw new NotFoundError("Patient", patientId);
  const locale = printLocale(key);
  let date = new Date();
  const fields: Record<string, string> = {};
  const choices: Record<string, ChoiceField> = {};

  if (key === "medicalHistory" || key === "historiaEndo") {
    const history =
      key === "medicalHistory"
        ? recordOf<MedicalHistoryRecord>(item, recordId)
        : (recordOf<MedicalHistoryRecord>(checklist.items.find((i) => i.key === "medicalHistory") ?? item, undefined));
    for (const q of MEDICAL_HISTORY_QUESTIONS) setYesNo(choices, `q_${q}`, history?.[q]);
    fields.medical_history_other = history?.medical_history_other ?? "";
    if (key === "medicalHistory" && history) date = history.created_at;
    if (key === "medicalHistory") fields.patient_stamp = patientStamp(locale, history?.source, history?.created_at);
  }
  if (key === "oralExam" || key === "historiaEndo") {
    const exam =
      key === "oralExam"
        ? recordOf<OralExamRecord>(item, recordId)
        : recordOf<OralExamRecord>(checklist.items.find((i) => i.key === "oralExam") ?? item, undefined);
    for (const q of ORAL_EXAM_QUESTIONS) setYesNo(choices, `q_${q}`, exam?.[q]);
    choices.q_skeletal_class = exam?.skeletal_class ? { options: SKELETAL_CLASSES, selected: exam.skeletal_class } : SKELETAL_CLASSES;
    fields.diente = exam?.tooth ?? "";
    if (key === "oralExam" && exam) date = exam.created_at;
  }
  if (key === "stopBang") {
    const screening = recordOf<StopBangRecord>(item, recordId);
    for (const q of [...STOP_QUESTIONS, ...BANG_QUESTIONS]) setYesNo(choices, `q_${q}`, screening?.[q]);
    fields.score = screening?.score == null ? "" : String(screening.score);
    choices.score_zone = stopBangZones(locale, screening?.score ?? null);
    fields.patient_stamp = patientStamp(locale, screening?.source, screening?.created_at);
    // S-T-O-P dates from when it was answered; the specialist's line from when B-A-N-G was completed.
    fields.fecha_stop = screening ? formatFormDate(screening.created_at, locale) : "";
    Object.assign(fields, measurementDetails(locale, screening));
    if (screening) date = screening.source === "patient" && screening.score != null ? screening.updated_at : screening.created_at;
  }

  // Admin-authored prose (consents, Historia Endo) — templates without a content slot render as-is.
  let content: string | undefined;
  try {
    content = (await GetCurrentDocumentContentQuery(key, locale)).content_html;
  } catch (err) {
    if (!(err instanceof NotFoundError)) throw err;
  }
  let html: string;
  try {
    html = renderDocumentHtml(key, locale, content);
  } catch {
    html = renderDocumentHtml(key, locale); // content exists but this template has no slot for it
  }
  if (html.includes("{{content}}")) throw new NotFoundError("Document content", `${key}/${locale}`);

  const bytes = await renderHtmlToPdf(html, {
    footerTemplate: renderDocumentFooterHtml(getDocumentRefCode(key), locale, patientDocumentFooter(pdfContext, locale)),
    marginBottom: "18mm",
    dataFields: {
      nombre_paciente: pdfContext.patient_name,
      fecha_nacimiento: formatBirthDate(pdfContext.patient_birth_date, locale),
      nombre_medico: pdfContext.practitioner_name ?? "",
      nombre_clinica: pdfContext.organization_name ?? "",
      lugar: pdfContext.organization_name ?? "",
      fecha: formatFormDate(date, locale),
      ...fields,
    },
    choiceFields: choices,
  });

  await insertAuditLog(ctx.client, {
    user_id: ctx.user.id,
    action: "read",
    entity_type: "ChecklistItemPrint",
    entity_id: patientId,
    entity_after: { item: key, record_id: recordId ?? null },
    request_id: ctx.requestId,
  });

  return { kind: "pdf", bytes, filename: `${key}-${date.toISOString().slice(0, 10)}.pdf` };
}

// ---------------------------------------------------------------------------
// Upload ("Agregar estudio")
// ---------------------------------------------------------------------------

const UPLOAD_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);
const MAX_TITLE = 200;
const MAX_NOTES = 2000;

export interface UploadStudyInput {
  bytes: Uint8Array;
  mimeType: string;
  filename: string;
  title: unknown;
  notes: unknown;
  /** Attach to (and complete) this checklist item; empty → a new ad-hoc study. */
  checklistItem: unknown;
}

export async function UploadPatientStudyCommand(ctx: TenantContext, patientId: string, input: UploadStudyInput): Promise<{ id: string }> {
  const checklist = await GetPatientChecklistQuery(ctx, patientId); // territory-checked
  if (!UPLOAD_MIME_TYPES.has(input.mimeType)) throw new ValidationError("Only PDF, JPG or PNG files can be uploaded");
  if (!input.bytes?.byteLength) throw new ValidationError("Uploaded file is empty");

  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title || title.length > MAX_TITLE) throw new ValidationError(`title is required (max ${MAX_TITLE} characters)`);
  const notes = typeof input.notes === "string" ? input.notes.trim() : "";
  if (notes.length > MAX_NOTES) throw new ValidationError(`notes must be at most ${MAX_NOTES} characters`);
  const item = typeof input.checklistItem === "string" && input.checklistItem ? input.checklistItem : null;
  if (item && !checklist.items.some((i) => i.key === item)) throw new ValidationError(`Unknown checklist item "${item}"`);

  const safeName = (input.filename || "study").replace(/[^A-Za-z0-9._-]+/g, "_").slice(-120);
  const uploaded = await uploadPartnerDocument(`patient/${patientId}/uploads/${Date.now()}-${safeName}`, input.bytes, input.mimeType);
  try {
    const attachment = await insertFileAttachment(ctx.client, {
      entity_type: "patient",
      entity_id: patientId,
      url: uploaded.path,
      storage_provider: "supabase",
      bucket: uploaded.bucket,
      path: uploaded.path,
      filename: input.filename || safeName,
      mime_type: input.mimeType,
      size_bytes: input.bytes.byteLength,
      is_public: false,
      uploaded_by: ctx.user.id,
      metadata: { document_type: "study_upload", title, notes: notes || null, checklist_item: item, uploaded_by_name: ctx.user.name || ctx.user.email },
    });
    await insertAuditLog(ctx.client, {
      user_id: ctx.user.id,
      action: "create",
      entity_type: "FileAttachment",
      entity_id: attachment.id,
      entity_after: { patient_id: patientId, document_type: "study_upload", checklist_item: item, title },
      request_id: ctx.requestId,
    });
    return { id: attachment.id };
  } catch (err) {
    await deletePartnerDocument(uploaded.path).catch(() => undefined);
    throw err;
  }
}

export async function DeletePatientStudyUploadCommand(ctx: TenantContext, patientId: string, attachmentId: string): Promise<void> {
  await GetPatientChecklistQuery(ctx, patientId); // territory check
  const file = await getFileAttachmentById(ctx.client, attachmentId);
  if (!file || file.entity_type !== "patient" || file.entity_id !== patientId || file.metadata?.document_type !== "study_upload") {
    throw new NotFoundError("Upload", attachmentId);
  }
  await deleteFileAttachment(ctx.client, attachmentId);
  if (file.path) await deletePartnerDocument(file.path).catch(() => undefined);
  await insertAuditLog(ctx.client, {
    user_id: ctx.user.id,
    action: "delete",
    entity_type: "FileAttachment",
    entity_id: attachmentId,
    entity_before: { patient_id: patientId, document_type: "study_upload", title: file.metadata?.title ?? null },
    request_id: ctx.requestId,
  });
}
