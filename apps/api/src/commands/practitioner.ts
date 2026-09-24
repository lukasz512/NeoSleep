import crypto from "node:crypto";
import type { TenantContext } from "../context/TenantContext.js";
import {
  insertPractitioner,
  updatePractitioner,
  updatePractitionerStatus,
  getPractitionerById,
  softDeletePractitioner,
  getUserIdByEmail,
  insertStaffUser,
  getCountryTerritoryId,
  createInviteToken,
  invalidateUnusedInviteTokensForUser,
  updateUser,
  type InsertPractitionerInput,
  type UpdatePractitionerInput,
  type Practitioner,
} from "../db.js";
import { insertAuditLog } from "../db.js";
import { ValidationError, ConflictError } from "../errors.js";
import { ConvertLeadCommand } from "./lead.js";
import { inferLanguage } from "./invitePractitioner.js";
import { sendPartnerInviteEmail } from "../mailer.js";
import { FRONTEND_URL } from "../env.js";
import { hashToken } from "../utils/hashToken.js";
import { normalizeNationalIds } from "../utils/nationalIds.js";
import { partnerJurisdictionForRegion, resolvePartnerDocumentSet } from "./partnerDocuments.js";

/**
 * COMMANDS — Practitioner domain.
 *
 * Each command validates, writes, writes audit log, returns result.
 * No req/res. No getDb(). Only ctx.client (tenant-scoped, same transaction).
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------------------------------------------------------------------
// CREATE PRACTITIONER
// ---------------------------------------------------------------------------

export interface CreatePractitionerInput {
  first_name: string;
  last_name: string;
  salutation?: string | null;
  email?: string | null;
  phone?: string | null;
  primary_specialty?: string | null;
  // Legacy alias accepted at command level for backward compat
  specialty?: string | null;
  organization_id?: string | null;
  institution?: string | null;
  region?: string;
  territory_id?: string | null;
  country_code?: string | null;
  influence_tier?: string;
  language?: string | null;
  national_ids?: Record<string, string> | null;
  social_links?: Record<string, unknown> | null;
  /** When set, this practitioner is being created from a lead ("move to doctors") —
   *  the lead is atomically marked converted in the same transaction. */
  lead_id?: string | null;
}

export async function CreatePractitionerCommand(
  ctx: TenantContext,
  input: CreatePractitionerInput
): Promise<Practitioner> {
  const firstName = input.first_name?.trim() ?? "";
  const lastName  = input.last_name?.trim() ?? "";
  if (!firstName) throw new ValidationError("first_name is required");
  if (!lastName)  throw new ValidationError("last_name is required");

  const email = input.email?.trim() ?? "";
  if (!email) throw new ValidationError("email is required");
  if (!EMAIL_REGEX.test(email)) throw new ValidationError("Invalid email format");

  const phone = input.phone?.trim() ?? "";
  if (!phone) throw new ValidationError("phone is required");
  if (phone.replace(/\D/g, "").length < 9) throw new ValidationError("Phone must contain at least 9 digits");

  const insertInput: InsertPractitionerInput = {
    first_name:       firstName,
    last_name:        lastName,
    salutation:       input.salutation ?? null,
    email,
    phone,
    primary_specialty: input.primary_specialty ?? input.specialty ?? null,
    // Preserve the undefined/null distinction: undefined => fall back to
    // resolving `institution` by name (see insertPractitioner); null/id => use directly.
    organization_id:  input.organization_id !== undefined ? input.organization_id : undefined,
    institution:      input.institution ?? null,
    region:           input.region,
    territory_id:     input.territory_id ?? null,
    country_code:     input.country_code ?? null,
    influence_tier:   input.influence_tier,
    language:         input.language ?? null,
    national_ids:     normalizeNationalIds(input.national_ids) ?? null,
    social_links:     input.social_links ?? null,
  };

  const practitioner = await insertPractitioner(ctx.client, insertInput);

  await insertAuditLog(ctx.client, {
    user_id:      ctx.user.id,
    action:       "create",
    entity_type:  "Practitioner",
    entity_id:    practitioner.id,
    entity_after: {
      id:               practitioner.id,
      name:             `${firstName} ${lastName}`,
      primary_specialty: practitioner.primary_specialty,
      region:           practitioner.region,
    },
    request_id: ctx.requestId,
  });

  const leadId = input.lead_id?.trim();
  if (leadId) {
    // Same ctx.client / transaction as the insert above — the practitioner
    // create and the lead conversion commit or roll back together.
    await ConvertLeadCommand(ctx, leadId, {
      converted_to_id:   practitioner.id,
      converted_to_type: "practitioner",
    });
  }

  return practitioner;
}

