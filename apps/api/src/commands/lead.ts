import type { TenantContext } from "../context/TenantContext.js";
import {
  insertLead,
  updateLead,
  getLeadById,
  convertLead,
  softDeleteLead,
  type InsertLeadInput,
  type UpdateLeadInput,
  type Lead,
} from "../db.js";
import { insertAuditLog } from "../db.js";
import { ValidationError } from "../errors.js";
import { sendLeadOfferEmail, localeForRegion } from "../mailer.js";

/**
 * COMMANDS — Lead domain.
 *
 * Each command:
 *   1. Validates input
 *   2. Executes the DB write via ctx.client (tenant-scoped, same transaction as audit)
 *   3. Writes to audit_log (GDPR Art. 30 compliance)
 *   4. Returns the result
 *
 * Commands never touch `req` or `res`. Independently testable.
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Matches lead_status_check in the DB exactly — the PWA uses this same vocabulary, no translation. */
const VALID_LEAD_STATUSES = ["new", "contacted", "qualified", "inactive", "converted"];

/** Matches lead_type_check (009_partner_invite_and_documents.sql). Drives the doctor-only "Invite to collaborate" action. */
const VALID_LEAD_TYPES = ["doctor", "hospital", "pharmacy", "patient", "other"];

function normalizeLeadStatus(input: string | undefined): string | undefined {
  if (input === undefined) return undefined;
  const value = input.trim().toLowerCase();
  if (!VALID_LEAD_STATUSES.includes(value)) throw new ValidationError(`Invalid lead status: "${input}"`);
  return value;
}

function normalizeLeadType(input: string | undefined): string | undefined {
  if (input === undefined) return undefined;
  const value = input.trim().toLowerCase();
  if (!VALID_LEAD_TYPES.includes(value)) throw new ValidationError(`Invalid lead type: "${input}"`);
  return value;
}

// ---------------------------------------------------------------------------
// CREATE LEAD
// ---------------------------------------------------------------------------

export interface CreateLeadInput {
  salutation?: string | null;
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;
  status?: string;
  type?: string;
  region?: string;
  source?: string | null;
  institution?: string | null;
  assigned_to?: string | null;
  /**
   * Organization name — no dedicated column, lives at metadata.institution
   * (see the header comment near ConvertLeadCommand: a Lead is deliberately
   * "dirty" data, no live FK to organization until an explicit convert step).
   * The frontend's FormRenderer nests this field under `metadata` itself
   * (see config/forms/leadForm.ts's `nestUnder: "metadata"`), so it already
   * arrives here as `metadata.institution` — required, validated below.
   */
  metadata?: Record<string, unknown> | null;
}

/**
 * Creates a new Lead.
 */
export async function CreateLeadCommand(
  ctx: TenantContext,
  input: CreateLeadInput
): Promise<Lead> {
  const firstName = input.first_name?.trim() ?? "";
  const lastName  = input.last_name?.trim() ?? "";
  if (!firstName) throw new ValidationError("first_name is required");
  if (!lastName)  throw new ValidationError("last_name is required");

  const type = normalizeLeadType(input.type) ?? "other";
  const institution = typeof input.metadata?.institution === "string" ? input.metadata.institution.trim() : "";
  // Only a doctor lead is expected to name a clinic — hospital/pharmacy leads
  // *are* the institution, and a patient lead names a diagnosis instead
  // (see leadForm.ts's isDoctorType()/isPatientType() gating on the frontend).
  if (type === "doctor" && !institution) throw new ValidationError("institution is required for doctor leads");

  const email = input.email?.trim() ?? null;
  if (email && !EMAIL_REGEX.test(email)) throw new ValidationError("Invalid email format");

  const insertInput: InsertLeadInput = {
    salutation:  input.salutation?.trim() || null,
    first_name:  firstName,
    last_name:   lastName,
    email:       email || null,
    phone:       input.phone?.trim() ?? null,
    status:      normalizeLeadStatus(input.status) ?? "new",
    type,
    region:      input.region?.trim() ?? "",
    source:      input.source?.trim() ?? null,
    institution: input.institution?.trim() || null,
    assigned_to: input.assigned_to?.trim() ?? null,
    metadata:    { ...input.metadata, institution },
  };

  const lead = await insertLead(ctx.client, insertInput);

  await insertAuditLog(ctx.client, {
    user_id:      ctx.user.id,
    action:       "create",
    entity_type:  "Lead",
    entity_id:    lead.id,
    entity_after: { id: lead.id, name: lead.name, status: lead.status, region: lead.region },
    request_id:   ctx.requestId,
  });

  return lead;
}

// ---------------------------------------------------------------------------
// UPDATE LEAD
// ---------------------------------------------------------------------------

export interface UpdateLeadPayload {
  salutation?: string | null;
  first_name?: string;
  last_name?: string;
  email?: string | null;
  phone?: string | null;
  status?: string;
  type?: string;
  region?: string;
  source?: string | null;
  institution?: string | null;
  assigned_to?: string | null;
  /** See CreateLeadInput.metadata — institution lives at metadata.institution. */
  metadata?: Record<string, unknown> | null;
}

