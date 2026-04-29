import type { TenantContext } from "../context/TenantContext.js";
import {
  insertPractitioner,
  updatePractitioner,
  getPractitionerById,
  type InsertPractitionerInput,
  type UpdatePractitionerInput,
  type Practitioner,
} from "../db.js";
import { insertAuditLog } from "../db.js";
import { ValidationError } from "../errors.js";

/**
 * COMMANDS — Practitioner domain.
 *
 * Each command validates, writes, emits event, writes audit log, returns result.
 * No req/res. No getDb(). Only ctx.client (tenant-scoped, same transaction).
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function emitEvent(
  ctx: TenantContext,
  type: string,
  aggregateType: string,
  aggregateId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const seqResult = await ctx.client.query<{ seq: string }>(
    `SELECT COALESCE(MAX(sequence), -1) + 1 AS seq
     FROM event_store WHERE aggregate_id = $1`,
    [aggregateId]
  );
  const sequence = parseInt(seqResult.rows[0]?.seq ?? "0", 10);

  await ctx.client.query(
    `INSERT INTO event_store
       (type, aggregate_type, aggregate_id, sequence, user_id, payload, correlation_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [type, aggregateType, aggregateId, sequence, ctx.user.id, JSON.stringify(payload), ctx.requestId]
  );
}

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
  institution?: string | null;
  region?: string;
  influence_tier?: string;
  language?: string | null;
  national_ids?: Record<string, string> | null;
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
    institution:      input.institution ?? null,
    region:           input.region,
    influence_tier:   input.influence_tier,
    language:         input.language ?? null,
    national_ids:     input.national_ids ?? null,
  };

  const practitioner = await insertPractitioner(ctx.client, insertInput);

  await emitEvent(ctx, "PractitionerCreated", "Practitioner", practitioner.id, {
    practitioner_id:   practitioner.id,
    primary_specialty: practitioner.primary_specialty,
    region:            practitioner.region,
    influence_tier:    practitioner.influence_tier,
    institution:       practitioner.institution,
    user_id:           ctx.user.id,
  });

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
  institution?: string | null;
  region?: string;
  influence_tier?: string;
  language?: string | null;
  national_ids?: Record<string, string> | null;
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
    institution:      input.institution,
    region:           input.region,
    influence_tier:   input.influence_tier,
    language:         input.language,
    national_ids:     input.national_ids,
  };

  const after = await updatePractitioner(ctx.client, id, updateInput);
  if (!after) return null;

  await emitEvent(ctx, "PractitionerUpdated", "Practitioner", id, {
    practitioner_id: id,
    changed_fields:  Object.keys(input).filter((k) => input[k as keyof UpdatePractitionerPayload] !== undefined),
    before:          { primary_specialty: before.primary_specialty, region: before.region, influence_tier: before.influence_tier },
    after:           { primary_specialty: after.primary_specialty,  region: after.region,  influence_tier: after.influence_tier },
  });

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
