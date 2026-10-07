import type { PoolClient } from "pg";
import type { TenantContext } from "../context/TenantContext.js";
import { insertAuditLog } from "../db.js";
import { insertFileAttachment, getFileAttachmentById } from "../db/fileAttachment.js";
import { insertDocumentLink, getUsableDocumentLinkByHash, markDocumentLinkOpened, type DocumentLink } from "../db/documentLink.js";
import { insertPatientEmailSend } from "../db/patientEmailSend.js";
import { getPatientPdfContext } from "../db/patientPdfContext.js";
import { GetPatientChecklistQuery } from "../queries/patientChecklist.js";
import { uploadPartnerDocument, deletePartnerDocument, downloadPartnerDocument } from "../services/partnerDocuments.js";
import { sendDocumentLinkEmail } from "../mailer.js";
import { hashToken } from "../utils/hashToken.js";
import { generateToken } from "../utils/generateToken.js";
import { maskEmail } from "../utils/maskEmail.js";
import { patientEmailLocale } from "../utils/patientEmailLocale.js";
import { isSignatureDataUrl } from "../utils/signatureDataUrl.js";
import { AppError, ForbiddenError, NotFoundError, ValidationError } from "../errors.js";
import { PatientHasNoEmailError, QuestionnaireEmailUnavailableError } from "./questionnaireRequest.js";
import { PrintChecklistItemCommand } from "./patientChecklist.js";

/**
 * "Send the Historia clínica to the patient" (NEO-258), the last "Siguiente
 * paso" on the patient card. Decision form neo258-r1:
 *   D1 the email carries a link valid 7 days, never the PDF;
 *   D2 only once every Historia clínica section is done;
 *   D3 only signed by the doctor — so only a doctor sends it.
 * The signed PDF is rendered once (PrintChecklistItemCommand, NEO-255) and
 * stored privately; the link serves that stored copy, so what the patient
 * downloads is exactly what the doctor signed. Recipient = the patient's own
 * email on file, never an address from the request.
 */

export const DOCUMENT_LINK_TTL_DAYS = 7;
const HC_KEY = "historiaEndo";
const HC_SECTION_KEYS = ["medicalHistory", "stopBang", "oralExam", "tmjExam"];

/** Unknown and expired links look the same from outside. */
export class DocumentLinkInvalidError extends AppError {
  constructor() {
    super("This link is no longer valid", "LINK_INVALID", 410);
  }
}

export interface SentDocumentLink {
  link: DocumentLink;
  sent_to: string;
}

export async function SendHistoriaClinicaEmailCommand(
  ctx: TenantContext,
  patientId: string,
  frontendOrigin: string,
  body: { doctorSignature?: unknown }
): Promise<SentDocumentLink> {
  if (ctx.user.role !== "doctor") throw new ForbiddenError("Only a doctor can sign and send the Historia clínica");
  if (!isSignatureDataUrl(body.doctorSignature)) throw new ValidationError("A drawn signature (PNG) is required");

  const checklist = await GetPatientChecklistQuery(ctx, patientId); // territory-checked
  const sections = checklist.items.filter((i) => HC_SECTION_KEYS.includes(i.key));
  if (!checklist.items.some((i) => i.key === HC_KEY) || sections.length === 0) throw new ValidationError("This patient has no Historia clínica");
  if (sections.some((s) => s.status !== "done")) throw new ValidationError("The Historia clínica is not complete yet");

  const context = await getPatientPdfContext(ctx.client, patientId, ctx.user.id);
  if (!context) throw new NotFoundError("Patient", patientId);
  const email = context.patient_email?.trim();
  if (!email) throw new PatientHasNoEmailError();

  const printed = await PrintChecklistItemCommand(ctx, patientId, HC_KEY, { doctorSignature: body.doctorSignature });
  if (printed.kind !== "pdf") throw new ValidationError("The Historia clínica could not be rendered");

  const uploaded = await uploadPartnerDocument(`patient/${patientId}/historia-clinica-${Date.now()}.pdf`, printed.bytes, "application/pdf");
  try {
    const file = await insertFileAttachment(ctx.client, {
      entity_type: "patient",
      entity_id: patientId,
      url: uploaded.path,
      storage_provider: "supabase",
      bucket: uploaded.bucket,
      path: uploaded.path,
      filename: printed.filename,
      mime_type: "application/pdf",
      size_bytes: printed.bytes.byteLength,
      is_public: false,
      uploaded_by: ctx.user.id,
      metadata: { document_type: "historia_clinica_sent", doctor_signed: true },
    });

    const token = generateToken();
    const link = await insertDocumentLink(ctx.client, {
      patient_id: patientId,
      file_attachment_id: file.id,
      document_key: HC_KEY,
      token_hash: hashToken(token),
      expires_at: new Date(Date.now() + DOCUMENT_LINK_TTL_DAYS * 24 * 60 * 60 * 1000),
      created_by: ctx.user.id,
    });

    // Token in the #fragment: browsers never send it to a server (same as /q and /a).
    const sent = await sendDocumentLinkEmail(
      email,
      `${frontendOrigin}/d#${token}`,
      {
        title: context.patient_salutation,
        firstName: context.patient_first_name,
        lastName: context.patient_last_name,
        language: patientEmailLocale(context.patient_language, context.patient_region),
        region: context.patient_region,
      },
      { name: context.organization_name, email: context.organization_email },
      DOCUMENT_LINK_TTL_DAYS,
      { tenant: ctx.slug, kind: "document_link" }
    );
    if (!sent) throw new QuestionnaireEmailUnavailableError();

    const sentTo = maskEmail(email);
    await insertPatientEmailSend(ctx.client, {
      patientId,
      sentBy: ctx.user.id,
      kind: "document_link",
      sentToMasked: sentTo,
      providerMessageId: sent,
    });
    await insertAuditLog(ctx.client, {
      user_id: ctx.user.id,
      action: "notify",
      entity_type: "DocumentLink",
      entity_id: link.id,
      entity_after: { patient_id: patientId, document: HC_KEY, channel: "email", sent_to: sentTo, expires_at: link.expires_at.toISOString() },
      request_id: ctx.requestId,
    });
    return { link, sent_to: sentTo };
  } catch (err) {
    // The tenant transaction rolls the rows back; the stored file has to go by hand.
    await deletePartnerDocument(uploaded.path).catch(() => undefined);
    throw err;
  }
}

function validTokenShape(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
}

export interface PublicDocument {
  filename: string;
  bytes: Uint8Array;
}

/** The patient's download through the emailed link (POST /public/document) — every download is counted and audited. */
export async function DownloadPublicDocumentCommand(client: PoolClient, token: unknown): Promise<PublicDocument> {
  if (!validTokenShape(token)) throw new DocumentLinkInvalidError();
  const link = await getUsableDocumentLinkByHash(client, hashToken(token));
  if (!link) throw new DocumentLinkInvalidError();
  const file = await getFileAttachmentById(client, link.file_attachment_id);
  if (!file?.path) throw new DocumentLinkInvalidError();

  const bytes = await downloadPartnerDocument(file.path);
  await markDocumentLinkOpened(client, link.id);
  await insertAuditLog(client, {
    user_id: null,
    action: "read",
    entity_type: "DocumentLink",
    entity_id: link.id,
    entity_after: { patient_id: link.patient_id, document: link.document_key },
    metadata: { actor: "patient", purpose: "document_link" },
  });
  return { filename: file.filename ?? `${link.document_key}.pdf`, bytes };
}
