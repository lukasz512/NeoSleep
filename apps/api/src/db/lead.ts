import type { PoolClient } from "pg";
import { toArray, trimOrNull, trimOrEmpty } from "./helpers.js";
import { AppError, DatabaseError, ValidationError } from "../errors.js";

export interface Lead {
  id: string;
  identity_id: string;
  // From identities JOIN
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  // From lead table
  source: string | null;
  status: string;
  country_code: string | null;
  converted_to_id: string | null;
  converted_to_type: string | null;
  converted_at: Date | null;
  region: string;
  assigned_to: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
  // Computed for backward compat
  name: string;
}

export interface GetLeadsFilters {
  search?: string;
  status?: string | string[];
  region?: string | string[];
  hideCompletedOlderThan24h?: boolean;
}

export interface GetLeadsPaginatedResult {
  rows: Lead[];
  total: number;
}

export interface InsertLeadInput {
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;
  status?: string;
  region?: string;
  source?: string | null;
  assigned_to?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface UpdateLeadInput {
  first_name?: string;
  last_name?: string;
  email?: string | null;
  phone?: string | null;
  status?: string;
  region?: string;
  source?: string | null;
  assigned_to?: string | null;
  metadata?: Record<string, unknown> | null;
}

export type LeadSortColumn = "first_name" | "last_name" | "email" | "status" | "region" | "created_at";

const SORT_COLUMNS: readonly LeadSortColumn[] = ["first_name", "last_name", "email", "status", "region", "created_at"];

function isLeadSortColumn(s: string): s is LeadSortColumn {
  return SORT_COLUMNS.includes(s as LeadSortColumn);
}

const LEAD_SELECT_COLS = `
  l.id, l.identity_id, l.source, l.status, l.country_code,
  l.converted_to_id, l.converted_to_type, l.converted_at, l.region,
  l.assigned_to, l.metadata, l.created_at, l.updated_at,
  i.first_name, i.last_name, i.email, i.phone`.trim();

function buildName(row: { first_name: string; last_name: string }): string {
  return `${row.first_name} ${row.last_name}`.trim();
}

type LeadRow = Omit<Lead, "name"> & { first_name: string; last_name: string };

function attachName(row: LeadRow): Lead {
  return { ...row, name: buildName(row) };
}

export async function getLeadsPaginated(
  client: PoolClient,
  filters: GetLeadsFilters,
  page: number,
  limit: number,
  sortBy: string,
  sortOrder: "asc" | "desc"
): Promise<GetLeadsPaginatedResult> {
  const conditions: string[] = ["l.deleted_at IS NULL"];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters.search?.trim()) {
    conditions.push(
      `(LOWER(i.first_name || ' ' || i.last_name) LIKE $${paramIndex} OR LOWER(COALESCE(i.email,'')) LIKE $${paramIndex} OR LOWER(l.status) LIKE $${paramIndex} OR LOWER(l.region) LIKE $${paramIndex})`
    );
    params.push(`%${filters.search.trim().toLowerCase()}%`);
    paramIndex++;
  }
  const statusArr = toArray(filters.status);
  if (statusArr.length > 0) {
    conditions.push(`l.status = ANY($${paramIndex}::text[])`);
    params.push(statusArr);
    paramIndex++;
  }
  const regionArr = toArray(filters.region);
  if (regionArr.length > 0) {
    conditions.push(`l.region = ANY($${paramIndex}::text[])`);
    params.push(regionArr);
    paramIndex++;
  }
  if (filters.hideCompletedOlderThan24h) {
    conditions.push(`(l.status IS NULL OR LOWER(l.status) != 'completed' OR COALESCE(l.updated_at, l.created_at) >= now() - interval '24 hours')`);
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;
  const orderCol = isLeadSortColumn(sortBy) ? sortBy : "created_at";
  const orderDir = sortOrder === "asc" ? "ASC" : "DESC";
  const identityCols: LeadSortColumn[] = ["first_name", "last_name", "email"];
  const safeOrder = identityCols.includes(orderCol as LeadSortColumn)
    ? `i."${orderCol}"`
    : orderCol === "created_at"
      ? "l.created_at"
      : `l."${orderCol}"`;

  try {
    const countResult = await client.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM lead l JOIN identities i ON l.identity_id = i.id ${whereClause}`,
      params
    );
    const total = Number(countResult.rows[0]?.count ?? 0);

    const offset = (page - 1) * limit;
    params.push(limit, offset);
    const dataResult = await client.query<LeadRow>(
      `SELECT ${LEAD_SELECT_COLS}
       FROM lead l JOIN identities i ON l.identity_id = i.id
       ${whereClause} ORDER BY ${safeOrder} ${orderDir} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params
    );
    return { rows: dataResult.rows.map(attachName), total };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getLeadsPaginated", err);
  }
}

export async function getLeadById(client: PoolClient, id: string): Promise<Lead | null> {
  try {
    const result = await client.query<LeadRow>(
      `SELECT ${LEAD_SELECT_COLS}
       FROM lead l JOIN identities i ON l.identity_id = i.id
       WHERE l.id = $1 AND l.deleted_at IS NULL`,
      [id]
    );
    const row = result.rows[0];
    return row ? attachName(row) : null;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getLeadById", err);
  }
}

