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
 *   2. Executes the DB write via the client already in ctx (same transaction as audit/event)
 *   3. Emits an event to event_store (immutable record of what happened)
 *   4. Writes to audit_log (compliance record, uses ctx.client so it's in the same transaction)
 *   5. Returns the result
 *
 * Commands never touch `req` or `res`. They only know about TenantContext + input.
 * This makes them independently testable and reusable (e.g. from a background job).
 *
 * EVENT STORE:
 * Every command writes a typed event BEFORE returning. This is the audit history
 * the user asked about: "will we have history of all encounters for audits?"
 * YES — every EncounterCreated, EncounterUpdated, EncounterStatusChanged event is
 * stored in event_store and is immutable, queryable, and replayable.
 */

async function emitEvent(
  ctx: TenantContext,
  type: string,
  aggregateType: string,
  aggregateId: string,
  payload: Record<string, unknown>
): Promise<void> {
  // Get current max sequence for this aggregate (for ordering multiple events on same entity)
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

  // Emit event — the permanent record of "this encounter was created"
  await emitEvent(ctx, "EncounterCreated", "Encounter", encounter.id, {
    encounter_id:    encounter.id,
    type:            encounter.type,
    status:          encounter.status,
    class:           encounter.class,
    start_at:        encounter.start_at,
    practitioner_id: encounter.practitioner_id,
    organization_id: encounter.organization_id,
    user_id:         encounter.user_id,
    region:          encounter.region,
  });

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
 * Emits EncounterUpdated (or EncounterStatusChanged if only status changed).
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

  // Emit a specific event type when only status changed (useful for dashboards / reports)
  const eventType = (input.status && input.status !== before.status)
    ? "EncounterStatusChanged"
    : "EncounterUpdated";

  await emitEvent(ctx, eventType, "Encounter", id, {
    encounter_id: id,
    changed_fields: Object.keys(input).filter((k) => input[k as keyof UpdateEncounterPayload] !== undefined),
    before: { status: before.status, type: before.type, start_at: before.start_at },
    after:  { status: after.status,  type: after.type,  start_at: after.start_at },
  });

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
