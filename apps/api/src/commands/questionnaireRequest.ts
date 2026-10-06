import type { PoolClient } from "pg";
import type { TenantContext } from "../context/TenantContext.js";
import { insertAuditLog, insertFileAttachment, getPatientById, getPractitionerById } from "../db.js";
import { notify } from "../notifications/notify.js";
import {
  insertQuestionnaireRequest,
  cancelPendingQuestionnaireRequests,
  cancelQuestionnaireRequest,
  purgeDeadQuestionnaireRequests,
  getUsableQuestionnaireRequestByHash,
  completeQuestionnaireStep,
  markQuestionnaireRequestOpened,
  getQuestionnaireRequestForPatient,
  type QuestionnaireRequest,
} from "../db/questionnaireRequest.js";
import { insertMedicalHistory, insertStopBang } from "../db/clinicalRecords.js";
import { insertConsent } from "../db/consent.js";
import { getPatientPdfContext, formatBirthDate, patientDocumentFooter } from "../db/patientPdfContext.js";
import { formatFormDate } from "../utils/formDate.js";
import { withPlatform } from "../db/tenant.js";
import { listPatientChecklistConfig } from "../db/documentTemplateEntityType.js";
import { GetPatientChecklistQuery } from "../queries/patientChecklist.js";
import { requirePatientInScope } from "../queries/entityAccess.js";
import { GetCurrentDocumentContentQuery } from "../queries/documentContent.js";
import { sanitizeDocumentContentHtml } from "./documentContent.js";
import { renderDocumentHtml, renderDocumentFooterHtml, getDocumentRefCode, fillContentForLocale, documentT, DOCUMENT_MANIFEST } from "@neo/documents";
import { renderHtmlToPdf } from "../services/documentRenderer.js";
import { uploadPartnerDocument, deletePartnerDocument, type UploadedDocument } from "../services/partnerDocuments.js";
import { hashToken } from "../utils/hashToken.js";
import { generateToken } from "../utils/generateToken.js";
import { AppError, NotFoundError, ValidationError } from "../errors.js";
import { sendQuestionnaireLinkEmail, sendPatientSignedCopyEmail, sendEmailSentConfirmation } from "../mailer.js";
import { isPatientEmailHeldByAnother } from "../db/identityEmail.js";
import { insertPatientEmailSend } from "../db/patientEmailSend.js";
import { maskEmail } from "../utils/maskEmail.js";
import { patientEmailLocale } from "../utils/patientEmailLocale.js";
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
/** An emailed link lives longer: patients often read the email days later (NEO-162, D2). */
export const QUESTIONNAIRE_EMAIL_LINK_TTL_DAYS = 7;
/** Dead links are deleted this many days after they expire (purgeDeadQuestionnaireRequests). */
export const QUESTIONNAIRE_LINK_RETENTION_DAYS = 30;

/**
 * Bumped whenever the health-data notice/consent wording shown before a
 * questionnaire changes (packages/i18n app.questionnaire.consentNotice.* /
 * app.questionnaire.consent) — stored on every patient-submitted record.
 */
