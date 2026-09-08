import type { PoolClient } from "pg";
import { trimOrNull, trimOrEmpty } from "./helpers.js";
import { AppError, DatabaseError, ValidationError } from "../errors.js";

export interface Territory {
  id: string;
  name: string;
  code: string | null;
  country_code: string;
  parent_id: string | null;
  kind: string;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

export interface GetTerritoryFilters {
  search?: string;
  country_code?: string;
  kind?: string;
  parent_id?: string | null;
}

export interface InsertTerritoryInput {
  name: string;
  code?: string | null;
  country_code: string;
  parent_id?: string | null;
  kind: string;
  metadata?: Record<string, unknown> | null;
}

export interface UpdateTerritoryInput {
  name?: string;
  code?: string | null;
  country_code?: string;
  parent_id?: string | null;
  kind?: string;
  metadata?: Record<string, unknown> | null;
}

const TERRITORY_SELECT_COLS = `
  id, name, code, country_code, parent_id, kind, metadata, created_at, updated_at`.trim();

export async function getTerritoryPaginated(
  client: PoolClient,
  filters: GetTerritoryFilters,
  page: number,
  limit: number
): Promise<{ rows: Territory[]; total: number }> {
  const conditions: string[] = ["deleted_at IS NULL"];
  const params: unknown[] = [];
  let idx = 1;

  if (filters.search?.trim()) {
    conditions.push(`(LOWER(name) LIKE $${idx} OR LOWER(COALESCE(code,'')) LIKE $${idx})`);
    params.push(`%${filters.search.trim().toLowerCase()}%`);
    idx++;
  }
  if (filters.country_code?.trim()) {
    conditions.push(`country_code = $${idx++}`);
    params.push(filters.country_code.trim());
  }
  if (filters.kind?.trim()) {
    conditions.push(`kind = $${idx++}`);
    params.push(filters.kind.trim());
  }
  if (filters.parent_id !== undefined) {
    if (filters.parent_id === null) {
      conditions.push("parent_id IS NULL");
    } else {
      conditions.push(`parent_id = $${idx++}`);
      params.push(filters.parent_id);
    }
  }

  const where = `WHERE ${conditions.join(" AND ")}`;

  try {
    const countResult = await client.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM territory ${where}`,
      params
    );
    const total = Number(countResult.rows[0]?.count ?? 0);

    const offset = (page - 1) * limit;
    params.push(limit, offset);
    const dataResult = await client.query<Territory>(
      `SELECT ${TERRITORY_SELECT_COLS} FROM territory ${where} ORDER BY name ASC LIMIT $${idx} OFFSET $${idx + 1}`,
      params
    );
    return { rows: dataResult.rows, total };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getTerritoryPaginated", err);
  }
}

export async function getTerritoryById(client: PoolClient, id: string): Promise<Territory | null> {
  try {
    const result = await client.query<Territory>(
      `SELECT ${TERRITORY_SELECT_COLS} FROM territory WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    return result.rows[0] ?? null;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getTerritoryById", err);
  }
}

export interface TerritoryPathNode {
  id: string;
  name: string;
  code: string | null;
  kind: string;
}

/**
 * Walks parent_id from the given territory up to its root, returning nodes
 * root-first (country → ... → the given node) — the order the "mx/cdmx/polanco"
 * breadcrumb label is built from. Returns [] if id doesn't resolve (deleted or
 * unknown) rather than throwing — a patient's territory_id can point at a
 * since-deleted node, and the caller (queries/patient.ts) treats an empty path
 * as "fall back to the flat identities.region text".
 *
 * `depth < 20` is defense-in-depth against a cyclic parent_id chain (A→B→A) —
 * UpdateTerritoryCommand already rejects the writes that would create one,
 * but this keeps a cycle created some other way (a direct DB edit, a bug
 * elsewhere) from making this recursive CTE loop until statement_timeout
 * instead of just returning a — admittedly wrong, but bounded — path. Real
 * hierarchies are 5 levels deep at most (country>region>city>village>district).
 */
export async function getTerritoryPath(client: PoolClient, id: string): Promise<TerritoryPathNode[]> {
  try {
    const result = await client.query<TerritoryPathNode & { depth: number }>(
      `WITH RECURSIVE ancestors AS (
         SELECT id, name, code, kind, parent_id, 0 AS depth
         FROM territory WHERE id = $1 AND deleted_at IS NULL
         UNION ALL
         SELECT t.id, t.name, t.code, t.kind, t.parent_id, a.depth + 1
         FROM territory t
         JOIN ancestors a ON t.id = a.parent_id
         WHERE t.deleted_at IS NULL AND a.depth < 20
       )
       SELECT id, name, code, kind FROM ancestors ORDER BY depth DESC`,
      [id]
    );
    return result.rows;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getTerritoryPath", err);
  }
}

/**
 * Inserts a territory node using the provided client.
 * The client must already be in a transaction (withTenant handles this).
 */
export async function insertTerritory(client: PoolClient, input: InsertTerritoryInput): Promise<Territory> {
  const name = trimOrEmpty(input.name);
  if (!name) throw new ValidationError("name is required");

  try {
    const result = await client.query<{ id: string }>(
      `INSERT INTO territory (name, code, country_code, parent_id, kind, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        name,
        trimOrNull(input.code),
        trimOrEmpty(input.country_code),
        input.parent_id ?? null,
        input.kind,
        input.metadata ? JSON.stringify(input.metadata) : null,
      ]
    );
    const id = result.rows[0]!.id;

    const territory = await getTerritoryById(client, id);
    if (!territory) throw new DatabaseError("insertTerritory", new Error("Insert returned no rows"));
    return territory;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("insertTerritory", err);
  }
}

/**
 * Updates a territory node using the provided client.
 * The client must already be in a transaction (withTenant handles this).
 */
export async function updateTerritory(
  client: PoolClient,
  id: string,
  input: UpdateTerritoryInput
): Promise<Territory | null> {
  const existing = await getTerritoryById(client, id);
  if (!existing) return null;

  try {
    const sets: string[] = ["updated_at = now()"];
    const params: unknown[] = [];
    let idx = 1;

    if (input.name !== undefined) {
      params.push(trimOrEmpty(input.name) || existing.name);
      sets.push(`name = $${idx++}`);
    }
    if (input.code !== undefined) {
      params.push(trimOrNull(input.code));
      sets.push(`code = $${idx++}`);
    }
    if (input.country_code !== undefined) {
      params.push(trimOrEmpty(input.country_code));
      sets.push(`country_code = $${idx++}`);
    }
    if (input.parent_id !== undefined) {
      params.push(input.parent_id);
      sets.push(`parent_id = $${idx++}`);
    }
    if (input.kind !== undefined) {
      params.push(input.kind);
      sets.push(`kind = $${idx++}`);
    }
    if (input.metadata !== undefined) {
      params.push(input.metadata ? JSON.stringify(input.metadata) : null);
      sets.push(`metadata = $${idx++}`);
    }

    params.push(id);
    await client.query(`UPDATE territory SET ${sets.join(", ")} WHERE id = $${idx}`, params);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("updateTerritory", err);
  }

  return getTerritoryById(client, id);
}

/**
 * Soft-deletes a territory node — a hard delete would either cascade (per
 * territory.parent_id's ON DELETE SET NULL, orphaning children up a level
 * silently) or fail on FK references from identities.territory_id. Soft
 * delete keeps the node's id resolvable for historical getTerritoryPath()
 * calls while excluding it from lists/pickers going forward.
 */
export async function softDeleteTerritory(client: PoolClient, id: string): Promise<void> {
  try {
    await client.query(`UPDATE territory SET deleted_at = now() WHERE id = $1`, [id]);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("softDeleteTerritory", err);
  }
}
