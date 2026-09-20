import type { TenantContext } from "../context/TenantContext.js";
import { insertAuditLog, insertFileAttachment } from "../db.js";
import { insertStopBangScreening, getStopBangScreeningById, type StopBangScreening } from "../db/stopBangScreening.js";
import { getPatientPdfContext } from "../db/endoIntake.js";
import { GetPatientByIdQuery } from "../queries/patient.js";
import { renderDocumentHtml } from "@neo/documents";
import { renderHtmlToPdf } from "../services/documentRenderer.js";
import { uploadPartnerDocument } from "../services/partnerDocuments.js";
import { NotFoundError, ValidationError } from "../errors.js";

/**
 * COMMANDS — STOP-Bang OSA screening (see
 * docs/stories/historia-endo-clinical-intake-and-printable-pdf.md,
 * ADR-022). Unlike endo_intake, this is append-only — each screening is
 * its own row, score computed by Postgres (GENERATED ALWAYS ... STORED),
 * never recomputed in application code.
 */

const REQUIRED_FIELDS = [
  "snoring",
  "tiredness",
  "observed_apnea",
  "pressure",
  "bmi_over_35",
  "age_over_50",
  "neck_circumference_over_40cm",
  "is_male",
] as const;

function validateFields(input: Record<string, unknown>): Record<(typeof REQUIRED_FIELDS)[number], boolean> {
  const fields = {} as Record<(typeof REQUIRED_FIELDS)[number], boolean>;
  for (const field of REQUIRED_FIELDS) {
    const value = input[field];
    if (typeof value !== "boolean") throw new ValidationError(`${field} is required and must be a boolean`);
    fields[field] = value;
  }
  return fields;
}

export async function RecordStopBangScreeningCommand(
  ctx: TenantContext,
  patientId: string,
  input: Record<string, unknown>
): Promise<StopBangScreening> {
  const patient = await GetPatientByIdQuery(ctx, patientId);
  if (!patient) throw new NotFoundError("Patient", patientId);

  const fields = validateFields(input);
  const screening = await insertStopBangScreening(ctx.client, { patient_id: patientId, recorded_by: ctx.user.id, ...fields });

  await insertAuditLog(ctx.client, {
    user_id: ctx.user.id,
    action: "create",
    entity_type: "StopBangScreening",
    entity_id: screening.id,
    entity_after: { patient_id: patientId, score: screening.score },
    request_id: ctx.requestId,
  });

  return screening;
}

function yesNo(value: boolean): string {
  return value ? "Sí" : "No";
}

/** Same locale reasoning as commands/endoIntake.ts's HISTORIA_ENDO_LOCALE — Mexico-specific content, DOCUMENT_MANIFEST restricts stopBang to ["en","mx"]. */
const STOP_BANG_LOCALE = "mx";

export async function GenerateStopBangPdfCommand(ctx: TenantContext, patientId: string, screeningId: string): Promise<{ id: string; path: string }> {
  const pdfContext = await getPatientPdfContext(ctx.client, patientId);
  if (!pdfContext) throw new NotFoundError("Patient", patientId);

  const screening = await getStopBangScreeningById(ctx.client, screeningId);
  if (!screening || screening.patient_id !== patientId) throw new NotFoundError("StopBangScreening", screeningId);

  // No content_html slot for stopBang.html (a fixed clinical instrument,
  // not admin-editable prose) — renderDocumentHtml called with no third
  // arg, matching its own documented "contentHtml === undefined" no-op path.
  const html = renderDocumentHtml("stopBang", STOP_BANG_LOCALE);
  const pdfBytes = await renderHtmlToPdf(html, {
    dataFields: {
      nombre_paciente: pdfContext.patient_name,
      nombre_medico: pdfContext.practitioner_name ?? "",
      nombre_clinica: pdfContext.organization_name ?? "",
      fecha: screening.created_at.toLocaleDateString("es-MX"),
      q_snoring: yesNo(screening.snoring),
      q_tiredness: yesNo(screening.tiredness),
      q_observed_apnea: yesNo(screening.observed_apnea),
      q_pressure: yesNo(screening.pressure),
      q_bmi_over_35: yesNo(screening.bmi_over_35),
      q_age_over_50: yesNo(screening.age_over_50),
      q_neck_circumference_over_40cm: yesNo(screening.neck_circumference_over_40cm),
      q_is_male: yesNo(screening.is_male),
      score: String(screening.score),
    },
  });

  const path = `patient/${patientId}/stop-bang-${screeningId}.pdf`;
  const uploaded = await uploadPartnerDocument(path, pdfBytes, "application/pdf");

  const attachment = await insertFileAttachment(ctx.client, {
    entity_type: "patient",
    entity_id: patientId,
    url: uploaded.path,
    storage_provider: "supabase",
    bucket: uploaded.bucket,
    path: uploaded.path,
    filename: "stop-bang.pdf",
    mime_type: "application/pdf",
    size_bytes: pdfBytes.byteLength,
    is_public: false,
    uploaded_by: ctx.user.id,
    metadata: { document_type: "stopBang", stop_bang_screening_id: screeningId, score: screening.score },
  });

  await insertAuditLog(ctx.client, {
    user_id: ctx.user.id,
    action: "create",
    entity_type: "FileAttachment",
    entity_id: attachment.id,
    entity_after: { document_type: "stopBang", patient_id: patientId, screening_id: screeningId },
    request_id: ctx.requestId,
  });

  return { id: attachment.id, path: attachment.path! };
}