export const PATIENT_CONSENT_VERSION = "patient-self-fill-2026-09-26";

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
  frontendOrigin: string,
  ttlMs: number = QUESTIONNAIRE_LINK_TTL_MS
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

  await cancelPendingQuestionnaireRequests(ctx.client, patientId);
  await purgeDeadQuestionnaireRequests(ctx.client, QUESTIONNAIRE_LINK_RETENTION_DAYS);
  const token = generateToken();
  const request = await insertQuestionnaireRequest(ctx.client, {
    patient_id: patientId,
    items,
    token_hash: hashToken(token),
    expires_at: new Date(Date.now() + ttlMs),
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

export { maskEmail };


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
  frontendOrigin: string,
  body: { items?: unknown; copy_to_me?: unknown } = {}
): Promise<{ request: CreatedQuestionnaireRequest["request"]; sent_to: string; url: string }> {
  // NEO-192: the doctor picks the items in the send dialog; none picked = everything still open.
  const created = await CreateQuestionnaireRequestCommand(
    ctx,
    patientId,
    Array.isArray(body.items) ? { items: body.items } : {},
    frontendOrigin,
    QUESTIONNAIRE_EMAIL_LINK_TTL_DAYS * 24 * 60 * 60 * 1000
  ); // territory-checked
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
    created.request.items.length,
    { tenant: ctx.slug, kind: "questionnaire_link" },
    QUESTIONNAIRE_EMAIL_LINK_TTL_DAYS
  );
  if (!sent) throw new QuestionnaireEmailUnavailableError();

  const sentTo = maskEmail(email);
  // What Resend later reports about this email (delivered, bounced, spam) lands on this row — NEO-190.
  await insertPatientEmailSend(ctx.client, {
    patientId,
    sentBy: ctx.user.id,
    kind: "questionnaire_link",
    questionnaireRequestId: created.request.id,
    sentToMasked: sentTo,
    providerMessageId: sent,
  });
  await insertAuditLog(ctx.client, {
    user_id: ctx.user.id,
    action: "notify",
    entity_type: "QuestionnaireRequest",
    entity_id: created.request.id,
    entity_after: { patient_id: patientId, channel: "email", sent_to: sentTo, items: created.request.items.length },
    request_id: ctx.requestId,
  });

  // D4: the doctor's own confirmation — who, how many, when; never the patient's link.
  if (body.copy_to_me === true && ctx.user.email) {
    await sendEmailSentConfirmation(ctx.user.email, {
      patient: shortPatientName(context.patient_first_name, context.patient_last_name),
      sentTo,
      count: created.request.items.length,
      clinic: context.organization_name,
      language: patientEmailLocale(context.patient_language, context.patient_region),
    }).catch((err: unknown) => console.error("[questionnaireRequest] send confirmation email failed:", err));
  }
  return { request: created.request, sent_to: sentTo, url: created.url };
}

