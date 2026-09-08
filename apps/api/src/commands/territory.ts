import type { TenantContext } from "../context/TenantContext.js";
import {
  insertTerritory,
  updateTerritory,
  getTerritoryById,
  getTerritoryPath,
  softDeleteTerritory,
  type InsertTerritoryInput,
  type UpdateTerritoryInput,
  type Territory,
} from "../db.js";
import { insertAuditLog } from "../db.js";
import { ValidationError } from "../errors.js";

/**
 * COMMANDS — Territory (geographic hierarchy) domain.
 *
 * Admin-only (see routes/territory.ts's requireRole("admin")) — this is the
 * data-entry surface for the country > region > city > village > district
 * tree that patient.territory_id (via identities) links into, and that
 * users/organization territory assignment already used before this.
 */

// DB CHECK constraint territory_kind_check — see migrations/020_territory_hierarchy.sql.
const TERRITORY_KINDS = ["country", "region", "city", "village", "district"] as const;

function normalizeKind(input: string | undefined): string {
  const v = (input ?? "").trim().toLowerCase();
  if (!TERRITORY_KINDS.includes(v as (typeof TERRITORY_KINDS)[number])) {
    throw new ValidationError(`Invalid territory kind: "${input}"`);
  }
  return v;
}

// ---------------------------------------------------------------------------
// CREATE TERRITORY
// ---------------------------------------------------------------------------

export interface CreateTerritoryInput {
  name: string;
  code?: string | null;
  country_code: string;
  parent_id?: string | null;
  kind: string;
  metadata?: Record<string, unknown> | null;
}

export async function CreateTerritoryCommand(ctx: TenantContext, input: CreateTerritoryInput): Promise<Territory> {
  const name = input.name?.trim() ?? "";
  if (!name) throw new ValidationError("name is required");
  const country_code = input.country_code?.trim() ?? "";
  if (!country_code) throw new ValidationError("country_code is required");

  const kind = normalizeKind(input.kind);

  if (input.parent_id) {
    const parent = await getTerritoryById(ctx.client, input.parent_id);
    if (!parent) throw new ValidationError("parent_id does not reference an existing territory");
  }

  const insertInput: InsertTerritoryInput = {
    name,
    code: input.code ?? null,
    country_code,
    parent_id: input.parent_id ?? null,
    kind,
    metadata: input.metadata ?? null,
  };

  const territory = await insertTerritory(ctx.client, insertInput);

  await insertAuditLog(ctx.client, {
    user_id:      ctx.user.id,
    action:       "create",
    entity_type:  "Territory",
    entity_id:    territory.id,
    entity_after: { id: territory.id, name: territory.name, kind: territory.kind, parent_id: territory.parent_id },
    request_id:   ctx.requestId,
  });

  return territory;
}

// ---------------------------------------------------------------------------
// UPDATE TERRITORY
// ---------------------------------------------------------------------------

export interface UpdateTerritoryPayload {
  name?: string;
  code?: string | null;
  country_code?: string;
  parent_id?: string | null;
  kind?: string;
  metadata?: Record<string, unknown> | null;
}

export async function UpdateTerritoryCommand(
  ctx: TenantContext,
  id: string,
  input: UpdateTerritoryPayload
): Promise<Territory | null> {
  if (!id?.trim()) throw new ValidationError("territory id is required");

  const before = await getTerritoryById(ctx.client, id);
  if (!before) return null;

  if (input.parent_id !== undefined && input.parent_id !== null) {
    if (input.parent_id === id) throw new ValidationError("A territory cannot be its own parent");
    const parent = await getTerritoryById(ctx.client, input.parent_id);
    if (!parent) throw new ValidationError("parent_id does not reference an existing territory");

    // Direct self-parenting is caught above; this catches the indirect case
    // (id already sits somewhere in the proposed parent's own ancestor
    // chain) — without it, a two-step edit (set B's parent to A, then A's
    // parent to B) creates a real cycle, which getTerritoryPath's recursive
    // CTE has no built-in protection against.
    const proposedAncestry = await getTerritoryPath(ctx.client, input.parent_id);
    if (proposedAncestry.some((node) => node.id === id)) {
      throw new ValidationError("This parent assignment would create a cycle in the territory hierarchy");
    }
  }

  const updateInput: UpdateTerritoryInput = {
    name: input.name,
    code: input.code,
    country_code: input.country_code,
    parent_id: input.parent_id,
    kind: input.kind !== undefined ? normalizeKind(input.kind) : undefined,
    metadata: input.metadata,
  };

  const after = await updateTerritory(ctx.client, id, updateInput);
  if (!after) return null;

  await insertAuditLog(ctx.client, {
    user_id:       ctx.user.id,
    action:        "update",
    entity_type:   "Territory",
    entity_id:     id,
    entity_before: { name: before.name, kind: before.kind, parent_id: before.parent_id },
    entity_after:  { name: after.name,  kind: after.kind,  parent_id: after.parent_id },
    request_id:    ctx.requestId,
  });

  return after;
}

// ---------------------------------------------------------------------------
// DELETE TERRITORY (soft delete)
// ---------------------------------------------------------------------------

export async function DeleteTerritoryCommand(ctx: TenantContext, id: string): Promise<void> {
  if (!id?.trim()) throw new ValidationError("territory id is required");

  await softDeleteTerritory(ctx.client, id);

  await insertAuditLog(ctx.client, {
    user_id:     ctx.user.id,
    action:      "delete",
    entity_type: "Territory",
    entity_id:   id,
    request_id:  ctx.requestId,
  });
}
