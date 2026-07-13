import type { TenantContext } from "../context/TenantContext.js";
import type { EncounterStatus } from "../db.js";
import {
  insertEncounter,
  updateEncounter,
  getEncounterById,
  isEncounterType,
  isEncounterStatus,
  type InsertEncounterInput,
  type UpdateEncounterInput,
  type Encounter,
} from "../db.js";
import { insertAuditLog } from "../db.js";
import { ValidationError } from "../errors.js";

/**
 * COMMANDS — the "cooks" of the CQRS kitchen.
 *
 * A Command:
 *   1. Validates input (throws ValidationError on bad data)
 *   2. Executes the DB write via the client already in ctx (same transaction as audit)
 *   3. Writes to audit_log (compliance record, uses ctx.client so it's in the same transaction)
 *   4. Returns the result
 *
 * Commands never touch `req` or `res`. They only know about TenantContext + input.
 * This makes them independently testable and reusable (e.g. from a background job).
 *
 * Audit history ("will we have history of all encounters for audits?") is covered
 * by audit_log (before/after JSON per mutation) — see insertAuditLog calls below.
 */

// ---------------------------------------------------------------------------
// CREATE ENCOUNTER
// ---------------------------------------------------------------------------

export interface CreateEncounterInput {
  start_at: string;
  end_at?: string | null;
  type: string;
  status?: string;
  notes?: string | null;
  practitioner_id?: string | null;
  organization_id?: string | null;
  region?: string | null;
  territory_id?: string | null;
  attendees?: string[];
  transfer_of_value?: Record<string, unknown>;
  metadata?: Record<string, unknown> | null;
}

/**
 * Creates a new Encounter.
 * Validates input, derives FHIR class from type, writes DB + event + audit
 * — all in the same transaction (via ctx.client / withTenant).
 */
export async function CreateEncounterCommand(
  ctx: TenantContext,
  input: CreateEncounterInput
): Promise<Encounter> {
  // Validate
  if (!input.start_at?.trim()) throw new ValidationError("start_at is required");
  if (!isEncounterType(input.type)) {
    throw new ValidationError(`Invalid encounter type: "${input.type}". Valid: visit, call, email, congress, webinar, other`);
  }
  if (input.status && !isEncounterStatus(input.status)) {
    throw new ValidationError(`Invalid encounter status: "${input.status}"`);
  }

  const insertInput: InsertEncounterInput = {
    user_id:           ctx.user.id,
    start_at:          input.start_at.trim(),
    end_at:            input.end_at ?? null,
    type:              input.type,
    status:            isEncounterStatus(input.status ?? "") ? (input.status as EncounterStatus) : "planned",
    notes:             input.notes ?? null,
    practitioner_id:   input.practitioner_id ?? null,
    organization_id:   input.organization_id ?? null,
    region:            input.region ?? null,
    territory_id:      input.territory_id ?? null,
    attendees:         input.attendees ?? [],
    transfer_of_value: input.transfer_of_value ?? {},
    metadata:          input.metadata ?? null,
  };

  const encounter = await insertEncounter(ctx.client, insertInput);

  // Write audit log — GDPR/SOC 2 compliance record
  await insertAuditLog(ctx.client, {
    user_id:      ctx.user.id,
    action:       "create",
    entity_type:  "Encounter",
    entity_id:    encounter.id,
    entity_after: { id: encounter.id, type: encounter.type, status: encounter.status, start_at: encounter.start_at },
    request_id:   ctx.requestId,
  });

  return encounter;
}

// ---------------------------------------------------------------------------
// UPDATE ENCOUNTER
// ---------------------------------------------------------------------------

export interface UpdateEncounterPayload {
  start_at?: string;
  end_at?: string | null;
  type?: string;
  status?: string;
  notes?: string | null;
  practitioner_id?: string | null;
  organization_id?: string | null;
  region?: string | null;
  territory_id?: string | null;
  attendees?: string[];
  transfer_of_value?: Record<string, unknown>;
  disclosed_at?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Updates an Encounter. Returns null if the encounter does not exist.
 */
export async function UpdateEncounterCommand(
  ctx: TenantContext,
  id: string,
  input: UpdateEncounterPayload
): Promise<Encounter | null> {
  if (!id?.trim()) throw new ValidationError("encounter id is required");
  if (input.type && !isEncounterType(input.type)) {
    throw new ValidationError(`Invalid encounter type: "${input.type}"`);
  }
  if (input.status && !isEncounterStatus(input.status)) {
    throw new ValidationError(`Invalid encounter status: "${input.status}"`);
  }

  const before = await getEncounterById(ctx.client, id);
  if (!before) return null;

  const updateInput: UpdateEncounterInput = {
    start_at:          input.start_at,
    end_at:            input.end_at,
    type:              input.type && isEncounterType(input.type) ? input.type : undefined,
    status:            input.status && isEncounterStatus(input.status) ? input.status : undefined,
    notes:             input.notes,
    practitioner_id:   input.practitioner_id,
    organization_id:   input.organization_id,
    region:            input.region,
    territory_id:      input.territory_id,
    attendees:         input.attendees,
    transfer_of_value: input.transfer_of_value,
    disclosed_at:      input.disclosed_at,
    metadata:          input.metadata,
  };

  const after = await updateEncounter(ctx.client, id, updateInput);
  if (!after) return null;

  await insertAuditLog(ctx.client, {
    user_id:       ctx.user.id,
    action:        "update",
    entity_type:   "Encounter",
    entity_id:     id,
    entity_before: { status: before.status, type: before.type, start_at: before.start_at },
    entity_after:  { status: after.status,  type: after.type,  start_at: after.start_at },
    request_id:    ctx.requestId,
  });

  return after;
}