/** "Lucía C." — enough for the doctor to recognise the patient, no full name in an inbox. */
function shortPatientName(first: string | null, last: string | null): string {
  const initial = last?.trim().charAt(0);
  return [first?.trim(), initial ? `${initial}.` : null].filter(Boolean).join(" ") || "—";
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

export type QuestionnaireRequestStatusView = Pick<
  QuestionnaireRequest,
  "id" | "status" | "items" | "completed_items" | "opened_at" | "expires_at"
>;

/**
 * Just the state of one link — polled every 2 s by the open QR dialog so it
 * can close as soon as the patient opens the link (NEO-117). A plain row
 * lookup behind the territory guard: no checklist build, no health data, so
 * no audit_log 'read' row per poll.
 */
export async function GetQuestionnaireRequestStatusQuery(
  ctx: TenantContext,
  patientId: string,
  requestId: string
): Promise<QuestionnaireRequestStatusView> {
  await requirePatientInScope(ctx, patientId);
  const request = await getQuestionnaireRequestForPatient(ctx.client, requestId, patientId);
  if (!request) throw new NotFoundError("QuestionnaireRequest", requestId);
  const { id, status, items, completed_items, opened_at, expires_at } = request;
  return { id, status, items, completed_items, opened_at, expires_at };
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
  /**
   * "Child K." — first name + last-name initial, next to the signature pad
   * ("You are signing as …", NEO-126). Only while a consent is still to be
   * signed. Never the full name (legal, 2026-09-28): whoever holds the link
   * would learn that this named person is a patient here; the full name is
   * in the signed PDF only.
   */
  signer_name: string | null;
  /**
   * Masked address ("j***@gmail.com") the patient may ask the signed copy to
   * be emailed to — only while a consent is open, and only when the address
   * is the patient's alone (not on another identity, e.g. a family inbox).
   */
  copy_email: string | null;
  clinic_name: string | null;
  /** Where the patient exercises data rights — the clinic, as controller. */
  clinic_email: string | null;
  clinic_phone: string | null;
  privacy_notice_url: string;
  /**
   * The aviso de privacidad the patient accepts before signing a consent
   * (CORE-113, consent-visit-r1 Z3): the clinic's own when it set one —
   * the clinic is the data controller — else the platform notice above.
   */
  clinic_privacy_notice_url: string;
  /** true = clinic_privacy_notice_url is the clinic's own aviso. */
  clinic_privacy_notice_own: boolean;
  /** The platform's public site (the privacy notice's origin) — linked from the patient's menu. */
  website_url: string;
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

/** "Child Kowalski" → "Child K." — who is signing, without the surname. */
function signerDisplayName(firstName: string, lastName: string): string {
  const initial = lastName.trim().charAt(0).toUpperCase();
  return initial ? `${firstName.trim()} ${initial}.` : firstName.trim();
}

/** The patient's own address for the signed copy, or null (none on file, or shared with another identity). */
async function signedCopyAddress(client: PoolClient, patientId: string, email: string | null): Promise<string | null> {
  const address = email?.trim();
  if (!address) return null;
  return (await isPatientEmailHeldByAnother(client, patientId, address)) ? null : address;
}

/**
 * What the page may show: first name and clinic — the link could be scanned
 * by someone other than the patient. While a consent is still to be signed it
 * also gets "First L." for the signature line and the masked address the
 * signed copy can be emailed to (NEO-126).
 */
export async function GetPublicQuestionnaireQuery(client: PoolClient, token: string, locale?: unknown): Promise<PublicQuestionnaire> {
  if (!validTokenShape(token)) throw new QuestionnaireLinkInvalidError();
  const request = await getUsableQuestionnaireRequestByHash(client, hashToken(token), { forUpdate: false });
  if (!request) throw new QuestionnaireLinkInvalidError();
  const context = await getPatientPdfContext(client, request.patient_id);
  if (!context) throw new QuestionnaireLinkInvalidError();
  // The doctor's QR dialog closes on this (NEO-110).
  await markQuestionnaireRequestOpened(client, request.id);

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

  const consentOpen = steps.some((s) => s.type === "consent" && !s.done);
  const copyAddress = consentOpen ? await signedCopyAddress(client, request.patient_id, context.patient_email) : null;
  return {
    patient_first_name: context.patient_first_name,
    signer_name: consentOpen ? signerDisplayName(context.patient_first_name, context.patient_last_name) : null,
    copy_email: copyAddress ? maskEmail(copyAddress) : null,
    clinic_name: context.organization_name,
    clinic_email: context.organization_email,
    clinic_phone: context.organization_phone,
    privacy_notice_url: PRIVACY_NOTICE_URL,
    clinic_privacy_notice_url: context.organization_privacy_notice_url ?? PRIVACY_NOTICE_URL,
    clinic_privacy_notice_own: context.organization_privacy_notice_url !== null,
    website_url: new URL(PRIVACY_NOTICE_URL).origin,
    expires_at: request.expires_at,
    steps,
  };
}

/**
 * The patient's page says "opened" as soon as its HTML arrives, before the
 * app bundle has loaded (NEO-123) — about 1.5 s earlier than the lookup, so
 * the doctor's QR dialog can close sooner. Silent on purpose: an invalid,
 * used or expired token does nothing and reveals nothing (the route always
 * answers 204). The lookup stamps opened_at too, so a blocked ping costs
 * nothing but speed.
 */
export async function MarkPublicQuestionnaireOpenedCommand(client: PoolClient, token: string): Promise<void> {
  if (!validTokenShape(token)) return;
  const request = await getUsableQuestionnaireRequestByHash(client, hashToken(token), { forUpdate: false });
  if (request) await markQuestionnaireRequestOpened(client, request.id);
}

export interface PublicSubmissionMeta {
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
  /** Tenant of the link — tags the signed-copy email so its delivery status finds its row (NEO-190). */
  tenantSlug?: string;
}

export interface PublicStepResult {
  step: string;
  /** True once every step of the link is done (the link is now dead). */
  completed: boolean;
  /**
   * Consent steps: the signed PDF, handed back once to the person who just
   * signed it (NEO-126 "download a copy") — the bytes are already in memory,
   * so no second endpoint has to accept the (soon dead) token again.
   */
  signed_copy?: { filename: string; signed_at: string; pdf_base64: string };
  /** The patient ticked "email me a copy" and it was handed to the mail provider. */
  copy_emailed?: boolean;
}

async function lockOpenStep(client: PoolClient, token: string, step: string): Promise<QuestionnaireRequest> {
  const request = await getUsableQuestionnaireRequestByHash(client, hashToken(token), { forUpdate: true });
  if (!request || !request.items.includes(step) || request.completed_items.includes(step)) throw new QuestionnaireLinkInvalidError();
  return request;
}

/**
 * NEO-195: tells the patient's own doctor a questionnaire step came back —
 * PHI-free (no patient name, no answers), one notify() call per submitted
 * step, in the same transaction as the step's own write so a rolled-back
 * submit never notifies anyone. No linked doctor (patient.practitioner_id
 * null) → nothing to notify, silently.
 */
async function notifyPatientsDoctorOfSubmission(client: PoolClient, patientId: string, requestId: string): Promise<void> {
  const patient = await getPatientById(client, patientId);
  if (!patient?.practitioner_id) return;
  const practitioner = await getPractitionerById(client, patient.practitioner_id);
  if (!practitioner) return;
  await notify(client, {
    type: "questionnaire_submitted",
    recipients: [practitioner.identity_id],
    entityId: requestId,
    link: { patientId },
  });
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
      await notifyPatientsDoctorOfSubmission(client, request.patient_id, request.id);
      return { step, completed: updated.used_at !== null };
    });
  }

  if (type !== "consent") throw new QuestionnaireLinkInvalidError();

  const signature = body.signatureDataUrl;
  if (typeof signature !== "string" || signature.length > MAX_SIGNATURE_DATA_URL_LENGTH || !SIGNATURE_DATA_URL_RE.test(signature)) {
    throw new ValidationError("A drawn signature (PNG) is required");
  }
  const locale = documentLocale(step, body.locale);
  // The page unlocks "sign" only after the document was scrolled to its end;
  // recorded as evidence of an informed consent, never trusted for anything else.
  const readToEnd = body.readToEnd === true;
  // "Email me a copy" — ticked by the patient before signing (their own Art. 15 request), in the same tap.
  const sendCopy = body.sendCopy === true;
  // CORE-113 (Z3): the patient confirms reading the clinic's aviso de privacidad before signing; stored with the signature.
  if (body.privacyNoticeAccepted !== true) {
    throw new ValidationError("Accept the privacy notice before signing", "privacyNoticeAccepted");
  }

  // (1) lock + validate + prepare
  const prepared = await run(async (client) => {
    const request = await lockOpenStep(client, token, step);
    const context = await getPatientPdfContext(client, request.patient_id, request.created_by); // no linked doctor → the doctor who sent the link
    if (!context) throw new QuestionnaireLinkInvalidError();
    const version = await GetCurrentDocumentContentQuery(step, locale); // NotFound until an admin authors it
    const copyAddress = sendCopy ? await signedCopyAddress(client, request.patient_id, context.patient_email) : null;
    return { patientId: request.patient_id, requestId: request.id, context, version, copyAddress };
  });

  // (2) render with the signature + upload, no DB connection held
  const signedAt = new Date();
  const filename = `${step}-${signedAt.toISOString().slice(0, 10)}.pdf`;
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
  // The drawn signature on its own too, so later prints (the Historia clínica's consent page, NEO-252) can show it.
  let signatureUpload: UploadedDocument;
  try {
    signatureUpload = await uploadPartnerDocument(
      `patient/${prepared.patientId}/consent-${step}-${signedAt.getTime()}-signature.png`,
      Buffer.from(signature.slice(signature.indexOf(",") + 1), "base64"),
      "image/png"
    );
  } catch (err) {
    await deletePartnerDocument(uploaded.path).catch(() => undefined);
    throw err;
  }

  // (3) re-lock, record, mark the step — or undo the upload
  let result: PublicStepResult;
  try {
    result = await run(async (client) => {
      const request = await lockOpenStep(client, token, step);
      const attachment = await insertFileAttachment(client, {
        entity_type: "patient",
        entity_id: request.patient_id,
        url: uploaded.path,
        storage_provider: "supabase",
        bucket: uploaded.bucket,
        path: uploaded.path,
        filename,
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
          signature_path: signatureUpload.path,
          questionnaire_request_id: request.id,
          signature_method: "drawn",
          read_to_end: readToEnd,
          locale,
          privacy_notice: {
            url: prepared.context.organization_privacy_notice_url ?? PRIVACY_NOTICE_URL,
            own: prepared.context.organization_privacy_notice_url !== null,
            accepted_at: signedAt.toISOString(),
          },
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
        metadata: { actor: "patient", content_version_id: prepared.version.id, signature_method: "drawn", read_to_end: readToEnd },
      });
      await notifyPatientsDoctorOfSubmission(client, request.patient_id, request.id);
      return {
        step,
        completed: updated.used_at !== null,
        signed_copy: {
          filename,
          signed_at: signedAt.toISOString(),
          pdf_base64: Buffer.from(pdfBytes).toString("base64"),
        },
      };
    });
  } catch (err) {
    for (const path of [uploaded.path, signatureUpload.path]) {
      await deletePartnerDocument(path).catch((cleanupErr: unknown) =>
        console.error(`[questionnaireRequest] could not delete orphaned signed consent ${path}:`, cleanupErr)
      );
    }
    throw err;
  }

  // (4) the copy the patient asked for — after the commit, so a mail failure never undoes a signature.
  if (sendCopy && prepared.copyAddress) {
    result.copy_emailed = await emailSignedCopy(run, prepared, { filename, pdfBytes, signedAt, locale }, meta);
  }
  return result;
}

