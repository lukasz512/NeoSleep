import type { PoolClient } from "pg";
import { trimOrNull, trimOrEmpty } from "./helpers.js";
import { AppError, DatabaseError, ValidationError } from "../errors.js";

export interface Organization {
  id: string;
  name: string;
  type: string | null;
  identifiers: Record<string, string> | null;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country_code: string | null;
  region: string;
  territory_id: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  google_link: string | null;
  specialties: string[];
  status: string;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

export interface GetOrganizationFilters {
  search?: string;
  type?: string;
  region?: string;
  status?: string;
}

export interface InsertOrganizationInput {
  name: string;
  type?: string;
  address_line1?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country_code?: string | null;
  region?: string;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  google_link?: string | null;
  specialties?: string[];
  status?: string;
  metadata?: Record<string, unknown> | null;
}

export interface UpdateOrganizationInput {
  name?: string;
  type?: string;
  address_line1?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country_code?: string | null;
  region?: string;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  google_link?: string | null;
  specialties?: string[];
  status?: string;
  metadata?: Record<string, unknown> | null;
}

const ORG_SORT_COLUMNS = ["name", "type", "region", "status", "created_at"] as const;

function isOrgSortColumn(s: string): s is (typeof ORG_SORT_COLUMNS)[number] {
  return ORG_SORT_COLUMNS.includes(s as (typeof ORG_SORT_COLUMNS)[number]);
}

const ORG_SELECT_COLS = `
  id, name, type, identifiers, address_line1, city, state, postal_code,
  country_code, region, territory_id, phone, email, website, google_link,
  specialties, status, metadata, created_at, updated_at`.trim();

export async function getOrganizationPaginated(
  client: PoolClient,
  filters: GetOrganizationFilters,
  page: number,
  limit: number,
  sortBy: string,
  sortOrder: "asc" | "desc"
): Promise<{ rows: Organization[]; total: number }> {
  const conditions: string[] = ["deleted_at IS NULL"];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters.search?.trim()) {
    conditions.push(
      `(LOWER(name) LIKE $${paramIndex} OR LOWER(COALESCE(type,'')) LIKE $${paramIndex} OR LOWER(COALESCE(region,'')) LIKE $${paramIndex} OR LOWER(status) LIKE $${paramIndex})`
    );
    params.push(`%${filters.search.trim().toLowerCase()}%`);
    paramIndex++;
  }
  if (filters.type?.trim()) {
    conditions.push(`type = $${paramIndex}`);
    params.push(filters.type.trim());
    paramIndex++;
  }
  if (filters.region?.trim()) {
    conditions.push(`region = $${paramIndex}`);
    params.push(filters.region.trim());
    paramIndex++;
  }
  if (filters.status?.trim()) {
    conditions.push(`status = $${paramIndex}`);
    params.push(filters.status.trim());
    paramIndex++;
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;
  const orderCol = isOrgSortColumn(sortBy) ? sortBy : "created_at";
  const orderDir = sortOrder === "asc" ? "ASC" : "DESC";
  const safeOrder = orderCol === "created_at" ? "created_at" : `"${orderCol}"`;

  try {
    const countResult = await client.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM organization ${whereClause}`,
      params
    );
    const total = Number(countResult.rows[0]?.count ?? 0);

    const offset = (page - 1) * limit;
    params.push(limit, offset);
    const dataResult = await client.query<Organization>(
      `SELECT ${ORG_SELECT_COLS}
       FROM organization ${whereClause} ORDER BY ${safeOrder} ${orderDir} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params
    );
    return { rows: dataResult.rows, total };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getOrganizationPaginated", err);
  }
}

