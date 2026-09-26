import type { PoolClient } from "pg";
import type { TenantContext } from "../context/TenantContext.js";
import { insertAuditLog, insertFileAttachment } from "../db.js";
import {
  insertQuestionnaireRequest,
  cancelPendingQuestionnaireRequests,
  cancelQuestionnaireRequest,
  getUsableQuestionnaireRequestByHash,
  completeQuestionnaireStep,
  type QuestionnaireRequest,
} from "../db/questionnaireRequest.js";
import { insertMedicalHistory, insertStopBang } from "../db/clinicalRecords.js";
import { insertConsent } from "../db/consent.js";
import { getPatientPdfContext, formatBirthDate, patientDocumentFooter } from "../db/patientPdfContext.js";
import { formatFormDate } from "../utils/formDate.js";
import { withPlatform } from "../db/tenant.js";
import { listPatientChecklistConfig } from "../db/documentTemplateEntityType.js";
import { GetPatientChecklistQuery } from "../queries/patientChecklist.js";
import { GetCurrentDocumentContentQuery } from "../queries/documentContent.js";
import { sanitizeDocumentContentHtml } from "./documentContent.js";
import { renderDocumentHtml, renderDocumentFooterHtml, getDocumentRefCode, fillContentForLocale, documentT, DOCUMENT_MANIFEST } from "@neo/documents";
import { renderHtmlToPdf } from "../services/documentRenderer.js";
import { uploadPartnerDocument, deletePartnerDocument } from "../services/partnerDocuments.js";
import { hashToken } from "../utils/hashToken.js";
import { generateToken } from "../utils/generateToken.js";
import { AppError, NotFoundError, ValidationError } from "../errors.js";
import { sendQuestionnaireLinkEmail } from "../mailer.js";
import { PRIVACY_NOTICE_URL } from "../env.js";
import { validateMedicalHistory, validateStop } from "./clinicalRecordFields.js";

/**
 * COMMANDS — patient QR link (migrations 030 + 031, ADR-023/024).
 *
 * The patient has no account: a staff user creates a questionnaire_request
 * and shows its link as a QR code; the patient's phone opens a public page
 * (apps/pwa /q#<token>) that reads and submits through routes/public.ts.
 * One link can cover several checklist steps — typically "everything the
 * patient has to do": sign the informed consent, answer the medical
 * history, answer S-T-O-P. The token is the only credential: 24h, hashed
 * at rest, dead once every step is done.
 */

export const QUESTIONNAIRE_LINK_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Bumped whenever the health-data notice/consent wording shown before a
 * questionnaire changes (packages/i18n app.questionnaire.consentNotice.* /
 * app.questionnaire.consent) — stored on every patient-submitted record.
 */
export const PATIENT_CONSENT_VERSION = "patient-self-fill-2026-09-25";

/** Largest accepted drawn signature (a PNG data URL) — a finger signature on a phone is ~10-60 KB. */
const MAX_SIGNATURE_DATA_URL_LENGTH = 400_000;
const SIGNATURE_DATA_URL_RE = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;

/** Unknown, used, cancelled and expired links all look identical from outside — no signal about which tokens ever existed. */
export class QuestionnaireLinkInvalidError extends AppError {
  constructor() {
    super("This link is no longer valid", "LINK_INVALID", 410);
  }
}

/** The patient record has no email address to send the questionnaire link to. */
export class PatientHasNoEmailError extends AppError {
  constructor() {
    super("This patient has no email address", "PATIENT_NO_EMAIL", 422);
  }
}

/** Email sending isn't configured (or Resend refused the message) — never report "sent" when nothing left. */
export class QuestionnaireEmailUnavailableError extends AppError {
  constructor() {
    super("The email could not be sent right now", "EMAIL_UNAVAILABLE", 503);
  }
}

export type PublicStepType = "consent" | "medical_history" | "stop_bang";

// ---------------------------------------------------------------------------
// Staff side
// ---------------------------------------------------------------------------

const LEGACY_KIND_ITEMS: Record<string, string> = { medical_history: "medicalHistory", stop_bang: "stopBang" };

export interface CreatedQuestionnaireRequest {
  request: QuestionnaireRequest;
  /** Shown once (QR + copy link) and never stored — "show QR again" issues a fresh link. */
  url: string;
}