/**
 * Inserts a lead + identity record using the provided client.
 * The client must already be in a transaction (withTenant handles this).
 * No BEGIN/COMMIT here — the caller owns the transaction boundary.
 */
export async function insertLead(client: PoolClient, input: InsertLeadInput): Promise<Lead> {
  const firstName = trimOrEmpty(input.first_name);
  const lastName = trimOrEmpty(input.last_name);
  if (!firstName || !lastName) throw new ValidationError("Lead first_name and last_name are required");

  try {
    const identityResult = await client.query<{ id: string }>(
      `INSERT INTO identities (first_name, last_name, email, phone)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [firstName, lastName, trimOrNull(input.email), trimOrNull(input.phone)]
    );
    const identityId = identityResult.rows[0]!.id;

    const leadResult = await client.query<{ id: string }>(
      `INSERT INTO lead (identity_id, status, region, source, assigned_to, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        identityId,
        trimOrEmpty(input.status) || "new",
        trimOrEmpty(input.region),
        trimOrNull(input.source),
        trimOrNull(input.assigned_to),
        input.metadata ? JSON.stringify(input.metadata) : null,
      ]
    );
    const leadId = leadResult.rows[0]!.id;

    const lead = await getLeadById(client, leadId);
    if (!lead) throw new DatabaseError("insertLead", new Error("Insert returned no rows"));
    return lead;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("insertLead", err);
  }
}

/**
 * Updates lead + identity fields using the provided client.
 * The client must already be in a transaction (withTenant handles this).
 */
export async function updateLead(client: PoolClient, id: string, input: UpdateLeadInput): Promise<Lead | null> {
  const lead = await getLeadById(client, id);
  if (!lead) return null;

  try {
    // Update identity fields
    const identitySets: string[] = ["updated_at = now()"];
    const identityParams: unknown[] = [];
    let iidx = 1;

    if (input.first_name !== undefined) {
      identityParams.push(trimOrEmpty(input.first_name) || lead.first_name);
      identitySets.push(`first_name = $${iidx++}`);
    }
    if (input.last_name !== undefined) {
      identityParams.push(trimOrEmpty(input.last_name) || lead.last_name);
      identitySets.push(`last_name = $${iidx++}`);
    }
    if (input.email !== undefined) {
      identityParams.push(trimOrNull(input.email));
      identitySets.push(`email = $${iidx++}`);
    }
    if (input.phone !== undefined) {
      identityParams.push(trimOrNull(input.phone));
      identitySets.push(`phone = $${iidx++}`);
    }
    identityParams.push(lead.identity_id);
    await client.query(
      `UPDATE identities SET ${identitySets.join(", ")} WHERE id = $${iidx}`,
      identityParams
    );

    // Update lead fields
    const leadSets: string[] = ["updated_at = now()"];
    const leadParams: unknown[] = [];
    let lidx = 1;

    if (input.status !== undefined) {
      leadParams.push(input.status);
      leadSets.push(`status = $${lidx++}`);
    }
    if (input.region !== undefined) {
      leadParams.push(input.region);
      leadSets.push(`region = $${lidx++}`);
    }
    if (input.source !== undefined) {
      leadParams.push(trimOrNull(input.source));
      leadSets.push(`source = $${lidx++}`);
    }
    if (input.assigned_to !== undefined) {
      leadParams.push(trimOrNull(input.assigned_to));
      leadSets.push(`assigned_to = $${lidx++}`);
    }
    if (input.metadata !== undefined) {
      leadParams.push(input.metadata ? JSON.stringify(input.metadata) : null);
      leadSets.push(`metadata = $${lidx++}`);
    }
    leadParams.push(id);
    await client.query(
      `UPDATE lead SET ${leadSets.join(", ")} WHERE id = $${lidx}`,
      leadParams
    );
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("updateLead", err);
  }

  return getLeadById(client, id);
}

export interface ConvertLeadInput {
  converted_to_id: string;
  // DB CHECK constraint (lead_converted_to_type_check) only allows these two
  // lowercase values (or NULL) — see infrastructure/db/schema-snapshot.sql.
  converted_to_type: "practitioner" | "organization";
}

/**
 * Atomically marks a lead as converted: sets status='converted' plus
 * converted_to_id/converted_to_type/converted_at in a single write.
 * Kept separate from updateLead() so the "convert" transition (and its own
 * audit action) stays explicit rather than folded into a generic partial update.
 * The client must already be in a transaction (withTenant handles this).
 */
export async function convertLead(client: PoolClient, id: string, input: ConvertLeadInput): Promise<Lead | null> {
  const lead = await getLeadById(client, id);
  if (!lead) return null;

  try {
    await client.query(
      `UPDATE lead
       SET status = 'converted', converted_to_id = $1, converted_to_type = $2,
           converted_at = now(), updated_at = now()
       WHERE id = $3`,
      [input.converted_to_id, input.converted_to_type, id]
    );
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("convertLead", err);
  }

  return getLeadById(client, id);
}
