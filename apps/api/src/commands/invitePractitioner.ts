import crypto from "node:crypto";
import bcrypt from "bcrypt";
import type { PoolClient } from "pg";
import { isValidLicenseNumber, licenseNumberKey, normalizeLicenseNumber, renderDocumentHtml } from "@neo/documents";
import type { TenantContext } from "../context/TenantContext.js";
import {
  getLeadById,
  insertStaffUser,
  getCountryTerritoryId,
  insertPractitioner,
  updateUser,
  getUserById,
  setUserPassword,
  mergeIdentityMetadataForUser,
  getInviteTokenByHash,
  markInviteTokenUsed,
  getPractitionerIdByIdentityId,
  getPractitionerById,
  getOrganizationById,
  getOrganizationAffiliations,
  setAffiliationRole,
  updatePractitioner,
  updatePractitionerStatus,
  convertLead,
  insertConsent,
  insertFileAttachment,
  insertAuditLog,
} from "../db.js";
import type { Organization } from "../db/organization.js";
import {
  ConflictError,
  NotFoundError,
  PartnerDocumentsNotReadyError,
  StaleDocumentVersionError,
  ValidationError,
} from "../errors.js";
import { hashToken } from "../utils/hashToken.js";
import { normalizeNationalIds } from "../utils/nationalIds.js";
import { sendPartnerJoinThankYouEmail } from "../mailer.js";
import { uploadPartnerDocument } from "../services/partnerDocuments.js";
import { renderHtmlToPdf } from "../services/documentRenderer.js";
import type { PartnerJurisdiction } from "../db/partnerSignatories.js";
import {
  buildAgreementDocument,
  buildNoticeDocument,
  formatDocumentDate,
  loadSignatoryPngDataUrl,
  partnerJurisdictionForRegion,
  resolvePartnerDocumentSet,
  type PracticeRole,
} from "./partnerDocuments.js";

/**
 * COMMANDS — partner/practitioner invite flow.
 *
 * "Doctor" is a display label for this tenant's `lead.type`/`users.role`
 * vocabulary, not a code-level concept — the FHIR-aligned entity being
 * created here is a Practitioner (+ a `users` account so they can log in).
 * Named accordingly so this reads the same regardless of which white-label
 * tenant's terminology is in play.
 *
 * InvitePractitionerCommand runs authenticated (admin/manager inviting a
 * doctor-type Lead) and follows the usual TenantContext pattern. It creates
 * BOTH a `users` row (login) and a `practitioner` row (HCP tab) on the same
 * identity — insertStaffUser and insertPractitioner both upsert `identities`
 * by email, so passing the same email links them to one identity_id
 * automatically, no explicit linking column needed.
 *
 * AcceptPractitionerInviteCommand runs UNAUTHENTICATED (the invitee has no
 * session yet) — same shape auth.ts's forgot-password/reset-password flow
 * uses: a plain function over a tenant-scoped PoolClient, no
 * TenantContext/ctx.user. Audit rows use the doctor's own new user_id as the
 * actor, since they are acting on their own account.
 */

const BCRYPT_ROUNDS = 12;

export function inferLanguage(region: string | null | undefined): string {
  const r = (region || "").toUpperCase();
  if (r === "PL") return "pl";
  if (r === "MX") return "mx";
  return "en";
}

/** Best-effort single display line from Organization's structured address columns — the
 * invite form still collects/edits clinic address as one free-text field (see
 * AcceptInviteInput.billingAddress), so a pre-filled value needs flattening. */