// ---------------------------------------------------------------------------
// UPDATE PRACTITIONER
// ---------------------------------------------------------------------------

export interface UpdatePractitionerPayload {
  first_name?: string;
  last_name?: string;
  salutation?: string | null;
  email?: string | null;
  phone?: string | null;
  primary_specialty?: string | null;
  specialty?: string | null;
  organization_id?: string | null;
  institution?: string | null;
  region?: string;
  territory_id?: string | null;
  influence_tier?: string;
  language?: string | null;
  national_ids?: Record<string, string> | null;
  social_links?: Record<string, unknown> | null;
  /** Admin-only manual override — see UpdatePractitionerCommand's own check and apps/pwa/src/config/forms/hcpForm.ts's STATUS_OPTIONS for the full rationale. */
  status?: "pending_approval" | "invited" | "active" | "inactive";
}

/**
 * Updates a Practitioner. Returns null if not found.
 */
export async function UpdatePractitionerCommand(
  ctx: TenantContext,
  id: string,
  input: UpdatePractitionerPayload
): Promise<Practitioner | null> {
  if (!id?.trim()) throw new ValidationError("practitioner id is required");

  if (input.email !== undefined) {
    const email = input.email?.trim() ?? "";
    if (!email) throw new ValidationError("email cannot be blank");
    if (!EMAIL_REGEX.test(email)) throw new ValidationError("Invalid email format");
  }

  if (input.phone !== undefined) {
    const phone = input.phone?.trim() ?? "";
    if (!phone) throw new ValidationError("phone cannot be blank");
    if (phone.replace(/\D/g, "").length < 9) throw new ValidationError("Phone must contain at least 9 digits");
  }

  // Manual status override is an admin-only recovery tool (see
  // UpdatePractitionerPayload's own doc comment) — the frontend already
  // hides the field for manager/rep/etc, but the route must not trust that
  // alone (same reasoning as every other server-side RBAC check in this
  // codebase — a hidden form field is a UI nicety, not an authorization
  // boundary).
  if (input.status !== undefined && ctx.user.role !== "admin") {
    throw new ValidationError("Only an admin can change a practitioner's status directly");
  }

  const before = await getPractitionerById(ctx.client, id);
  if (!before) return null;

  const updateInput: UpdatePractitionerInput = {
    first_name:       input.first_name,
    last_name:        input.last_name,
    salutation:       input.salutation,
    email:            input.email,
    phone:            input.phone,
    primary_specialty: input.primary_specialty ?? input.specialty,
    organization_id:  input.organization_id,
    institution:      input.institution,
    region:           input.region,
    territory_id:     input.territory_id,
    influence_tier:   input.influence_tier,
    language:         input.language,
    national_ids:     normalizeNationalIds(input.national_ids),
    social_links:     input.social_links,
    status:           input.status,
  };

  const after = await updatePractitioner(ctx.client, id, updateInput);
  if (!after) return null;

  await insertAuditLog(ctx.client, {
    user_id:       ctx.user.id,
    action:        "update",
    entity_type:   "Practitioner",
    entity_id:     id,
    entity_before: { primary_specialty: before.primary_specialty, region: before.region },
    entity_after:  { primary_specialty: after.primary_specialty,  region: after.region },
    request_id:    ctx.requestId,
  });

  return after;
}

// ---------------------------------------------------------------------------
// DELETE PRACTITIONER (soft delete)
// ---------------------------------------------------------------------------

export async function DeletePractitionerCommand(ctx: TenantContext, id: string): Promise<void> {
  if (!id?.trim()) throw new ValidationError("practitioner id is required");

  await softDeletePractitioner(ctx.client, id);

  await insertAuditLog(ctx.client, {
    user_id:    ctx.user.id,
    action:     "delete",
    entity_type: "Practitioner",
    entity_id:  id,
    request_id: ctx.requestId,
  });
}

// ---------------------------------------------------------------------------
// ACTIVATE / RESEND PRACTITIONER INVITE
// pending_approval|invited -> invited: provisions the linked doctor-role
// user account if this identity doesn't already have one (partner-invited
// practitioners already do, via InvitePractitionerCommand), then (re)sends
// the "set your password" invite email with a freshly minted token. Status
// only becomes "active" once the doctor actually completes registration —
// see AcceptPractitionerInviteCommand in invitePractitioner.ts. This same
// function IS the resend action: calling it again while status is
// "invited" (the doctor hasn't accepted yet) mints a new token, invalidates
// the previous one, and sends another email — see
// docs/stories/practitioner-invite-resend.md for why "active" used to mean
// something else and blocked exactly this.
// ---------------------------------------------------------------------------

