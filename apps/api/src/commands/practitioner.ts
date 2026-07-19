import type { TenantContext } from "../context/TenantContext.js";
import {
  insertPractitioner,
  updatePractitioner,
  getPractitionerById,
  softDeletePractitioner,
  type InsertPractitionerInput,
  type UpdatePractitionerInput,
  type Practitioner,
} from "../db.js";
import { insertAuditLog } from "../db.js";
import { ValidationError } from "../errors.js";
import { ConvertLeadCommand } from "./lead.js";

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
  influence_tier?: string;
  language?: string | null;
  national_ids?: Record<string, string> | null;
  social_links?: Record<string, unknown> | null;
  /** When set, this practitioner is being created from a lead ("move to contacts") —
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
  if (email && !EMAIL_REGEX.test(email)) throw new ValidationError("Invalid email format");

  const phone = input.phone?.trim() ?? "";
  if (phone) {
    const digitsOnly = phone.replace(/\D/g, "");
    if (digitsOnly.length < 9) throw new ValidationError("Phone must contain at least 9 digits");
  }

  const insertInput: InsertPractitionerInput = {
    first_name:       firstName,
    last_name:        lastName,
    salutation:       input.salutation ?? null,
    email:            email || null,
    phone:            phone || null,
    primary_specialty: input.primary_specialty ?? input.specialty ?? null,
    // Preserve the undefined/null distinction: undefined => fall back to
    // resolving `institution` by name (see insertPractitioner); null/id => use directly.
    organization_id:  input.organization_id !== undefined ? input.organization_id : undefined,
    institution:      input.institution ?? null,
    region:           input.region,
    influence_tier:   input.influence_tier,
    language:         input.language ?? null,
    national_ids:     input.national_ids ?? null,
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
  influence_tier?: string;
  language?: string | null;
  national_ids?: Record<string, string> | null;
  social_links?: Record<string, unknown> | null;
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

  const email = input.email?.trim();
  if (email && !EMAIL_REGEX.test(email)) throw new ValidationError("Invalid email format");

  const phone = input.phone?.trim();
  if (phone) {
    const digitsOnly = phone.replace(/\D/g, "");
    if (digitsOnly.length < 9) throw new ValidationError("Phone must contain at least 9 digits");
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
    influence_tier:   input.influence_tier,
    language:         input.language,
    national_ids:     input.national_ids,
    social_links:     input.social_links,
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