/**
 * `items` picks specific checklist items (a per-item QR); omitted, the link
 * covers every item the patient can complete on the phone and hasn't yet,
 * in checklist order. The legacy `{kind}` body (part 1) still maps to one
 * item.
 */
export async function CreateQuestionnaireRequestCommand(
  ctx: TenantContext,
  patientId: string,
  body: { items?: unknown; kind?: unknown },
  frontendOrigin: string
): Promise<CreatedQuestionnaireRequest> {
  const checklist = await GetPatientChecklistQuery(ctx, patientId); // territory-checked
  const completable = checklist.items.filter((item) => item.actions.qr);

  let items: string[];
  if (Array.isArray(body.items)) {
    const requested = new Set(body.items.filter((v): v is string => typeof v === "string"));
    for (const key of requested) {
      if (!completable.some((item) => item.key === key)) throw new ValidationError(`"${key}" can't be completed by the patient`);
    }
    items = completable.filter((item) => requested.has(item.key)).map((item) => item.key);
  } else if (typeof body.kind === "string") {
    const key = LEGACY_KIND_ITEMS[body.kind];
    if (!key || !completable.some((item) => item.key === key)) throw new ValidationError(`kind must be "medical_history" or "stop_bang"`);
    items = [key];
  } else {
    // "partial" = the patient's part is in (STOP-Bang awaiting the clinician's B-A-N-G) — not theirs to redo.
    items = completable.filter((item) => item.status === "missing" || item.status === "pending_patient").map((item) => item.key);
  }
  if (items.length === 0) throw new ValidationError("Nothing left for the patient to complete");

  await cancelPendingQuestionnaireRequests(ctx.client, patientId, items);
  const token = generateToken();
  const request = await insertQuestionnaireRequest(ctx.client, {
    patient_id: patientId,
    items,
    token_hash: hashToken(token),
    expires_at: new Date(Date.now() + QUESTIONNAIRE_LINK_TTL_MS),
    created_by: ctx.user.id,
  });

  await insertAuditLog(ctx.client, {
    user_id: ctx.user.id,
    action: "create",
    entity_type: "QuestionnaireRequest",
    entity_id: request.id,
    entity_after: { patient_id: patientId, items, expires_at: request.expires_at.toISOString() },
    request_id: ctx.requestId,
  });

  // Token in the #fragment: browsers never send it to any server (not the
  // PWA host's access log, not analytics, not a Referer header).
  return { request, url: `${frontendOrigin}/q#${token}` };
}

/** "maria.lopez@example.mx" → "m***@example.mx" — enough for staff to recognise the address, nothing more in logs or toasts. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  return domain ? `${local.slice(0, 1)}***@${domain}` : "***";
}

/** Email language from the patient's own settings: Polish, Mexican Spanish, else by region, else English. */
function patientEmailLocale(language: string | null, region: string | null): string {
  const lang = (language ?? "").toLowerCase();
  if (lang.startsWith("pl")) return "pl";
  if (lang.startsWith("es") || lang === "mx") return "mx";
  const reg = (region ?? "").toUpperCase();
  if (reg === "PL") return "pl";
  if (reg === "MX") return "mx";
  return "en";
}

/**
 * "Send questionnaires by email" on the patient (Łukasz, 2026-09-26): one
 * personal link covering every questionnaire the patient can still fill —
 * the same link a QR code carries (CreateQuestionnaireRequestCommand with
 * no items), emailed instead of shown. Runs inside the tenant transaction:
 * if the email can't be sent, the request is rolled back rather than left
 * as a link nobody received. The audit row names the recipient masked and
 * holds no health data.
 */