const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — see invitePractitioner.ts's own constant/comment for why this is minted here, not at invite time.

export async function ActivatePractitionerCommand(ctx: TenantContext, id: string): Promise<Practitioner | null> {
  if (!id?.trim()) throw new ValidationError("practitioner id is required");

  const practitioner = await getPractitionerById(ctx.client, id);
  if (!practitioner) return null;
  if (practitioner.status === "active" || practitioner.status === "inactive") {
    throw new ConflictError(`Practitioner is already ${practitioner.status}`);
  }
  if (!practitioner.email) throw new ValidationError("Practitioner must have an email address before activation");

  // NEO-51: never send an invite the doctor can't complete — their country's
  // partner documents must exist, have a NeoSleep signatory, and be approved
  // by that signatory. Throws PartnerDocumentsNotReadyError (409) otherwise.
  const jurisdiction = partnerJurisdictionForRegion(practitioner.region);
  if (!jurisdiction) {
    throw new ValidationError("Partner onboarding is only available for practitioners in Poland (PL) or Mexico (MX)");
  }
  await resolvePartnerDocumentSet(ctx.client, jurisdiction);

  // Only provision a login when this identity has no users account yet —
  // a resend (status already "invited") reuses the account created on the
  // first send; a practitioner re-activated after already being a live
  // platform user (e.g. re-training) is already excluded by the status
  // guard above, so reaching here always means "no accepted password yet".
  let userId = await getUserIdByEmail(ctx.client, practitioner.email);
  if (!userId) {
    // Scope the new doctor-role login to their own practice's country when
    // known — falls back to insertStaffUser's own 'global' default (via
    // undefined) when the country hasn't been seeded into the territory
    // hierarchy yet, same fail-open reasoning migration 022 used for
    // unmapped legacy scope values.
    const scopeTerritoryId = practitioner.country_code
      ? await getCountryTerritoryId(ctx.client, practitioner.country_code)
      : undefined;
    const user = await insertStaffUser(
      ctx.client,
      practitioner.email,
      practitioner.first_name,
      practitioner.last_name,
      "doctor",
      null,
      true,
      practitioner.salutation,
      practitioner.phone,
      scopeTerritoryId ?? undefined,
      ctx.user.id,
      practitioner.country_code
    );
    userId = user?.id ?? null;
    // Same as InvitePractitionerCommand's lead path: the login stays
    // 'inactive' until the doctor accepts the invite (AcceptPractitionerInviteCommand
    // sets 'active'), so it can't be used before the documents are signed.
    if (userId) await updateUser(ctx.client, userId, { status: "inactive" });
  }

  if (userId) {
    // At most one live token per user — a resend must not leave the
    // previous email's link silently still valid alongside the new one.
    await invalidateUnusedInviteTokensForUser(ctx.client, userId);

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + INVITE_EXPIRY_MS);
    // Activation is NeoSleep's countersignature moment: this date is printed
    // next to the signatory's signature on the partner agreement. A resend
    // mints a new token, so it also gets a new date.
    await createInviteToken(ctx.client, userId, null, hashToken(token), expiresAt, ctx.user.id, {
      counterparty_signed_at: new Date().toISOString(),
      jurisdiction,
    });

    const registerLink = `${FRONTEND_URL}/partner-register?token=${encodeURIComponent(token)}`;
    await sendPartnerInviteEmail(
      practitioner.email,
      registerLink,
      {
        title: practitioner.salutation,
        firstName: practitioner.first_name,
        lastName: practitioner.last_name,
        language: inferLanguage(practitioner.region),
        region: practitioner.region,
      },
      { name: ctx.user.name ?? "NeoSleep", email: ctx.user.email }
    );

    await updatePractitionerStatus(ctx.client, id, "invited");
  }

  const after = await getPractitionerById(ctx.client, id);

  await insertAuditLog(ctx.client, {
    user_id:       ctx.user.id,
    action:        "activate",
    entity_type:   "Practitioner",
    entity_id:     id,
    entity_before: { status: practitioner.status },
    entity_after:  { status: after?.status ?? "invited" },
    request_id:    ctx.requestId,
  });

  return after;
}
