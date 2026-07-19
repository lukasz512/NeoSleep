import type { PoolClient } from "pg";
import { toArray, trimOrNull, trimOrEmpty } from "./helpers.js";
import { AppError, DatabaseError, ValidationError } from "../errors.js";

export interface Practitioner {
  id: string;
  identity_id: string;
  // From identities JOIN
  salutation: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  language: string | null;
  social_links: Record<string, unknown> | null;
  // From practitioner table
  organization_id: string | null;
  national_ids: Record<string, string> | null;
  primary_specialty: string | null;
  specialties: string[];
  influence_tier: string;
  region: string;
  territory_id: string | null;
  status: string;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
  // Computed from organization JOIN
  institution: string | null;
}

export interface GetPractitionerFilters {
  search?: string;
  specialty?: string | string[];
  institution?: string | string[];
  region?: string | string[];
}

export interface InsertPractitionerInput {
  first_name: string;
  last_name: string;
  salutation?: string | null;
  email?: string | null;
  phone?: string | null;
  primary_specialty?: string | null;
  /** Prefer this when the clinic is already a known organization id — falls
   *  back to the freetext institution-name-resolve flow only when absent. */
  organization_id?: string | null;
  institution?: string | null;
  region?: string;
  influence_tier?: string;
  language?: string | null;
  national_ids?: Record<string, string> | null;
  social_links?: Record<string, unknown> | null;
}

export interface UpdatePractitionerInput {
  first_name?: string;
  last_name?: string;
  salutation?: string | null;
  email?: string | null;
  phone?: string | null;
  primary_specialty?: string | null;
  organization_id?: string | null;
  institution?: string | null;
  region?: string;
  influence_tier?: string;
  language?: string | null;
  national_ids?: Record<string, string> | null;
  social_links?: Record<string, unknown> | null;
}

const PRAC_SORT_COLUMNS = ["first_name", "last_name", "email", "primary_specialty", "region", "influence_tier", "created_at"] as const;

const PRAC_SELECT_COLS = `
  p.id, p.identity_id, p.organization_id, p.national_ids,
  p.primary_specialty, p.specialties, p.influence_tier,
  p.region, p.territory_id, p.status, p.metadata,
  p.created_at, p.updated_at,
  i.title AS salutation, i.first_name, i.last_name, i.email, i.phone, i.language, i.social_links,
  o.name AS institution`.trim();

function isPracSortColumn(s: string): s is (typeof PRAC_SORT_COLUMNS)[number] {
  return PRAC_SORT_COLUMNS.includes(s as (typeof PRAC_SORT_COLUMNS)[number]);
}

/**
 * Resolves or creates an organization by name, using the tenant-scoped client.
 * Must run on the same client as the surrounding transaction.
 */
