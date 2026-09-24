import type { PoolClient } from "pg";
import type { TenantContext } from "../context/TenantContext.js";
import { insertAuditLog } from "../db.js";
import {
  insertQuestionnaireRequest,
  cancelPendingQuestionnaireRequests,
  cancelQuestionnaireRequest,
  getUsableQuestionnaireRequestByHash,
  markQuestionnaireRequestUsed,
  type QuestionnaireRequest,
} from "../db/questionnaireRequest.js";
import { insertMedicalHistory, insertStopBang } from "../db/clinicalRecords.js";
import { getPatientPdfContext } from "../db/patientPdfContext.js";
import { GetPatientByIdQuery } from "../queries/patient.js";
import { hashToken } from "../utils/hashToken.js";
import { generateToken } from "../utils/generateToken.js";
import { AppError, NotFoundError, ValidationError } from "../errors.js";
import {
  isPatientFillableKind,
  validateMedicalHistory,
  validateStop,
  type PatientFillableKind,
} from "./clinicalRecordFields.js";

/**
 * COMMANDS — patient self-fill via QR (migration 030, ADR-023).
 *
 * The patient has no account: a staff user creates a questionnaire_request
 * and shows its link as a QR code; the patient's phone opens a public page
 * (apps/pwa /q#<token>) that reads and submits through routes/public.ts. The
 * token is the only credential, so it is single-use, expires after 24h,
 * and is stored only as a SHA-256 hash.
 */

export const QUESTIONNAIRE_LINK_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Bumped whenever the consent wording shown on the self-fill page changes
 * (packages/i18n app.questionnaire.consent) — stored on every
 * patient-submitted record, so it's always known which text was accepted.
 */
export const PATIENT_CONSENT_VERSION = "patient-self-fill-v1";

/** Unknown, used, cancelled and expired links all look identical from outside — no signal about which tokens ever existed. */
export class QuestionnaireLinkInvalidError extends AppError {
  constructor() {
    super("This link is no longer valid", "LINK_INVALID", 410);
  }
}

export interface CreatedQuestionnaireRequest {
  request: QuestionnaireRequest;
  /** Shown once (QR + copy link) and never stored — "show QR again" issues a fresh link. */
  url: string;
}

export async function CreateQuestionnaireRequestCommand(
  ctx: TenantContext,
  patientId: string,
  kind: unknown,
  frontendOrigin: string
): Promise<CreatedQuestionnaireRequest> {
  if (!isPatientFillableKind(kind)) throw new ValidationError(`kind must be "medical_history" or "stop_bang"`);
  const patient = await GetPatientByIdQuery(ctx, patientId);
  if (!patient) throw new NotFoundError("Patient", patientId);

  await cancelPendingQuestionnaireRequests(ctx.client, patientId, kind);
  const token = generateToken();
  const request = await insertQuestionnaireRequest(ctx.client, {
    patient_id: patientId,
    kind,
    token_hash: hashToken(token),
    expires_at: new Date(Date.now() + QUESTIONNAIRE_LINK_TTL_MS),
    created_by: ctx.user.id,
  });

  await insertAuditLog(ctx.client, {
    user_id: ctx.user.id,
    action: "create",
    entity_type: "QuestionnaireRequest",
    entity_id: request.id,
    entity_after: { patient_id: patientId, kind, expires_at: request.expires_at.toISOString() },
    request_id: ctx.requestId,
  });

  // Token in the #fragment: browsers never send it to any server (not the
  // PWA host's access log, not analytics, not a Referer header).
  return { request, url: `${frontendOrigin}/q#${token}` };
}

export async function CancelQuestionnaireRequestCommand(ctx: TenantContext, patientId: string, requestId: string): Promise<void> {
  const patient = await GetPatientByIdQuery(ctx, patientId);
  if (!patient) throw new NotFoundError("Patient", patientId);
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
// Public (no session) — called from routes/public.ts with a raw PoolClient
// ---------------------------------------------------------------------------

export interface PublicQuestionnaire {
  kind: PatientFillableKind;
  patient_first_name: string;
  clinic_name: string | null;
  expires_at: Date;
}

function validTokenShape(token: string): boolean {
  // base64url of 32 bytes = 43 chars; reject anything else before touching the DB.
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

/** What the self-fill page may show: first name and clinic only — the link could be scanned by someone other than the patient. */
export async function GetPublicQuestionnaireQuery(client: PoolClient, token: string): Promise<PublicQuestionnaire> {
  if (!validTokenShape(token)) throw new QuestionnaireLinkInvalidError();
  const request = await getUsableQuestionnaireRequestByHash(client, hashToken(token), { forUpdate: false });
  if (!request) throw new QuestionnaireLinkInvalidError();
  const context = await getPatientPdfContext(client, request.patient_id);
  if (!context) throw new QuestionnaireLinkInvalidError();
  return {
    kind: request.kind,
    patient_first_name: context.patient_first_name,
    clinic_name: context.organization_name,
    expires_at: request.expires_at,
  };
}

export interface PublicSubmissionMeta {
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
}

/**
 * One transaction (the caller's withTenant): lock the request row, validate,
 * insert the record as source='patient' with the consent stamp, burn the
 * token, audit. A second submit of the same link — concurrent or later —
 * finds it used and gets the same 410 as any invalid link.
 */
export async function SubmitPublicQuestionnaireCommand(
  client: PoolClient,
  token: string,
  body: Record<string, unknown>,
  meta: PublicSubmissionMeta
): Promise<{ kind: PatientFillableKind }> {
  if (!validTokenShape(token)) throw new QuestionnaireLinkInvalidError();
  const request = await getUsableQuestionnaireRequestByHash(client, hashToken(token), { forUpdate: true });
  if (!request) throw new QuestionnaireLinkInvalidError();

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
    request.kind === "medical_history"
      ? await insertMedicalHistory(client, recordMeta, validateMedicalHistory(answers, { requireAll: true }))
      : await insertStopBang(client, recordMeta, validateStop(answers), {
          bmi_over_35: null,
          age_over_50: null,
          neck_circumference_over_40cm: null,
          is_male: null,
        });

  await markQuestionnaireRequestUsed(client, request.id);

  await insertAuditLog(client, {
    user_id: null,
    action: "create",
    entity_type: request.kind === "medical_history" ? "MedicalHistoryQuestionnaire" : "StopBangScreening",
    entity_id: record.id,
    entity_after: { patient_id: request.patient_id, source: "patient", questionnaire_request_id: request.id },
    legal_basis: "consent",
    user_ip: meta.ip,
    user_agent: meta.userAgent,
    request_id: meta.requestId,
    metadata: { actor: "patient", consent_version: PATIENT_CONSENT_VERSION },
  });

  return { kind: request.kind };
}
