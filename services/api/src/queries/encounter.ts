import type { TenantContext } from "../context/TenantContext.js";
import {
  getEncounters,
  getEncounterById,
  type GetEncounterFilters,
  type Encounter,
  type EncounterStatus,
} from "../db.js";

/**
 * QUERIES — the "serving counter" of the CQRS kitchen.
 *
 * A Query:
 *   - Only reads. Never writes.
 *   - Never emits events or audit entries (reading is not a state change — GDPR Art. 30
 *     only requires logging of processing that changes or accesses sensitive data;
 *     read-audit is opt-in per jurisdiction and can be added without changing this layer).
 *   - Returns typed data, formatted for the API response.
 *
 * ENCOUNTER HISTORY:
 * Because every write goes through a Command that emits to event_store,
 * the full timeline of any encounter is queryable:
 *   SELECT * FROM event_store
 *   WHERE aggregate_type = 'Encounter' AND aggregate_id = $1
 *   ORDER BY sequence ASC;
 * This is the "history of all encounters for audits" — immutable, ordered, complete.
 */

// ---------------------------------------------------------------------------
// SERIALIZATION — shared between list and detail queries
// ---------------------------------------------------------------------------

export interface EncounterDto {
  id: string;
  user_id: string;
  practitioner_id: string | null;
  organization_id: string | null;
  type: string;
  status: string;
  class: string;
  start_at: string;
  end_at: string | null;
  notes: string | null;
  region: string | null;
  territory_id: string | null;
  attendees: string[];
  transfer_of_value: Record<string, unknown>;
  disclosed_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

function toDto(e: Encounter): EncounterDto {
  return {
    id:                e.id,
    user_id:           e.user_id,
    practitioner_id:   e.practitioner_id   ?? null,
    organization_id:   e.organization_id   ?? null,
    type:              e.type,
    status:            e.status,
    class:             e.class,
    start_at:          e.start_at instanceof Date ? e.start_at.toISOString() : String(e.start_at),
    end_at:            e.end_at ? (e.end_at instanceof Date ? e.end_at.toISOString() : String(e.end_at)) : null,
    notes:             e.notes              ?? null,
    region:            e.region             ?? null,
    territory_id:      e.territory_id       ?? null,
    attendees:         e.attendees          ?? [],
    transfer_of_value: e.transfer_of_value  ?? {},
    disclosed_at:      e.disclosed_at ? (e.disclosed_at instanceof Date ? e.disclosed_at.toISOString() : String(e.disclosed_at)) : null,
    metadata:          e.metadata           ?? null,
    created_at:        e.created_at instanceof Date ? e.created_at.toISOString() : String(e.created_at),
    updated_at:        e.updated_at instanceof Date ? e.updated_at.toISOString() : String(e.updated_at),
  };
}

// ---------------------------------------------------------------------------
// QUERY: GET LIST
// ---------------------------------------------------------------------------

export interface GetEncounterListInput {
  start?: string;
  end?: string;
  region?: string;
  territory_id?: string;
  status?: string;
  userId?: string;
}

export interface GetEncounterListResult {
  items: EncounterDto[];
  total: number;
}

/**
 * Returns a filtered list of encounters for the current user/tenant.
 * The userId filter ensures reps only see their own encounters by default.
 * Managers can pass a different userId or omit it to see the full team.
 */
export async function GetEncounterListQuery(
  ctx: TenantContext,
  input: GetEncounterListInput
): Promise<GetEncounterListResult> {
  const filters: GetEncounterFilters = {
    start:        input.start,
    end:          input.end,
    region:       input.region,
    territory_id: input.territory_id,
    // Reps can only see their own encounters (enforced here, not in SQL)
    // Managers/admins can see all by passing userId or leaving it empty
    userId: ctx.user.role === "rep" ? ctx.user.id : (input.userId ?? undefined),
    status: input.status as EncounterStatus | undefined,
  };

  const { rows } = await getEncounters(ctx.client, filters);
  return {
    items: rows.map(toDto),
    total: rows.length,
  };
}

// ---------------------------------------------------------------------------
// QUERY: GET BY ID
// ---------------------------------------------------------------------------

/**
 * Returns a single encounter by ID, or null if not found / deleted.
 * Reps can only view their own encounters (role-scoped check).
 */
export async function GetEncounterByIdQuery(
  ctx: TenantContext,
  id: string
): Promise<EncounterDto | null> {
  const encounter = await getEncounterById(ctx.client, id);
  if (!encounter) return null;

  // Reps can only view encounters they own
  if (ctx.user.role === "rep" && encounter.user_id !== ctx.user.id) return null;

  return toDto(encounter);
}

// ---------------------------------------------------------------------------
// QUERY: GET ENCOUNTER HISTORY (event_store replay)
// ---------------------------------------------------------------------------

export interface EncounterEvent {
  id: string;
  type: string;
  sequence: number;
  user_id: string | null;
  payload: Record<string, unknown>;
  occurred_at: string;
}

/**
 * Returns the full event history for a single encounter.
 * This is the audit trail: every EncounterCreated / EncounterUpdated /
 * EncounterStatusChanged event, in sequence order.
 * Available to managers and admins only.
 */
export async function GetEncounterHistoryQuery(
  ctx: TenantContext,
  encounterId: string
): Promise<EncounterEvent[]> {
  if (ctx.user.role === "rep") return []; // reps have no access to history view

  const result = await ctx.client.query<EncounterEvent>(
    `SELECT id, type, sequence, user_id, payload, occurred_at
     FROM event_store
     WHERE aggregate_type = 'Encounter' AND aggregate_id = $1
     ORDER BY sequence ASC`,
    [encounterId]
  );
  return result.rows.map((r) => ({
    ...r,
    occurred_at: r.occurred_at != null ? new Date(r.occurred_at as string).toISOString() : String(r.occurred_at),
  }));
}