async function resolveOrganizationId(
  client: PoolClient,
  name: string,
  region: string
): Promise<{ id: string; name: string }> {
  // No unique constraint on organization.name exists, so this can't be an
  // ON CONFLICT upsert — look up first, insert only if nothing matched.
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM organization WHERE name = $1 AND deleted_at IS NULL LIMIT 1`,
    [name]
  );
  if (existing.rows[0]) return { id: existing.rows[0].id, name };

  const inserted = await client.query<{ id: string }>(
    `INSERT INTO organization (name, region, status) VALUES ($1, $2, 'active') RETURNING id`,
    [name, region]
  );
  return { id: inserted.rows[0]!.id, name };
}

export async function getPractitionerPaginated(
  client: PoolClient,
  filters: GetPractitionerFilters,
  page: number,
  limit: number,
  sortBy: string,
  sortOrder: "asc" | "desc"
): Promise<{ rows: Practitioner[]; total: number }> {
  const conditions: string[] = ["p.deleted_at IS NULL"];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters.search?.trim()) {
    conditions.push(
      `(LOWER(i.first_name) LIKE $${paramIndex} OR LOWER(i.last_name) LIKE $${paramIndex} OR LOWER(COALESCE(i.email,'')) LIKE $${paramIndex} OR LOWER(COALESCE(p.primary_specialty,'')) LIKE $${paramIndex} OR LOWER(COALESCE(o.name,'')) LIKE $${paramIndex} OR LOWER(p.region) LIKE $${paramIndex})`
    );
    params.push(`%${filters.search.trim().toLowerCase()}%`);
    paramIndex++;
  }
  const specialtyArr = toArray(filters.specialty);
  if (specialtyArr.length > 0) {
    conditions.push(`p.primary_specialty = ANY($${paramIndex}::text[])`);
    params.push(specialtyArr);
    paramIndex++;
  }
  const institutionArr = toArray(filters.institution);
  if (institutionArr.length > 0) {
    conditions.push(`o.name = ANY($${paramIndex}::text[])`);
    params.push(institutionArr);
    paramIndex++;
  }
  const regionArr = toArray(filters.region);
  if (regionArr.length > 0) {
    conditions.push(`p.region = ANY($${paramIndex}::text[])`);
    params.push(regionArr);
    paramIndex++;
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;
  const orderCol = isPracSortColumn(sortBy) ? sortBy : "created_at";
  const orderDir = sortOrder === "asc" ? "ASC" : "DESC";
  const safeOrder = orderCol === "created_at" ? "p.created_at" : `i."${orderCol}"`;

  try {
    const countResult = await client.query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM practitioner p
       JOIN identities i ON p.identity_id = i.id
       LEFT JOIN organization o ON p.organization_id = o.id
       ${whereClause}`,
      params
    );
    const total = Number(countResult.rows[0]?.count ?? 0);

    const offset = (page - 1) * limit;
    params.push(limit, offset);
    const dataResult = await client.query<Practitioner>(
      `SELECT ${PRAC_SELECT_COLS}
       FROM practitioner p
       JOIN identities i ON p.identity_id = i.id
       LEFT JOIN organization o ON p.organization_id = o.id
       ${whereClause} ORDER BY ${safeOrder} ${orderDir} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params
    );
    return { rows: dataResult.rows, total };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getPractitionerPaginated", err);
  }
}

export async function getPractitionerById(client: PoolClient, id: string): Promise<Practitioner | null> {
  try {
    const result = await client.query<Practitioner>(
      `SELECT ${PRAC_SELECT_COLS}
       FROM practitioner p
       JOIN identities i ON p.identity_id = i.id
       LEFT JOIN organization o ON p.organization_id = o.id
       WHERE p.id = $1 AND p.deleted_at IS NULL`,
      [id]
    );
    return result.rows[0] ?? null;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getPractitionerById", err);
  }
}

/**
 * Inserts a practitioner + identity record using the provided client.
 * The client must already be in a transaction (withTenant handles this).
 * No BEGIN/COMMIT here — the caller owns the transaction boundary.
 */
export async function insertPractitioner(client: PoolClient, input: InsertPractitionerInput): Promise<Practitioner> {
  const firstName = trimOrEmpty(input.first_name);
  const lastName = trimOrEmpty(input.last_name);
  if (!firstName || !lastName) throw new ValidationError("Practitioner first_name and last_name are required");

  const region = trimOrEmpty(input.region);

  try {
    const orgId = input.organization_id !== undefined
      ? input.organization_id
      : input.institution?.trim()
        ? (await resolveOrganizationId(client, input.institution.trim(), region)).id
        : null;

    const identityResult = await client.query<{ id: string }>(
      `INSERT INTO identities (title, first_name, last_name, email, phone, language, social_links)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        trimOrNull(input.salutation),
        firstName,
        lastName,
        trimOrNull(input.email),
        trimOrNull(input.phone),
        trimOrNull(input.language),
        JSON.stringify(input.social_links ?? {}),
      ]
    );
    const identityId = identityResult.rows[0]!.id;

    const pracResult = await client.query<{ id: string }>(
      `INSERT INTO practitioner (identity_id, organization_id, primary_specialty, influence_tier, region, status, national_ids)
       VALUES ($1, $2, $3, $4, $5, 'active', $6)
       RETURNING id`,
      [
        identityId,
        orgId ?? null,
        trimOrNull(input.primary_specialty),
        input.influence_tier ?? "C",
        region,
        input.national_ids ? JSON.stringify(input.national_ids) : null,
      ]
    );
    const pracId = pracResult.rows[0]!.id;

    const row = await getPractitionerById(client, pracId);
    if (!row) throw new DatabaseError("insertPractitioner", new Error("Insert returned no rows"));
    return row;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("insertPractitioner", err);
  }
}

/**
 * Updates practitioner + identity fields using the provided client.
 * The client must already be in a transaction (withTenant handles this).
 */
export async function updatePractitioner(client: PoolClient, id: string, input: UpdatePractitionerInput): Promise<Practitioner | null> {
  const existing = await getPractitionerById(client, id);
  if (!existing) return null;

  try {
    const firstName = input.first_name !== undefined ? trimOrEmpty(input.first_name) : existing.first_name;
    const lastName = input.last_name !== undefined ? trimOrEmpty(input.last_name) : existing.last_name;
    const salutation = input.salutation !== undefined ? trimOrNull(input.salutation) : existing.salutation;
    const email = input.email !== undefined ? trimOrNull(input.email) : existing.email;
    const phone = input.phone !== undefined ? trimOrNull(input.phone) : existing.phone;
    const language = input.language !== undefined ? trimOrNull(input.language) : existing.language;
    const primarySpecialty = input.primary_specialty !== undefined ? trimOrNull(input.primary_specialty) : existing.primary_specialty;
    const region = input.region ?? existing.region ?? "";
    const influenceTier = input.influence_tier ?? existing.influence_tier;
    const nationalIds = input.national_ids !== undefined ? input.national_ids : existing.national_ids;
    const socialLinks = input.social_links !== undefined ? input.social_links : existing.social_links;

    let orgId: string | null;
    if (input.organization_id !== undefined) {
      orgId = input.organization_id;
    } else {
      const institutionInput = input.institution !== undefined ? trimOrNull(input.institution) : (existing.institution ?? null);
      orgId = institutionInput ? (await resolveOrganizationId(client, institutionInput, region)).id : null;
    }

    await client.query(
      `UPDATE identities SET title = $1, first_name = $2, last_name = $3, email = $4, phone = $5, language = $6, social_links = $7, updated_at = now()
       WHERE id = $8`,
      [salutation, firstName, lastName, email, phone, language, JSON.stringify(socialLinks ?? {}), existing.identity_id]
    );

    await client.query(
      `UPDATE practitioner SET organization_id = $1, primary_specialty = $2, influence_tier = $3, region = $4, national_ids = $5, updated_at = now()
       WHERE id = $6`,
      [orgId ?? null, primarySpecialty, influenceTier, region, nationalIds ? JSON.stringify(nationalIds) : null, id]
    );
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("updatePractitioner", err);
  }

  return getPractitionerById(client, id);
}