/**
 * Updates a Lead. Returns null if the lead does not exist.
 */
export async function UpdateLeadCommand(
  ctx: TenantContext,
  id: string,
  input: UpdateLeadPayload
): Promise<Lead | null> {
  if (!id?.trim()) throw new ValidationError("lead id is required");

  const email = input.email?.trim();
  if (email && !EMAIL_REGEX.test(email)) throw new ValidationError("Invalid email format");

  const before = await getLeadById(ctx.client, id);
  if (!before) return null;

  const updateInput: UpdateLeadInput = {
    salutation:  input.salutation,
    first_name:  input.first_name,
    last_name:   input.last_name,
    email:       input.email,
    phone:       input.phone,
    status:      normalizeLeadStatus(input.status),
    type:        normalizeLeadType(input.type),
    region:      input.region,
    source:      input.source,
    institution: input.institution,
    assigned_to: input.assigned_to,
    metadata:    input.metadata,
  };

  const after = await updateLead(ctx.client, id, updateInput);
  if (!after) return null;

  await insertAuditLog(ctx.client, {
    user_id:       ctx.user.id,
    action:        "update",
    entity_type:   "Lead",
    entity_id:     id,
    entity_before: { status: before.status, region: before.region },
    entity_after:  { status: after.status,  region: after.region },
    request_id:    ctx.requestId,
  });

  return after;
}

// ---------------------------------------------------------------------------
// CONVERT LEAD
// ---------------------------------------------------------------------------

export interface ConvertLeadPayload {
  converted_to_id: string;
  converted_to_type: string;
}

/**
 * Marks a lead as converted, atomically setting status='converted' plus
 * converted_to_id/converted_to_type/converted_at. Returns null if the lead
 * does not exist. Audited as its own "convert" action so it's distinguishable
 * from a generic field update.
 *
 * Called both from the PATCH /lead/:id route (when the body carries
 * converted_to_id/converted_to_type) and from CreatePractitionerCommand
 * (same ctx.client / transaction) when a practitioner is created from a lead.
 */
export async function ConvertLeadCommand(
  ctx: TenantContext,
  id: string,
  input: ConvertLeadPayload
): Promise<Lead | null> {
  if (!id?.trim()) throw new ValidationError("lead id is required");

  const convertedToId = input.converted_to_id?.trim();
  if (!convertedToId) throw new ValidationError("converted_to_id is required");

  const convertedToType = input.converted_to_type?.trim().toLowerCase();
  if (
    convertedToType !== "practitioner" &&
    convertedToType !== "organization" &&
    convertedToType !== "patient" &&
    convertedToType !== "user"
  ) {
    throw new ValidationError(`Invalid converted_to_type: "${input.converted_to_type}"`);
  }

  const before = await getLeadById(ctx.client, id);
  if (!before) return null;

  const after = await convertLead(ctx.client, id, {
    converted_to_id:   convertedToId,
    converted_to_type: convertedToType,
  });
  if (!after) return null;

  await insertAuditLog(ctx.client, {
    user_id:       ctx.user.id,
    action:        "convert",
    entity_type:   "Lead",
    entity_id:     id,
    entity_before: { status: before.status, converted_to_id: before.converted_to_id },
    entity_after:  {
      status:            after.status,
      converted_to_id:   after.converted_to_id,
      converted_to_type: after.converted_to_type,
    },
    request_id: ctx.requestId,
  });

  return after;
}

// ---------------------------------------------------------------------------
// SEND OFFER EMAIL
// ---------------------------------------------------------------------------

/** Public marketing page — see apps/web/src/views/ForProfessionalsView.vue. */
const FOR_PROFESSIONALS_URL = "https://neosleepcare.com/for-professionals";

/**
 * Sends the partnership-offer follow-up email (thank-you + CTA to book a
 * call) to a lead after a rep's phone call, and stamps metadata.offerSentAt
 * so the PWA can warn before a re-send. Returns null if the lead does not
 * exist.
 */
export async function SendLeadOfferEmailCommand(ctx: TenantContext, id: string): Promise<Lead | null> {
  if (!id?.trim()) throw new ValidationError("lead id is required");

  const lead = await getLeadById(ctx.client, id);
  if (!lead) return null;
  if (!lead.email) throw new ValidationError("Lead has no email address");

  await sendLeadOfferEmail(
    lead.email,
    { offerLink: FOR_PROFESSIONALS_URL, bookingLink: `${FOR_PROFESSIONALS_URL}?lead=${lead.id}` },
    {
      title: lead.salutation,
      firstName: lead.first_name,
      lastName: lead.last_name,
      language: localeForRegion(lead.region),
      region: lead.region,
    },
    // Doctor sees this as coming from the rep who made the call, not a faceless system
    // sender — replies land in the rep's own inbox (see mailer.ts's EmailSender doc comment).
    { name: ctx.user.name ?? "NeoSleep", email: ctx.user.email }
  );

  const after = await updateLead(ctx.client, id, {
    metadata: { ...(lead.metadata ?? {}), offerSentAt: new Date().toISOString() },
  });

  await insertAuditLog(ctx.client, {
    user_id:      ctx.user.id,
    action:       "send-offer",
    entity_type:  "Lead",
    entity_id:    id,
    entity_after: { offerSentAt: after?.metadata?.offerSentAt ?? null },
    request_id:   ctx.requestId,
  });

  return after;
}