export async function SendQuestionnaireEmailCommand(
  ctx: TenantContext,
  patientId: string,
  frontendOrigin: string
): Promise<{ request: CreatedQuestionnaireRequest["request"]; sent_to: string }> {
  const created = await CreateQuestionnaireRequestCommand(ctx, patientId, {}, frontendOrigin); // territory-checked
  const context = await getPatientPdfContext(ctx.client, patientId, ctx.user.id);
  if (!context) throw new NotFoundError("Patient", patientId);
  const email = context.patient_email?.trim();
  if (!email) throw new PatientHasNoEmailError();

  const sent = await sendQuestionnaireLinkEmail(
    email,
    created.url,
    {
      title: context.patient_salutation,
      firstName: context.patient_first_name,
      lastName: context.patient_last_name,
      language: patientEmailLocale(context.patient_language, context.patient_region),
      region: context.patient_region,
    },
    { name: context.organization_name, email: context.organization_email },
    created.request.items.length
  );
  if (!sent) throw new QuestionnaireEmailUnavailableError();

  const sentTo = maskEmail(email);
  await insertAuditLog(ctx.client, {
    user_id: ctx.user.id,
    action: "notify",
    entity_type: "QuestionnaireRequest",
    entity_id: created.request.id,
    entity_after: { patient_id: patientId, channel: "email", sent_to: sentTo, items: created.request.items.length },
    request_id: ctx.requestId,
  });
  return { request: created.request, sent_to: sentTo };
}

export async function CancelQuestionnaireRequestCommand(ctx: TenantContext, patientId: string, requestId: string): Promise<void> {
  await GetPatientChecklistQuery(ctx, patientId); // territory check
  const cancelled = await cancelQuestionnaireRequest(ctx.client, requestId, patientId);
  if (!cancelled) throw new NotFoundError("QuestionnaireRequest", requestId);

  await insertAuditLog(ctx.client, {
    user_id: ctx.user.id,
    action: "update",
    entity_type: "QuestionnaireRequest",
    entity_id: requestId,
    entity_after: { status: "cancelled" },
    request_id: ctx.requestId,
  });
}

// ---------------------------------------------------------------------------
// Public (no session) — called from routes/public.ts
// ---------------------------------------------------------------------------

/** Runs `fn` in its own tenant transaction — the public route supplies withTenant. */
export type PublicRunner = <T>(fn: (client: PoolClient) => Promise<T>) => Promise<T>;

export interface PublicStep {
  key: string;
  type: PublicStepType;
  done: boolean;
  /** Manifest label — the page prefers its own i18n title for known keys. */
  label: string;
  /** Consent steps: the document text to read before signing (sanitized, legal params filled), or null if not authored yet. */
  consent_html?: string | null;
}

export interface PublicQuestionnaire {
  patient_first_name: string;
  clinic_name: string | null;
  /** Where the patient exercises data rights — the clinic, as controller. */
  clinic_email: string | null;
  privacy_notice_url: string;
  expires_at: Date;
  steps: PublicStep[];
}