/**
 * Emails the signed PDF to the patient who asked for it. A neutral subject
 * and one sentence, the PDF attached — no treatment or diagnosis in the text
 * (legal, 2026-09-28). The audit row records the masked recipient; failures
 * are logged and reported to the page as "not sent", never thrown.
 */
async function emailSignedCopy(
  run: PublicRunner,
  prepared: { patientId: string; requestId: string; context: NonNullable<Awaited<ReturnType<typeof getPatientPdfContext>>>; copyAddress: string | null },
  doc: { filename: string; pdfBytes: Uint8Array; signedAt: Date; locale: string },
  meta: PublicSubmissionMeta
): Promise<boolean> {
  const address = prepared.copyAddress;
  if (!address) return false;
  const { context } = prepared;
  try {
    const sent = await sendPatientSignedCopyEmail(
      address,
      {
        title: context.patient_salutation,
        firstName: context.patient_first_name,
        lastName: context.patient_last_name,
        language: patientEmailLocale(context.patient_language, context.patient_region),
        region: context.patient_region,
      },
      { name: context.organization_name, email: context.organization_email },
      { filename: doc.filename, content: Buffer.from(doc.pdfBytes) },
      formatFormDate(doc.signedAt, doc.locale),
      meta.tenantSlug ? { tenant: meta.tenantSlug, kind: "signed_copy" } : undefined
    );
    if (!sent) return false;
    await run(async (client) => {
      await insertPatientEmailSend(client, {
        patientId: prepared.patientId,
        sentBy: null,
        kind: "signed_copy",
        questionnaireRequestId: prepared.requestId,
        sentToMasked: maskEmail(address),
        providerMessageId: sent,
      });
      await insertAuditLog(client, {
        user_id: null,
        action: "notify",
        entity_type: "QuestionnaireRequest",
        entity_id: prepared.requestId,
        entity_after: { patient_id: prepared.patientId, channel: "email", sent_to: maskEmail(address), document: doc.filename },
        legal_basis: "consent",
        user_ip: meta.ip,
        user_agent: meta.userAgent,
        request_id: meta.requestId,
        metadata: { actor: "patient", purpose: "signed_copy" },
      });
    });
    return true;
  } catch (err) {
    console.error("[questionnaireRequest] signed copy email failed:", err);
    return false;
  }
}
