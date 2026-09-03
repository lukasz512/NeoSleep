import bcrypt from "bcrypt";
import type { PoolClient } from "pg";
import { emailT } from "@neo/email";
import type { TenantContext } from "../context/TenantContext.js";
import {
  getLeadById,
  insertStaffUser,
  insertPractitioner,
  updateUser,
  getUserById,
  setUserPassword,
  mergeIdentityMetadataForUser,
  getInviteTokenByHash,
  markInviteTokenUsed,
  convertLead,
  insertConsent,
  insertFileAttachment,
  insertAuditLog,
} from "../db.js";
import { ConflictError, NotFoundError, ValidationError } from "../errors.js";
import { hashToken } from "../utils/hashToken.js";
import { sendPartnerJoinThankYouEmail } from "../mailer.js";
import { renderSignedDocumentPdf, uploadPartnerDocument } from "../services/partnerDocuments.js";

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

function inferJurisdiction(region: string | null | undefined): string {
  const r = (region || "").toUpperCase();
  if (r === "MX") return "MX";
  return "EU";
}

// ---------------------------------------------------------------------------
// INVITE PRACTITIONER (from a doctor-type Lead) — authenticated, admin/manager
// ---------------------------------------------------------------------------

export interface InvitePractitionerInput {
  /** Staff gets a chance to correct these before the invite email goes out — same "verify before converting" pattern as moveToContacts/CreatePractitionerCommand. Falls back to the Lead's own data when omitted. */
  first_name?: string;
  last_name?: string;
  email?: string;
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

  // Doctors are per-country by definition (they practice in one market) — scope
  // the new "doctor" role to the lead's own country_code, not 'global'. Falls
  // back to 'global' only if the lead is missing country_code (legacy data);
  // that's a data-quality gap upstream, not a reason to block the invite.
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
    lead.country_code ?? "global",
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
}

export async function ValidateInviteTokenQuery(client: PoolClient, token: string): Promise<InvitePreview | null> {
  const tokenStr = token?.trim();
  if (!tokenStr) return null;
  const invite = await getInviteTokenByHash(client, hashToken(tokenStr));
  if (!invite) return null;
  return { email: invite.email, firstName: invite.first_name, lastName: invite.last_name };
}

// ---------------------------------------------------------------------------
// ACCEPT INVITE — public (unauthenticated invitee completing registration)
// ---------------------------------------------------------------------------

export interface AcceptInviteInput {
  token: string;
  password: string;
  clinicName: string;
  taxId: string;
  billingAddress: string;
  gdprAccepted: boolean;
  agreementAccepted: boolean;
  /** "data:image/png;base64,...." from SignaturePad.vue. */
  signatureDataUrl: string;
}

export interface AcceptInviteRequestMeta {
  requestId: string;
  ip: string | null;
  userAgent: string | null;
}

const SIGNATURE_DATA_URL_RE = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;

export async function AcceptPractitionerInviteCommand(
  client: PoolClient,
  input: AcceptInviteInput,
  meta: AcceptInviteRequestMeta
): Promise<void> {
  const tokenStr = input.token?.trim();
  if (!tokenStr) throw new ValidationError("Invitation token is required");
  if (!input.password || input.password.length < 8) throw new ValidationError("Password must be at least 8 characters");
  if (!input.clinicName?.trim()) throw new ValidationError("Clinic name is required");
  if (!input.taxId?.trim()) throw new ValidationError("Tax ID is required");
  if (!input.billingAddress?.trim()) throw new ValidationError("Billing address is required");
  if (!input.gdprAccepted) throw new ValidationError("GDPR consent is required");
  if (!input.agreementAccepted) throw new ValidationError("Partner agreement acceptance is required");
  if (!input.signatureDataUrl || !SIGNATURE_DATA_URL_RE.test(input.signatureDataUrl)) {
    throw new ValidationError("A handwritten signature is required");
  }

  const invite = await getInviteTokenByHash(client, hashToken(tokenStr));
  if (!invite) throw new ValidationError("Invalid or expired invitation link. Ask staff to send a new one.");

  const user = await getUserById(client, invite.user_id);
  if (!user) throw new NotFoundError("User", invite.user_id);

  const signerName = `${invite.first_name ?? ""} ${invite.last_name ?? ""}`.trim() || invite.email;
  const locale = inferLanguage(user.region);
  const jurisdiction = inferJurisdiction(user.region);
  const signedAt = new Date();

  // 1. Password + activate the account.
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  await setUserPassword(client, user.id, passwordHash, false);
  await updateUser(client, user.id, { status: "active" });

  // 2. Clinic / invoice data — no dedicated columns, lives in identities.metadata.
  await mergeIdentityMetadataForUser(client, user.id, {
    clinic_name: input.clinicName.trim(),
    tax_id: input.taxId.trim(),
    billing_address: input.billingAddress.trim(),
  });

  // 3. Signed documents — GDPR consent + partner agreement, each a standalone
  // PDF embedding the drawn signature. `signature_method: 'drawn'` is kept in
  // metadata (not hardcoded into a fixed enum) so a future e-sign integration
  // can be added as a second value without a schema change.
  const documents: { type: "gdpr" | "partner_agreement"; titleKey: string; bodyKey: string }[] = [
    { type: "gdpr", titleKey: "documents.gdprConsent.title", bodyKey: "documents.gdprConsent.body" },
    { type: "partner_agreement", titleKey: "documents.partnerAgreement.title", bodyKey: "documents.partnerAgreement.body" },
  ];

  for (const doc of documents) {
    const pdfBytes = await renderSignedDocumentPdf({
      title: emailT(locale, doc.titleKey),
      bodyText: emailT(locale, doc.bodyKey),
      signerName,
      signedAt,
      signatureDataUrl: input.signatureDataUrl,
    });
    const path = `partner/${user.id}/${doc.type}-${signedAt.getTime()}.pdf`;
    const uploaded = await uploadPartnerDocument(path, pdfBytes, "application/pdf");

    await insertFileAttachment(client, {
      entity_type: "user",
      entity_id: user.id,
      url: uploaded.path,
      storage_provider: "supabase",
      bucket: uploaded.bucket,
      path: uploaded.path,
      filename: `${doc.type}.pdf`,
      mime_type: "application/pdf",
      size_bytes: pdfBytes.byteLength,
      is_public: false,
      metadata: { document_type: doc.type, signature_method: "drawn" },
    });

    await insertConsent(client, {
      entity_type: "user",
      entity_id: user.id,
      legal_basis: "consent",
      jurisdiction,
      purpose: doc.type,
      granted_at: signedAt,
    });

    await insertAuditLog(client, {
      user_id: user.id,
      action: "sign",
      entity_type: "SignedDocument",
      entity_id: user.id,
      entity_after: { document_type: doc.type, path: uploaded.path },
      user_ip: meta.ip,
      user_agent: meta.userAgent,
      request_id: meta.requestId,
    });
  }

  // 4. Consume the token.
  await markInviteTokenUsed(client, invite.id);

  // 5. Convert the originating Lead, if any.
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
}
