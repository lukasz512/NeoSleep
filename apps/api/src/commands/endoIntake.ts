import type { TenantContext } from "../context/TenantContext.js";
import { insertAuditLog, insertFileAttachment } from "../db.js";
import {
  upsertEndoIntake,
  getEndoIntakeByPatientId,
  getPatientPdfContext,
  ENDO_INTAKE_CHECKLIST_COLUMNS,
  type EndoIntake,
  type EndoIntakeFields,
  type EndoIntakeChecklistColumn,
} from "../db/endoIntake.js";
import { GetPatientByIdQuery } from "../queries/patient.js";
import { GetCurrentDocumentContentQuery } from "../queries/documentContent.js";
import { renderDocumentHtml } from "@neo/documents";
import { renderHtmlToPdf } from "../services/documentRenderer.js";
import { uploadPartnerDocument } from "../services/partnerDocuments.js";
import { NotFoundError, ValidationError } from "../errors.js";

/**
 * COMMANDS — Historia Endo intake checklist (see
 * docs/stories/historia-endo-clinical-intake-and-printable-pdf.md,
 * ADR-022). Same two-DB-handle shape as commands/documentContent.ts: PDF
 * generation reads platform.document_content_version via a separate
 * withPlatform() call inside GetCurrentDocumentContentQuery, while
 * everything else here runs on ctx.client (tenant schema).
 */

const SKELETAL_CLASS_VALUES = new Set(["I", "II", "III"]);

function validateFields(input: Record<string, unknown>): EndoIntakeFields {
  const fields: EndoIntakeFields = {};
  for (const column of ENDO_INTAKE_CHECKLIST_COLUMNS) {
    if (!(column in input)) continue;
    const value = input[column];
    if (column === "medical_history_other") {
      if (value !== null && typeof value !== "string") throw new ValidationError(`${column} must be a string or null`);
      fields[column] = value === null ? null : value.trim();
    } else if (column === "skeletal_class") {
      if (value !== null && !SKELETAL_CLASS_VALUES.has(value as string)) {
        throw new ValidationError(`skeletal_class must be "I", "II", "III", or null`);
      }
      fields[column] = value as "I" | "II" | "III" | null;
    } else {
      if (value !== null && typeof value !== "boolean") throw new ValidationError(`${column} must be a boolean or null`);
      fields[column] = value;
    }
  }
  return fields;
}

export async function SaveEndoIntakeCommand(
  ctx: TenantContext,
  patientId: string,
  input: Record<string, unknown>
): Promise<EndoIntake> {
  const patient = await GetPatientByIdQuery(ctx, patientId);
  if (!patient) throw new NotFoundError("Patient", patientId);

  const fields = validateFields(input);
  const intake = await upsertEndoIntake(ctx.client, patientId, ctx.user.id, fields);

  // entity_id is patientId — a real UUID, so insertAuditLog's own
  // isValidEntityUuid check stores it (unlike ADR-021's DocumentTemplateEntityType
  // audit rows, which have no real UUID to key on).
  await insertAuditLog(ctx.client, {
    user_id: ctx.user.id,
    action: "update",
    entity_type: "EndoIntake",
    entity_id: patientId,
    entity_after: fields,
    request_id: ctx.requestId,
  });

  return intake;
}

/** "Sí" / "No" / "" (not yet answered) — matches historiaEndo.html's q_* data-field spans. */
function yesNoBlank(value: boolean | null | undefined): string {
  if (value === true) return "Sí";
  if (value === false) return "No";
  return "";
}

function checklistDataFields(intake: EndoIntake | null): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const column of ENDO_INTAKE_CHECKLIST_COLUMNS) {
    const value = intake?.[column as EndoIntakeChecklistColumn] ?? null;
    if (column === "medical_history_other") continue; // handled separately, free text not yes/no
    if (column === "skeletal_class") {
      fields[`q_${column}`] = (value as string | null) ?? "";
      continue;
    }
    fields[`q_${column}`] = yesNoBlank(value as boolean | null);
  }
  return fields;
}

/**
 * Historia Endo is Mexico-specific dental content (DOCUMENT_MANIFEST
 * restricts it to locales ["en","mx"], no Polish clinic uses this) — always
 * rendered in "mx", not derived from the patient's own region, to avoid a
 * locale a template was never authored for.
 */
const HISTORIA_ENDO_LOCALE = "mx";

export async function GenerateEndoIntakePdfCommand(ctx: TenantContext, patientId: string): Promise<{ id: string; path: string }> {
  const pdfContext = await getPatientPdfContext(ctx.client, patientId);
  if (!pdfContext) throw new NotFoundError("Patient", patientId);

  const intake = await getEndoIntakeByPatientId(ctx.client, patientId);
  const currentVersion = await GetCurrentDocumentContentQuery("historiaEndo", HISTORIA_ENDO_LOCALE);

  const html = renderDocumentHtml("historiaEndo", HISTORIA_ENDO_LOCALE, currentVersion.content_html);
  const pdfBytes = await renderHtmlToPdf(html, {
    dataFields: {
      nombre_paciente: pdfContext.patient_name,
      nombre_medico: pdfContext.practitioner_name ?? "",
      nombre_clinica: pdfContext.organization_name ?? "",
      fecha: new Date().toLocaleDateString("es-MX"),
      diente: "",
      medical_history_other: intake?.medical_history_other ?? "",
      ...checklistDataFields(intake),
    },
  });

  const path = `patient/${patientId}/historia-endo-${Date.now()}.pdf`;
  const uploaded = await uploadPartnerDocument(path, pdfBytes, "application/pdf");

  const attachment = await insertFileAttachment(ctx.client, {
    entity_type: "patient",
    entity_id: patientId,
    url: uploaded.path,
    storage_provider: "supabase",
    bucket: uploaded.bucket,
    path: uploaded.path,
    filename: "historia-endo.pdf",
    mime_type: "application/pdf",
    size_bytes: pdfBytes.byteLength,
    is_public: false,
    uploaded_by: ctx.user.id,
    metadata: { document_type: "historiaEndo", content_version_id: currentVersion.id },
  });

  await insertAuditLog(ctx.client, {
    user_id: ctx.user.id,
    action: "create",
    entity_type: "FileAttachment",
    entity_id: attachment.id,
    entity_after: { document_type: "historiaEndo", patient_id: patientId },
    request_id: ctx.requestId,
  });

  return { id: attachment.id, path: attachment.path! };
}