// ---------------------------------------------------------------------------
// UPSERT PUBLIC LEAD (create-or-update — public booking widget, no auth)
// ---------------------------------------------------------------------------

export interface UpsertPublicLeadInput {
  leadId?: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string | null;
  institution: string;
  city?: string | null;
  country_code?: string | null;
}

/** existing wins if it's already set; otherwise fills in from the new booking-form value. Returns undefined ("don't touch this column") when there's nothing to change. */
function fillIfEmpty(existing: string | null | undefined, incoming: string | null | undefined): string | undefined {
  if (existing) return undefined;
  return incoming?.trim() || undefined;
}

/**
 * Public write path — see routes/public.ts and routes/booking.ts. No
 * TenantContext/session here (buildContext hard-throws without one); takes a
 * raw PoolClient from withTenant() plus a requestId, the same pattern
 * commands/invitePractitioner.ts already uses for unauthenticated writes.
 * audit_log.user_id is null (nullable column) since there's no staff user
 * acting — the visitor themself is the actor.
 *
 * Never clobbers a rep's own data on an existing lead — only fills fields
 * that are currently empty, then stamps metadata.demoBookedAt either way.
 */
export async function UpsertPublicLeadCommand(
  client: Parameters<typeof getLeadById>[0],
  input: UpsertPublicLeadInput,
  meta: { requestId: string }
): Promise<Lead> {
  const firstName = input.first_name?.trim() ?? "";
  const lastName = input.last_name?.trim() ?? "";
  if (!firstName) throw new ValidationError("first_name is required");
  if (!lastName) throw new ValidationError("last_name is required");

  const institution = input.institution?.trim() ?? "";
  if (!institution) throw new ValidationError("institution is required");

  const email = input.email?.trim() ?? "";
  if (!EMAIL_REGEX.test(email)) throw new ValidationError("Invalid email format");

  const existing = input.leadId?.trim() ? await getLeadById(client, input.leadId.trim()) : null;

  if (existing) {
    const existingMetadata = existing.metadata ?? {};
    const after = await updateLead(client, existing.id, {
      phone:       fillIfEmpty(existing.phone, input.phone),
      institution: fillIfEmpty(existing.institution, institution),
      metadata: {
        ...existingMetadata,
        institution:  (typeof existingMetadata.institution === "string" && existingMetadata.institution) || institution,
        city:         (typeof existingMetadata.city === "string" && existingMetadata.city) || input.city?.trim() || null,
        country_code: (typeof existingMetadata.country_code === "string" && existingMetadata.country_code) || input.country_code?.trim() || null,
        demoBookedAt: new Date().toISOString(),
      },
    });

    await insertAuditLog(client, {
      user_id:      null,
      action:       "demo-booked",
      entity_type:  "Lead",
      entity_id:    existing.id,
      entity_after: { demoBookedAt: after?.metadata?.demoBookedAt ?? null },
      request_id:   meta.requestId,
    });

    return after!;
  }

  const insertInput: InsertLeadInput = {
    first_name: firstName,
    last_name:  lastName,
    email,
    phone:      input.phone?.trim() || null,
    status:     "new",
    type:       "doctor",
    region:     "",
    source:     "website",
    institution,
    metadata: {
      institution,
      city:         input.city?.trim() || null,
      country_code: input.country_code?.trim() || null,
      demoBookedAt: new Date().toISOString(),
    },
  };

  const lead = await insertLead(client, insertInput);

  await insertAuditLog(client, {
    user_id:      null,
    action:       "create",
    entity_type:  "Lead",
    entity_id:    lead.id,
    entity_after: { id: lead.id, name: lead.name, status: lead.status, source: "website" },
    request_id:   meta.requestId,
  });

  return lead;
}

// ---------------------------------------------------------------------------
// DELETE LEAD (soft delete)
// ---------------------------------------------------------------------------

export async function DeleteLeadCommand(ctx: TenantContext, id: string): Promise<void> {
  if (!id?.trim()) throw new ValidationError("lead id is required");

  await softDeleteLead(ctx.client, id);

  await insertAuditLog(ctx.client, {
    user_id:    ctx.user.id,
    action:     "delete",
    entity_type: "Lead",
    entity_id:  id,
    request_id: ctx.requestId,
  });
}