function formatOrganizationAddress(org: Pick<Organization, "address_line1" | "city" | "state" | "postal_code">): string | null {
  const parts = [org.address_line1, org.city, org.state, org.postal_code].map((p) => p?.trim()).filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

/** organization.identifiers is a free-form {nip, regon, rfc, ...} bag (see 001_tenant_schema.sql) —
 * no writer in the app populates it today, so this is almost always null; kept narrow to the two
 * tax-ID shapes this tenant's markets actually use (PL NIP, MX RFC). */
function extractTaxId(identifiers: Record<string, string> | null): string | null {
  return identifiers?.nip || identifiers?.rfc || null;
}

// ---------------------------------------------------------------------------
// INVITE PRACTITIONER (from a doctor-type Lead) — authenticated, admin/manager
// ---------------------------------------------------------------------------

export interface InvitePractitionerInput {
  /** Staff gets a chance to correct these before the invite email goes out — same "verify before converting" pattern as moveToContacts/CreatePractitionerCommand. Falls back to the Lead's own data when omitted. */
  first_name?: string;
  last_name?: string;
  email?: string;
  /** Licence number (PL pwz / MX cedula) — falls back to the lead's own
   *  metadata.pwz/cedula (leadForm.ts) when not sent (NEO-51). */
  national_ids?: Record<string, string>;
}

export async function InvitePractitionerCommand(
  ctx: TenantContext,
  leadId: string,
  /** Resolved by the route from the request (see utils/frontendOrigin.ts) — commands
   * don't have req/res, so this can't be resolved here; the caller must pass it in. */
  frontendOrigin: string,
  input: InvitePractitionerInput = {}
): Promise<void> {
  if (!leadId?.trim()) throw new ValidationError("lead id is required");

  const lead = await getLeadById(ctx.client, leadId);
  if (!lead) throw new NotFoundError("Lead", leadId);
  if (lead.type !== "doctor") throw new ValidationError("Only doctor-type leads can be invited to register");
  if (lead.status === "converted") throw new ConflictError("Lead is already converted");

  const firstName = input.first_name?.trim() || lead.first_name;
  const lastName = input.last_name?.trim() || lead.last_name;
  const email = input.email?.trim() || lead.email;
  if (!email) throw new ValidationError("An email address is required");
  if (!lead.phone) throw new ValidationError("A phone number is required — add it to the lead before inviting");

  const leadLicense: Record<string, string> = {};
  for (const key of ["pwz", "cedula"] as const) {
    const v = lead.metadata?.[key];
    if (typeof v === "string" && v.trim()) leadLicense[key] = v;
  }
  const nationalIds = normalizeNationalIds({ ...leadLicense, ...(input.national_ids ?? {}) });

  // Doctors are per-country by definition (they practice in one market) — scope
  // the new "doctor" role to the lead's own country_code, not global. Falls
  // back to insertStaffUser's own 'global' default only if the lead is
  // missing country_code (legacy data) or that country isn't seeded into the
  // territory hierarchy yet — a data-quality gap upstream, not a reason to
  // block the invite.
  const scopeTerritoryId = lead.country_code
    ? await getCountryTerritoryId(ctx.client, lead.country_code)
    : undefined;
  const user = await insertStaffUser(
    ctx.client,
    email,
    firstName,
    lastName,
    "doctor",
    null,
    true,
    lead.salutation,
    lead.phone,
    scopeTerritoryId ?? undefined,
    ctx.user.id,
    lead.country_code
  );
  if (!user) throw new ConflictError("A user with this email already exists");

  // insertStaffUser defaults new rows to status='active' — force 'inactive'
  // until the invite is accepted (no password is set yet either, but this
  // also blocks any other login path, e.g. Google OAuth, in the meantime).
  await updateUser(ctx.client, user.id, { status: "inactive" });

  // Same identity, second role: also create (or link to) the practitioner
  // record so this person shows up in the HCP tab immediately, not only
  // after they accept the invite. insertPractitioner upserts `identities` by
  // email (same email as above) and no-ops if a practitioner row already
  // exists for that identity — see ADR-012 follow-up notes.
  await insertPractitioner(ctx.client, {
    first_name: firstName,
    last_name: lastName,
    email,
    phone: lead.phone,
    salutation: lead.salutation,
    region: lead.region,
    country_code: lead.country_code,
    institution: lead.institution ?? undefined,
    national_ids: nationalIds && Object.keys(nationalIds).length > 0 ? nationalIds : null,
  });

  // The actual "set your password" registration email (with its 7-day-expiry
  // token) is deliberately NOT sent here — it's deferred to
  // ActivatePractitionerCommand ("training/capacitation finished" — see
  // commands/practitioner.ts), since capacitation can easily take longer
  // than 7 days and a token minted now would expire unused. This is just a
  // holding "thank you for joining" email.
  await sendPartnerJoinThankYouEmail(
    email,
    {
      title: lead.salutation,
      firstName,
      lastName,
      language: inferLanguage(lead.region),
      region: lead.region,
    },
    { name: ctx.user.name ?? "NeoSleep", email: ctx.user.email }
  );

  await insertAuditLog(ctx.client, {
    user_id: ctx.user.id,
    action: "invite",
    entity_type: "Person",
    entity_id: user.id,
    entity_after: { lead_id: leadId, email, role: "doctor" },
    request_id: ctx.requestId,
  });
}

// ---------------------------------------------------------------------------
// VALIDATE INVITE TOKEN — public
// ---------------------------------------------------------------------------

export interface InvitePreview {
  email: string;
  firstName: string | null;
  lastName: string | null;
  /** Pre-fill for the registration form's clinic-details review step — all nullable, since it
   * depends on a rep/KAM having already created a proper HCO record linked to this practitioner
   * (practitioner.organization_id). Absent that, the invitee sees empty, still-editable fields. */
  clinicName: string | null;
  clinicEmail: string | null;
  clinicPhone: string | null;
  clinicAddress: string | null;
  taxId: string | null;
  /** NEO-51 — which country's documents apply (PL / MX). */
  jurisdiction: PartnerJurisdiction | null;
  /** PL PWZ / MX cédula already on file, for the doctor to confirm. */
  licenseNumber: string | null;
  /** Default for the "I own this practice / I work here" choice — the saved affiliation role, else derived from the clinic type. */
  practiceRole: PracticeRole;
  /** Current approved document versions the doctor will sign, or null if the documents aren't ready (activation normally prevents that). */
  documents: { agreementVersionId: string; dpaVersionId: string; noticeVersionId: string } | null;
}

/** "practice" (private practice) → the doctor runs it; clinic/hospital/other → they practise there. */
function defaultPracticeRole(organizationType: string | null | undefined): PracticeRole {
  return organizationType === "practice" ? "owner" : "staff";
}

function inviteJurisdiction(
  invite: { metadata: { jurisdiction?: PartnerJurisdiction } | null },
  region: string | null | undefined,
): PartnerJurisdiction | null {
  return invite.metadata?.jurisdiction ?? partnerJurisdictionForRegion(region);
}

async function loadInviteParty(client: PoolClient, identityId: string) {
  const practitionerId = await getPractitionerIdByIdentityId(client, identityId);
  const practitioner = practitionerId ? await getPractitionerById(client, practitionerId) : null;
  const organization = practitioner?.organization_id
    ? await getOrganizationById(client, practitioner.organization_id)
    : null;
  const affiliation =
    practitioner && organization
      ? (await getOrganizationAffiliations(client, practitioner.id)).find((a) => a.organization_id === organization.id)
      : undefined;
  return { practitioner, organization, affiliationRole: affiliation?.role ?? null };
}

export async function ValidateInviteTokenQuery(client: PoolClient, token: string): Promise<InvitePreview | null> {
  const tokenStr = token?.trim();
  if (!tokenStr) return null;
  const invite = await getInviteTokenByHash(client, hashToken(tokenStr));
  if (!invite) return null;

  const { practitioner, organization, affiliationRole } = await loadInviteParty(client, invite.identity_id);
  const jurisdiction = inviteJurisdiction(invite, practitioner?.region);

  let documents: InvitePreview["documents"] = null;
  if (jurisdiction) {
    try {
      const set = await resolvePartnerDocumentSet(client, jurisdiction);
      documents = { agreementVersionId: set.agreement.id, dpaVersionId: set.dpa.id, noticeVersionId: set.notice.id };
    } catch (err) {
      if (!(err instanceof PartnerDocumentsNotReadyError)) throw err;
    }
  }

  const licenseKey = jurisdiction ? licenseNumberKey(jurisdiction) : null;
  return {
    email: invite.email,
    firstName: invite.first_name,
    lastName: invite.last_name,
    clinicName: organization?.name ?? null,
    clinicEmail: organization?.email ?? null,
    clinicPhone: organization?.phone ?? null,
    clinicAddress: organization ? formatOrganizationAddress(organization) : null,
    taxId: organization ? extractTaxId(organization.identifiers) : null,
    jurisdiction,
    licenseNumber: licenseKey ? (practitioner?.national_ids?.[licenseKey] ?? null) : null,
    practiceRole:
      affiliationRole === "owner" || affiliationRole === "staff"
        ? affiliationRole
        : defaultPracticeRole(organization?.type),
    documents,
  };
}

// ---------------------------------------------------------------------------
// DOCUMENT PREVIEW — public, token-gated (NEO-51)
// ---------------------------------------------------------------------------

export type PartnerDocumentKind = "agreement" | "notice";

export interface PartnerDocumentPreview {
  /** Rendered template HTML, ready for applyDocumentFields. */
  html: string;
  /** Server-known fields: NeoSleep's signatory name + countersignature date (agreement only). */
  dataFields: Record<string, string>;
  /** The signatory's signature PNG as a data URL (agreement only) — only ever sent through this token-gated response. */
  imageFields: Record<string, string>;
  versionIds: string[];
  /** Human version shown in the signing intent statement — "agreement.dpa" for the agreement (e.g. "1.1"), the notice's own number otherwise. */
  versionLabel: string;
}

/**
 * What the doctor reads before signing. Party fields (name, licence number,
 * clinic, role variant) are deliberately NOT filled here — the PWA fills them
 * from the doctor's current, possibly just-edited form values with the same
 * applyDocumentFields the PDF renderer uses, so the preview always matches
 * what Finish will produce.
 */
export async function GetPartnerDocumentPreviewQuery(
  client: PoolClient,
  token: string,
  kind: PartnerDocumentKind,
): Promise<PartnerDocumentPreview | null> {
  const tokenStr = token?.trim();
  if (!tokenStr) return null;
  const invite = await getInviteTokenByHash(client, hashToken(tokenStr));
  if (!invite) return null;

  const { practitioner } = await loadInviteParty(client, invite.identity_id);
  const jurisdiction = inviteJurisdiction(invite, practitioner?.region);
  if (!jurisdiction) throw new PartnerDocumentsNotReadyError("No partner jurisdiction for this invitation");
  const set = await resolvePartnerDocumentSet(client, jurisdiction);

  if (kind === "notice") {
    return {
      html: renderDocumentHtml("partnerPrivacyNotice", set.locale, set.notice.content_html),
      dataFields: {},
      imageFields: {},
      versionIds: [set.notice.id],
      versionLabel: String(set.notice.version_number),
    };
  }

  const counterpartySignedAt = invite.metadata?.counterparty_signed_at
    ? new Date(invite.metadata.counterparty_signed_at)
    : new Date();
  return {
    html: renderDocumentHtml("partnerAgreement", set.locale, set.agreement.content_html, { annex: set.dpa.content_html }),
    dataFields: {
      counterparty_name: set.signatory.printedName,
      counterparty_signed_at: formatDocumentDate(counterpartySignedAt, set.locale),
    },
    imageFields: { counterparty_signature: await loadSignatoryPngDataUrl(set.signatory) },
    versionIds: [set.agreement.id, set.dpa.id],
    versionLabel: `${set.agreement.version_number}.${set.dpa.version_number}`,
  };
}

// ---------------------------------------------------------------------------
// ACCEPT INVITE — public (unauthenticated invitee completing registration)
// ---------------------------------------------------------------------------

export interface AcceptInviteInput {
  token: string;
  password: string;
  clinicName: string;
  clinicEmail: string;
  clinicPhone: string;
  /** Required when the doctor owns the practice (it's printed in the party clause); optional for staff. */
  taxId: string;
  billingAddress: string;
  /** PL PWZ / MX cédula — validated for the invite's jurisdiction. */
  licenseNumber: string;
  /** "owner" | "staff" — anything else is rejected. */
  practiceRole: string;
  /** "data:image/png;base64,...." from SignaturePad.vue — the doctor's signature on the agreement + Annex 1. */
  agreementSignatureDataUrl: string;
  /** Version ids the doctor actually read and signed (from the preview) — must still be current + approved. */
  agreementVersionId: string;
  dpaVersionId: string;
  noticeVersionId: string;
  noticeAcknowledged: boolean;
}

export interface AcceptInviteRequestMeta {
  requestId: string;
  ip: string | null;
  userAgent: string | null;
}

/** One generated PDF ready to email, alongside what's already been uploaded to storage. */
export interface SignedDocumentResult {
  type: "partner_agreement" | "privacy_notice";
  filename: string;
  bytes: Uint8Array;
}

export interface AcceptInviteResult {
  userId: string;
  email: string;
  locale: string;
  /** For the formal "Dr First Last," address line of the signed-documents email. */
  title: string | null;
  firstName: string | null;
  lastName: string | null;
  region: string | null;
  /** NeoSleep's copy of the documents goes here (per-jurisdiction signatory config). */
  ccEmail: string;
  documents: SignedDocumentResult[];
}

const SIGNATURE_DATA_URL_RE = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;

function sha256Hex(bytes: Uint8Array): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

export async function AcceptPractitionerInviteCommand(
  client: PoolClient,
  input: AcceptInviteInput,
  meta: AcceptInviteRequestMeta
): Promise<AcceptInviteResult> {
  const tokenStr = input.token?.trim();
  if (!tokenStr) throw new ValidationError("Invitation token is required");
  if (!input.password || input.password.length < 8) throw new ValidationError("Password must be at least 8 characters");
  if (!input.clinicName?.trim()) throw new ValidationError("Clinic name is required");
  if (!input.clinicEmail?.trim()) throw new ValidationError("Clinic email is required");
  if (!input.clinicPhone?.trim()) throw new ValidationError("Clinic phone is required");
  if (!input.billingAddress?.trim()) throw new ValidationError("Billing address is required");
  if (input.practiceRole !== "owner" && input.practiceRole !== "staff") {
    throw new ValidationError("Choose whether you own the practice or work there");
  }
  const practiceRole: PracticeRole = input.practiceRole;
  if (practiceRole === "owner" && !input.taxId?.trim()) throw new ValidationError("Tax ID is required");
  if (!input.agreementSignatureDataUrl || !SIGNATURE_DATA_URL_RE.test(input.agreementSignatureDataUrl)) {
    throw new ValidationError("A handwritten signature on the partner agreement is required");
  }
  if (!input.noticeAcknowledged) throw new ValidationError("Please confirm you have read the privacy notice");

  const invite = await getInviteTokenByHash(client, hashToken(tokenStr));
  if (!invite) throw new ValidationError("Invalid or expired invitation link. Ask staff to send a new one.");

  const user = await getUserById(client, invite.user_id);
  if (!user) throw new NotFoundError("User", invite.user_id);

  const { practitioner, organization } = await loadInviteParty(client, invite.identity_id);
  const jurisdiction = inviteJurisdiction(invite, practitioner?.region ?? user.region);
  if (!jurisdiction) throw new PartnerDocumentsNotReadyError("No partner jurisdiction for this invitation");

  if (!isValidLicenseNumber(jurisdiction, input.licenseNumber ?? "")) {
    throw new ValidationError(jurisdiction === "PL" ? "Invalid PWZ licence number" : "Invalid cédula profesional");
  }
  const licenseNumber =
    jurisdiction === "PL" ? input.licenseNumber.replace(/\s/g, "") : normalizeLicenseNumber(input.licenseNumber);

  // The doctor must have signed exactly the texts that are current + approved
  // right now — if an admin published a newer version while the form was
  // open, make them re-read rather than silently signing text they never saw.
  const set = await resolvePartnerDocumentSet(client, jurisdiction);
  if (
    input.agreementVersionId !== set.agreement.id ||
    input.dpaVersionId !== set.dpa.id ||
    input.noticeVersionId !== set.notice.id
  ) {
    throw new StaleDocumentVersionError();
  }

  const signerName = `${invite.first_name ?? ""} ${invite.last_name ?? ""}`.trim() || invite.email;
  const signedAt = new Date();
  const counterpartySignedAt = invite.metadata?.counterparty_signed_at
    ? new Date(invite.metadata.counterparty_signed_at)
    : signedAt;
  const signedAtLabel = formatDocumentDate(signedAt, set.locale);

  // 1. Render both PDFs BEFORE any write — a rendering failure then leaves
  // nothing half-done (no activated account without its signed documents).
  const agreementDoc = await buildAgreementDocument(
    set,
    {
      doctorName: signerName,
      licenseNumber,
      clinicName: input.clinicName.trim(),
      taxId: input.taxId?.trim() ?? "",
      clinicAddress: input.billingAddress.trim(),
      email: invite.email,
      practiceRole,
    },
    { counterpartySignedAt, signerSignedAt: signedAtLabel },
    input.agreementSignatureDataUrl,
  );
  const noticeDoc = buildNoticeDocument(set, signerName, signedAtLabel);
  // 22mm bottom margin: the shared 3-line contact footer is taller than the
  // renderer's 14mm default, and body text would otherwise run into it.
  const agreementPdf = await renderHtmlToPdf(agreementDoc.html, {
    footerTemplate: agreementDoc.footerHtml,
    marginBottom: "22mm",
    dataFields: agreementDoc.dataFields,
    imageFields: agreementDoc.imageFields,
    variant: agreementDoc.variant,
  });
  const noticePdf = await renderHtmlToPdf(noticeDoc.html, {
    footerTemplate: noticeDoc.footerHtml,
    marginBottom: "22mm",
    dataFields: noticeDoc.dataFields,
  });

  // 2. Password + activate the account.
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  await setUserPassword(client, user.id, passwordHash, false);
  await updateUser(client, user.id, { status: "active" });

  // 2b. This is the real "doctor accepted" moment — practitioner.status
  // only becomes "active" here, not when staff clicked Activate/Resend
  // (see ActivatePractitionerCommand in commands/practitioner.ts and
  // docs/stories/practitioner-invite-resend.md).
  if (practitioner) {
    await updatePractitionerStatus(client, practitioner.id, "active");

    // Licence number the doctor confirmed/entered — merged into national_ids
    // (other keys untouched), audited when it changed.
    const key = licenseNumberKey(jurisdiction);
    const previous = practitioner.national_ids?.[key] ?? null;
    if (previous !== licenseNumber) {
      await updatePractitioner(client, practitioner.id, {
        national_ids: { ...(practitioner.national_ids ?? {}), [key]: licenseNumber },
      });
      await insertAuditLog(client, {
        user_id: user.id,
        action: "update_license_number",
        entity_type: "Practitioner",
        entity_id: practitioner.id,
        entity_before: { [key]: previous },
        entity_after: { [key]: licenseNumber },
        user_ip: meta.ip,
        user_agent: meta.userAgent,
        request_id: meta.requestId,
      });
    }

    // Owner vs staff — selects the party clause; stored on the affiliation.
    if (organization) {
      await setAffiliationRole(client, practitioner.id, organization.id, practiceRole);
    }
  }

  // 3. Clinic / invoice data — no dedicated columns, lives in identities.metadata.
  // If a linked organization record already had these fields (pre-filled for review on the
  // form), log what the doctor actually changed — this is data reviewed right before a legal
  // signature, so a "what did they correct" trail matters. Deliberately NOT written back to the
  // shared `organization` row here (see docs/stories/partner-registration-legal-documents.md,
  // 2026-09-16 addendum) — that's a separate follow-up, not this slice.
  const submittedClinicDetails = {
    clinic_name: input.clinicName.trim(),
    clinic_email: input.clinicEmail.trim(),
    clinic_phone: input.clinicPhone.trim(),
    tax_id: input.taxId?.trim() ?? "",
    billing_address: input.billingAddress.trim(),
  };

  if (organization) {
    const before = {
      clinic_name: organization.name,
      clinic_email: organization.email,
      clinic_phone: organization.phone,
      tax_id: extractTaxId(organization.identifiers),
      billing_address: formatOrganizationAddress(organization),
    };
    const changed = (Object.keys(submittedClinicDetails) as (keyof typeof submittedClinicDetails)[]).some(
      (key) => (before[key] ?? "") !== submittedClinicDetails[key]
    );
    if (changed) {
      await insertAuditLog(client, {
        user_id: user.id,
        action: "edit_clinic_details",
        entity_type: "Organization",
        entity_id: organization.id,
        entity_before: before,
        entity_after: submittedClinicDetails,
        user_ip: meta.ip,
        user_agent: meta.userAgent,
        request_id: meta.requestId,
      });
    }
  }

  await mergeIdentityMetadataForUser(client, user.id, submittedClinicDetails);

  // 4. Store both documents with the evidence bundle the /legal review asked
  // for: exact version ids, a hash of the signed file, both dates, the
  // jurisdiction, the invite token (id, never the raw token) and the
  // request's IP/UA (audit_log). `signature_method: 'drawn'` stays a value,
  // not an enum, so a qualified e-signature provider can be added later.
  const evidence = {
    jurisdiction,
    signatory: set.signatory.printedName,
    counterparty_signed_at: counterpartySignedAt.toISOString(),
    signer_signed_at: signedAt.toISOString(),
    invite_token_id: invite.id,
    practice_role: practiceRole,
  };

  const agreementSha = sha256Hex(agreementPdf);
  const noticeSha = sha256Hex(noticePdf);
  const stamp = signedAt.getTime();
  const documents: {
    type: SignedDocumentResult["type"];
    filename: string;
    bytes: Uint8Array;
    sha256: string;
    versions: Record<string, string>;
  }[] = [
    {
      type: "partner_agreement",
      filename: "NeoSleep-partner-agreement.pdf",
      bytes: agreementPdf,
      sha256: agreementSha,
      versions: { partnerAgreement: set.agreement.id, partnerDpa: set.dpa.id },
    },
    {
      type: "privacy_notice",
      filename: "NeoSleep-privacy-notice.pdf",
      bytes: noticePdf,
      sha256: noticeSha,
      versions: { partnerPrivacyNotice: set.notice.id },
    },
  ];

  for (const doc of documents) {
    const uploaded = await uploadPartnerDocument(`partner/${user.id}/${doc.type}-${stamp}.pdf`, doc.bytes, "application/pdf");
    await insertFileAttachment(client, {
      entity_type: "user",
      entity_id: user.id,
      url: uploaded.path,
      storage_provider: "supabase",
      bucket: uploaded.bucket,
      path: uploaded.path,
      filename: doc.filename,
      mime_type: "application/pdf",
      size_bytes: doc.bytes.byteLength,
      is_public: false,
      metadata: {
        document_type: doc.type,
        signature_method: doc.type === "partner_agreement" ? "drawn" : "acknowledged",
        content_version_ids: doc.versions,
        sha256: doc.sha256,
        ...evidence,
      },
    });
  }

  // The agreement is a contract (GDPR art. 6(1)(b)), not a consent — see
  // the story's /legal round 3. The privacy notice is informational: it gets
  // an acknowledgement audit row, never a consent row.
  await insertConsent(client, {
    entity_type: "user",
    entity_id: user.id,
    legal_basis: "contract",
    jurisdiction,
    purpose: "partner_agreement_dpa",
    granted_at: signedAt,
    metadata: {
      content_version_ids: documents[0]!.versions,
      sha256: agreementSha,
      ...evidence,
    },
  });

  await insertAuditLog(client, {
    user_id: user.id,
    action: "sign",
    entity_type: "SignedDocument",
    entity_id: user.id,
    entity_after: { document_type: "partner_agreement", sha256: agreementSha, ...documents[0]!.versions },
    user_ip: meta.ip,
    user_agent: meta.userAgent,
    request_id: meta.requestId,
  });
  await insertAuditLog(client, {
    user_id: user.id,
    action: "acknowledge_privacy_notice",
    entity_type: "SignedDocument",
    entity_id: user.id,
    entity_after: { document_type: "privacy_notice", sha256: noticeSha, ...documents[1]!.versions },
    user_ip: meta.ip,
    user_agent: meta.userAgent,
    request_id: meta.requestId,
  });

  // 5. Consume the token.
  await markInviteTokenUsed(client, invite.id);

  // 6. Convert the originating Lead, if any.
  if (invite.lead_id) {
    await convertLead(client, invite.lead_id, { converted_to_id: user.id, converted_to_type: "user" });
  }

  await insertAuditLog(client, {
    user_id: user.id,
    action: "accept_invite",
    entity_type: "Person",
    entity_id: user.id,
    user_ip: meta.ip,
    user_agent: meta.userAgent,
    request_id: meta.requestId,
  });

  return {
    userId: user.id,
    email: invite.email,
    locale: set.locale,
    title: practitioner?.salutation ?? null,
    firstName: invite.first_name ?? practitioner?.first_name ?? null,
    lastName: invite.last_name ?? practitioner?.last_name ?? null,
    region: practitioner?.region ?? user.region ?? null,
    ccEmail: set.signatory.ccEmail,
    documents: documents.map(({ type, filename, bytes }) => ({ type, filename, bytes })),
  };
}
