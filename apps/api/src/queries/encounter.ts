import type { TenantContext } from "../context/TenantContext.js";
import {
  getEncounters,
  getEncounterById,
  type GetEncounterFilters,
  type Encounter,
  type EncounterStatus,
  type EncounterVisibilityScope,
} from "../db.js";
import { getAllowedScopePaths } from "../middleware/requireScope.js";

/**
 * QUERIES — the "serving counter" of the CQRS kitchen.
 *
 * A Query:
 *   - Only reads. Never writes.
 *   - Never emits audit entries (reading is not a state change — GDPR Art. 30
 *     only requires logging of processing that changes or accesses sensitive data;
 *     read-audit is opt-in per jurisdiction and can be added without changing this layer).
 *   - Returns typed data, formatted for the API response.
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
// VISIBILITY (CORE-106) — the Planificador leak
//
// Before this: GetEncounterListQuery only restricted `rep`; every other role
// (kam/msl/manager/admin) got every encounter in the tenant back, and
// UpdateEncounterCommand had no ownership/scope check at all — anyone could
// edit anyone's encounter by id.
//
// The rule, in ONE place so list/by-id/update (and the upcoming unified
// Calendar endpoint, CORE-117) all agree:
//   rep / kam / msl / doctor   only their own encounters (user_id = self)
//   manager / admin            their own encounters PLUS anything inside
//                               their allowed territory scope
//                               (middleware/requireScope.ts getAllowedScopePaths),
//                               checked via encounter.territory_id — same
//                               ltree pattern practitioner/organization/lead
//                               already use.
// ---------------------------------------------------------------------------

/**
 * Resolves `ctx.user`'s encounter visibility scope. Exported so CORE-117's
 * unified Calendar endpoint can reuse the exact same rule this file applies
 * to list/by-id/update, instead of re-deriving it.
 */
export async function encounterVisibilityScope(ctx: TenantContext): Promise<EncounterVisibilityScope> {
  const widensByScope = ctx.user.role === "manager" || ctx.user.role === "admin";
  return {
    ownerId: ctx.user.id,
    scopePaths: widensByScope ? await getAllowedScopePaths(ctx.client, ctx.user.roles) : undefined,
  };
}

/**
 * True when `encounter` is visible to `ctx.user` under encounterVisibilityScope().
 * Call after fetching a single row (GetEncounterByIdQuery / UpdateEncounterCommand).
 * A false result must become a 404, never a 403 — another user's encounter
 * must not be distinguishable from one that doesn't exist (same as PATCH).
 */
export async function isEncounterVisible(
  ctx: TenantContext,
  encounter: Pick<Encounter, "user_id" | "territory_id">
): Promise<boolean> {
  const scope = await encounterVisibilityScope(ctx);
  if (encounter.user_id === scope.ownerId) return true;
  if (scope.scopePaths === undefined) return false; // owner-only role, not the owner
  if (scope.scopePaths === null) return true;        // manager/admin, global role scope
  if (scope.scopePaths.length === 0) return false;
  if (!encounter.territory_id) return true;           // unassigned — rollout-safety fallback

  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `SELECT (path <@ ANY($2::extensions.ltree[])) AS ok FROM territory WHERE id = $1`,
    [encounter.territory_id, scope.scopePaths]
  );
  return !!rows[0]?.ok;
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
 * Returns a filtered list of encounters for the current user/tenant, scoped
 * by encounterVisibilityScope() (CORE-106): rep/kam/msl/doctor see only
 * their own; manager/admin additionally see anything in their territory
 * scope. input.userId narrows manager/admin to one team member — ignored
 * for owner-only roles, whose own-only restriction is already absolute.
 */
export async function GetEncounterListQuery(
  ctx: TenantContext,
  input: GetEncounterListInput
): Promise<GetEncounterListResult> {
  const visibility = await encounterVisibilityScope(ctx);

  const filters: GetEncounterFilters = {
    start:        input.start,
    end:          input.end,
    region:       input.region,
    territory_id: input.territory_id,
    status:       input.status as EncounterStatus | undefined,
    // Only meaningful for manager/admin (own-only roles are already fully
    // restricted by `visibility` below, regardless of what the client sent).
    userId: visibility.scopePaths !== undefined ? input.userId : undefined,
    visibility,
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
 * Returns a single encounter by ID, or null if not found / deleted / not
 * visible to ctx.user under encounterVisibilityScope() (CORE-106) — a
 * encounter outside the caller's scope 404s exactly like a missing one,
 * never a 403, so its existence isn't leaked.
 */
export async function GetEncounterByIdQuery(
  ctx: TenantContext,
  id: string
): Promise<EncounterDto | null> {
  const encounter = await getEncounterById(ctx.client, id);
  if (!encounter) return null;

  if (!(await isEncounterVisible(ctx, encounter))) return null;

  return toDto(encounter);
}