export async function getOrganizationById(client: PoolClient, id: string): Promise<Organization | null> {
  try {
    const result = await client.query<Organization>(
      `SELECT ${ORG_SELECT_COLS} FROM organization WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    return result.rows[0] ?? null;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getOrganizationById", err);
  }
}

/**
 * Looks up an organization id by case-insensitive name match among non-deleted
 * rows (optionally excluding a given id, for update-time checks). Used by
 * commands/organization.ts to reject an explicit create/rename with a clean
 * ConflictError before the DB's unique index (organization_name_unique_idx,
 * see migrations/004_organization_name_unique_index.sql) would otherwise
 * surface as an opaque 23505 constraint violation.
 *
 * This is a different UX intent from resolveOrganizationId() in
 * db/practitioner.ts, which silently reuses/creates an organization by name
 * for the "type an institution name inline" freetext convenience flow.
 */
export async function getOrganizationIdByName(
  client: PoolClient,
  name: string,
  excludeId?: string
): Promise<string | null> {
  try {
    const result = excludeId
      ? await client.query<{ id: string }>(
          `SELECT id FROM organization WHERE LOWER(name) = LOWER($1) AND id != $2 AND deleted_at IS NULL LIMIT 1`,
          [name, excludeId]
        )
      : await client.query<{ id: string }>(
          `SELECT id FROM organization WHERE LOWER(name) = LOWER($1) AND deleted_at IS NULL LIMIT 1`,
          [name]
        );
    return result.rows[0]?.id ?? null;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getOrganizationIdByName", err);
  }
}

/**
 * Inserts an organization record using the provided client.
 * The client must already be in a transaction (withTenant handles this).
 * No BEGIN/COMMIT here — the caller owns the transaction boundary.
 */
export async function insertOrganization(client: PoolClient, input: InsertOrganizationInput): Promise<Organization> {
  const name = trimOrEmpty(input.name);
  if (!name) throw new ValidationError("Organization name is required");

  try {
    const result = await client.query<{ id: string }>(
      `INSERT INTO organization
         (name, type, address_line1, city, state, postal_code, country_code, region, phone, email, website, google_link, specialties, status, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING id`,
      [
        name,
        trimOrEmpty(input.type) || "other",
        trimOrNull(input.address_line1),
        trimOrNull(input.city),
        trimOrNull(input.state),
        trimOrNull(input.postal_code),
        trimOrNull(input.country_code),
        trimOrEmpty(input.region),
        trimOrNull(input.phone),
        trimOrNull(input.email),
        trimOrNull(input.website),
        trimOrNull(input.google_link),
        input.specialties ?? [],
        trimOrEmpty(input.status) || "active",
        input.metadata ? JSON.stringify(input.metadata) : null,
      ]
    );
    const id = result.rows[0]!.id;

    const org = await getOrganizationById(client, id);
    if (!org) throw new DatabaseError("insertOrganization", new Error("Insert returned no rows"));
    return org;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("insertOrganization", err);
  }
}

/**
 * Updates organization fields using the provided client.
 * The client must already be in a transaction (withTenant handles this).
 */
export async function updateOrganization(client: PoolClient, id: string, input: UpdateOrganizationInput): Promise<Organization | null> {
  const existing = await getOrganizationById(client, id);
  if (!existing) return null;

  try {
    const sets: string[] = ["updated_at = now()"];
    const params: unknown[] = [];
    let idx = 1;

    if (input.name !== undefined) {
      params.push(trimOrEmpty(input.name) || existing.name);
      sets.push(`name = $${idx++}`);
    }
    if (input.type !== undefined) {
      params.push(input.type);
      sets.push(`type = $${idx++}`);
    }
    if (input.address_line1 !== undefined) {
      params.push(trimOrNull(input.address_line1));
      sets.push(`address_line1 = $${idx++}`);
    }
    if (input.city !== undefined) {
      params.push(trimOrNull(input.city));
      sets.push(`city = $${idx++}`);
    }
    if (input.state !== undefined) {
      params.push(trimOrNull(input.state));
      sets.push(`state = $${idx++}`);
    }
    if (input.postal_code !== undefined) {
      params.push(trimOrNull(input.postal_code));
      sets.push(`postal_code = $${idx++}`);
    }
    if (input.country_code !== undefined) {
      params.push(trimOrNull(input.country_code));
      sets.push(`country_code = $${idx++}`);
    }
    if (input.region !== undefined) {
      params.push(trimOrEmpty(input.region));
      sets.push(`region = $${idx++}`);
    }
    if (input.phone !== undefined) {
      params.push(trimOrNull(input.phone));
      sets.push(`phone = $${idx++}`);
    }
    if (input.email !== undefined) {
      params.push(trimOrNull(input.email));
      sets.push(`email = $${idx++}`);
    }
    if (input.website !== undefined) {
      params.push(trimOrNull(input.website));
      sets.push(`website = $${idx++}`);
    }
    if (input.google_link !== undefined) {
      params.push(trimOrNull(input.google_link));
      sets.push(`google_link = $${idx++}`);
    }
    if (input.specialties !== undefined) {
      params.push(input.specialties ?? []);
      sets.push(`specialties = $${idx++}`);
    }
    if (input.status !== undefined) {
      params.push(input.status);
      sets.push(`status = $${idx++}`);
    }
    if (input.metadata !== undefined) {
      params.push(input.metadata ? JSON.stringify(input.metadata) : null);
      sets.push(`metadata = $${idx++}`);
    }

    params.push(id);
    await client.query(`UPDATE organization SET ${sets.join(", ")} WHERE id = $${idx}`, params);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("updateOrganization", err);
  }

  return getOrganizationById(client, id);
}

/**
 * Soft-deletes an organization by setting deleted_at — status is left
 * untouched (every read query already filters deleted_at IS NULL, so that
 * alone is sufficient for visibility; see softDeleteLead for the same call).
 */
export async function softDeleteOrganization(client: PoolClient, id: string): Promise<void> {
  try {
    await client.query(`UPDATE organization SET deleted_at = now() WHERE id = $1`, [id]);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("softDeleteOrganization", err);
  }
}