function validTokenShape(token: string): boolean {
  // base64url of 32 bytes = 43 chars; reject anything else before touching the DB.
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

async function stepTypes(): Promise<Map<string, PublicStepType>> {
  const config = await withPlatform((client) => listPatientChecklistConfig(client));
  const types = new Map<string, PublicStepType>();
  for (const row of config) {
    if (row.fill_mode === "consent") types.set(row.template_key, "consent");
  }
  types.set("medicalHistory", "medical_history");
  types.set("stopBang", "stop_bang");
  return types;
}

/** The patient's page language when the document exists in it; otherwise Mexican Spanish, otherwise the document's first language. */
function documentLocale(templateKey: string, preferred: unknown): string {
  const locales = (DOCUMENT_MANIFEST.find((m) => m.templateKey === templateKey)?.locales ?? []) as readonly string[];
  if (typeof preferred === "string" && locales.includes(preferred)) return preferred;
  return locales.includes("mx") ? "mx" : (locales[0] ?? "mx");
}

async function consentText(templateKey: string, locale: string): Promise<{ html: string; versionId: string } | null> {
  try {
    const version = await GetCurrentDocumentContentQuery(templateKey, locale);
    let html = fillContentForLocale(version.content_html, locale);
    // The informed consent names NeoSleep's partner manufacturers right after its body — same sentence as the PDF (informedConsent.html).
    if (templateKey === "informedConsent") html += `<p>${documentT(locale, "documents.informedConsent.manufacturers")}</p>`;
    return { html: sanitizeDocumentContentHtml(html), versionId: version.id };
  } catch (err) {
    if (err instanceof NotFoundError) return null;
    throw err;
  }
}

/** What the page may show: first name and clinic only — the link could be scanned by someone other than the patient. */
export async function GetPublicQuestionnaireQuery(client: PoolClient, token: string, locale?: unknown): Promise<PublicQuestionnaire> {
  if (!validTokenShape(token)) throw new QuestionnaireLinkInvalidError();
  const request = await getUsableQuestionnaireRequestByHash(client, hashToken(token), { forUpdate: false });
  if (!request) throw new QuestionnaireLinkInvalidError();
  const context = await getPatientPdfContext(client, request.patient_id);
  if (!context) throw new QuestionnaireLinkInvalidError();

  const types = await stepTypes();
  const steps: PublicStep[] = [];
  for (const key of request.items) {
    const type = types.get(key);
    if (!type) continue; // no longer patient-completable (admin changed the config) — skip rather than strand the patient
    const step: PublicStep = {
      key,
      type,
      done: request.completed_items.includes(key),
      label: DOCUMENT_MANIFEST.find((m) => m.templateKey === key)?.label ?? key,
    };
    if (type === "consent" && !step.done) step.consent_html = (await consentText(key, documentLocale(key, locale)))?.html ?? null;
    steps.push(step);
  }

  return {
    patient_first_name: context.patient_first_name,
    clinic_name: context.organization_name,
    clinic_email: context.organization_email,
    privacy_notice_url: PRIVACY_NOTICE_URL,
    expires_at: request.expires_at,
    steps,
  };
}

export interface PublicSubmissionMeta {
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
}

export interface PublicStepResult {
  step: string;
  /** True once every step of the link is done (the link is now dead). */
  completed: boolean;
}

async function lockOpenStep(client: PoolClient, token: string, step: string): Promise<QuestionnaireRequest> {
  const request = await getUsableQuestionnaireRequestByHash(client, hashToken(token), { forUpdate: true });
  if (!request || !request.items.includes(step) || request.completed_items.includes(step)) throw new QuestionnaireLinkInvalidError();
  return request;
}

/**
 * One step per call. Questionnaire steps are a single transaction (lock the
 * request row, validate, insert with source='patient' + the health-data
 * consent stamp, mark the step, audit). The consent step signs a PDF:
 * (1) lock + validate + prepare, (2) render with the drawn signature and
 * upload — no DB connection held during the slow render, (3) re-lock,
 * record file + consent + audit, mark the step; if (3) can't happen (a
 * concurrent sign of the same link won, or the write failed) the upload is
 * deleted again. A step that's already done answers 410 like a dead link.
 */
export async function SubmitPublicQuestionnaireCommand(
  run: PublicRunner,
  token: string,
  body: Record<string, unknown>,
  meta: PublicSubmissionMeta
): Promise<PublicStepResult> {
  if (!validTokenShape(token)) throw new QuestionnaireLinkInvalidError();
  const step = typeof body.step === "string" ? body.step : "";
  const types = await stepTypes();
  const type = types.get(step);

  if (type === "medical_history" || type === "stop_bang") {
    return run(async (client) => {
      const request = await lockOpenStep(client, token, step);
      if (body.consent !== true) throw new ValidationError("Consent is required");
      const answers = (body.answers ?? {}) as Record<string, unknown>;
      if (typeof answers !== "object" || Array.isArray(answers)) throw new ValidationError("answers must be an object");

      const recordMeta = {
        patient_id: request.patient_id,
        source: "patient" as const,
        recorded_by: null,
        request_id: request.id,
        consent: { accepted_at: new Date(), version: PATIENT_CONSENT_VERSION },
      };
      // STOP-Bang via QR: the patient answers only S-T-O-P — B-A-N-G is the
      // doctor's to complete, whatever the body contains.
      const record =
        type === "medical_history"
          ? await insertMedicalHistory(client, recordMeta, validateMedicalHistory(answers, { requireAll: true }))
          : await insertStopBang(client, recordMeta, validateStop(answers), {
              bmi_over_35: null,
              age_over_50: null,
              neck_circumference_over_40cm: null,
              is_male: null,
            });
      const updated = await completeQuestionnaireStep(client, request.id, step);

      await insertAuditLog(client, {
        user_id: null,
        action: "create",
        entity_type: type === "medical_history" ? "MedicalHistoryQuestionnaire" : "StopBangScreening",
        entity_id: record.id,
        entity_after: { patient_id: request.patient_id, source: "patient", questionnaire_request_id: request.id },
        legal_basis: "consent",
        user_ip: meta.ip,
        user_agent: meta.userAgent,
        request_id: meta.requestId,
        metadata: { actor: "patient", consent_version: PATIENT_CONSENT_VERSION },
      });
      return { step, completed: updated.used_at !== null };
    });
  }

  if (type !== "consent") throw new QuestionnaireLinkInvalidError();

  const signature = body.signatureDataUrl;
  if (typeof signature !== "string" || signature.length > MAX_SIGNATURE_DATA_URL_LENGTH || !SIGNATURE_DATA_URL_RE.test(signature)) {
    throw new ValidationError("A drawn signature (PNG) is required");
  }
  const locale = documentLocale(step, body.locale);

  // (1) lock + validate + prepare
  const prepared = await run(async (client) => {
    const request = await lockOpenStep(client, token, step);
    const context = await getPatientPdfContext(client, request.patient_id, request.created_by); // no linked doctor → the doctor who sent the link
    if (!context) throw new QuestionnaireLinkInvalidError();
    const version = await GetCurrentDocumentContentQuery(step, locale); // NotFound until an admin authors it
    return { patientId: request.patient_id, context, version };
  });

  // (2) render with the signature + upload, no DB connection held
  const signedAt = new Date();
  const html = renderDocumentHtml(step, locale, prepared.version.content_html);
  const pdfBytes = await renderHtmlToPdf(html, {
    footerTemplate: renderDocumentFooterHtml(getDocumentRefCode(step), locale, patientDocumentFooter(prepared.context, locale)),
    marginBottom: "18mm",
    dataFields: {
      nombre_paciente: prepared.context.patient_name,
      fecha_nacimiento: formatBirthDate(prepared.context.patient_birth_date, locale),
      nombre_medico: prepared.context.practitioner_name ?? "",
      nombre_clinica: prepared.context.organization_name ?? "",
      lugar: prepared.context.organization_name ?? "",
      fecha: formatFormDate(signedAt, locale),
    },
    dataImages: { firma_paciente: signature },
  });
  const uploaded = await uploadPartnerDocument(
    `patient/${prepared.patientId}/consent-${step}-${signedAt.getTime()}.pdf`,
    pdfBytes,
    "application/pdf"
  );

  // (3) re-lock, record, mark the step — or undo the upload
  try {
    return await run(async (client) => {
      const request = await lockOpenStep(client, token, step);
      const attachment = await insertFileAttachment(client, {
        entity_type: "patient",
        entity_id: request.patient_id,
        url: uploaded.path,
        storage_provider: "supabase",
        bucket: uploaded.bucket,
        path: uploaded.path,
        filename: `${step}-${signedAt.toISOString().slice(0, 10)}.pdf`,
        mime_type: "application/pdf",
        size_bytes: pdfBytes.byteLength,
        is_public: false,
        uploaded_by: null,
        metadata: {
          document_type: step,
          signature_method: "drawn",
          content_version_id: prepared.version.id,
          questionnaire_request_id: request.id,
          locale,
        },
      });
      const consentId = await insertConsent(client, {
        entity_type: "patient",
        entity_id: request.patient_id,
        legal_basis: "consent",
        jurisdiction: locale === "pl" ? "PL" : "MX",
        purpose: step,
        granted_at: signedAt,
        collected_by: null,
        metadata: {
          template_key: step,
          content_version_id: prepared.version.id,
          file_attachment_id: attachment.id,
          questionnaire_request_id: request.id,
          signature_method: "drawn",
          locale,
        },
      });
      const updated = await completeQuestionnaireStep(client, request.id, step);

      await insertAuditLog(client, {
        user_id: null,
        action: "create",
        entity_type: "Consent",
        entity_id: consentId,
        entity_after: { patient_id: request.patient_id, purpose: step, file_attachment_id: attachment.id, source: "patient" },
        legal_basis: "consent",
        user_ip: meta.ip,
        user_agent: meta.userAgent,
        request_id: meta.requestId,
        metadata: { actor: "patient", content_version_id: prepared.version.id, signature_method: "drawn" },
      });
      return { step, completed: updated.used_at !== null };
    });
  } catch (err) {
    await deletePartnerDocument(uploaded.path).catch((cleanupErr: unknown) =>
      console.error(`[questionnaireRequest] could not delete orphaned signed consent ${uploaded.path}:`, cleanupErr)
    );
    throw err;
  }
}
