import { getDb } from "./connection.js";
import { toArray, trimOrNull, trimOrEmpty } from "./helpers.js";
import { AppError, DatabaseError, ValidationError } from "../errors.js";

export interface Lead {
  id: string;
  name: string;
  email: string | null;
  status: string;
  region: string;
  created_at: Date;
  institution?: string | null;
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
  name: string;
  email?: string | null;
  status?: string;
  region?: string;
  institution?: string | null;
}

export interface UpdateLeadInput {
  name?: string;
  email?: string | null;
  status?: string;
  region?: string;
  institution?: string | null;
}

export type LeadSortColumn = "name" | "email" | "status" | "region" | "created_at";

const SORT_COLUMNS: readonly LeadSortColumn[] = ["name", "email", "status", "region", "created_at"];

function isLeadSortColumn(s: string): s is LeadSortColumn {
  return SORT_COLUMNS.includes(s as LeadSortColumn);
}

export async function getLeadsPaginated(
  filters: GetLeadsFilters,
  page: number,
  limit: number,
  sortBy: string,
  sortOrder: "asc" | "desc"
): Promise<GetLeadsPaginatedResult> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters.search?.trim()) {
    conditions.push(`(LOWER(name) LIKE $${paramIndex} OR LOWER(COALESCE(email,'')) LIKE $${paramIndex} OR LOWER(status) LIKE $${paramIndex} OR LOWER(region) LIKE $${paramIndex})`);
    params.push(`%${filters.search.trim().toLowerCase()}%`);
    paramIndex++;
  }
  const statusArr = toArray(filters.status);
  if (statusArr.length > 0) {
    conditions.push(`status = ANY($${paramIndex}::text[])`);
    params.push(statusArr);
    paramIndex++;
  }
  const regionArr = toArray(filters.region);
  if (regionArr.length > 0) {
    conditions.push(`region = ANY($${paramIndex}::text[])`);
    params.push(regionArr);
    paramIndex++;
  }
  if (filters.hideCompletedOlderThan24h) {
    conditions.push(`(status IS NULL OR LOWER(status) != 'completed' OR COALESCE(updated_at, created_at) >= now() - interval '24 hours')`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const orderCol = isLeadSortColumn(sortBy) ? sortBy : "created_at";
  const orderDir = sortOrder === "asc" ? "ASC" : "DESC";
  const safeOrder = orderCol === "created_at" ? "created_at" : `"${orderCol}"`;

  try {
    const countResult = await getDb().query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM tbl_leads ${whereClause}`,
      params
    );
    const total = Number(countResult.rows[0]?.count ?? 0);

    const offset = (page - 1) * limit;
    params.push(limit, offset);
    const dataResult = await getDb().query<Lead>(
      `SELECT id, name, email, status, region, created_at, institution FROM tbl_leads ${whereClause} ORDER BY ${safeOrder} ${orderDir} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params
    );
    return { rows: dataResult.rows, total };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getLeadsPaginated", err);
  }
}

export async function getLeadById(id: string): Promise<Lead | null> {
  try {
    const result = await getDb().query<Lead>(
      "SELECT id, name, email, status, region, created_at, institution FROM tbl_leads WHERE id = $1",
      [id]
    );
    return result.rows[0] ?? null;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getLeadById", err);
  }
}

export async function insertLead(input: InsertLeadInput): Promise<Lead> {
  const name = trimOrEmpty(input.name);
  if (!name) throw new ValidationError("Lead name is required");
  try {
    const result = await getDb().query<Lead>(
      `INSERT INTO tbl_leads (name, email, status, region, institution)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, status, region, created_at, institution`,
      [name, trimOrNull(input.email), trimOrEmpty(input.status) || "new", trimOrEmpty(input.region), trimOrNull(input.institution)]
    );
    if (!result.rows[0]) throw new DatabaseError("insertLead", new Error("Insert returned no rows"));
    return result.rows[0];
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("insertLead", err);
  }
}

export async function updateLead(id: string, input: UpdateLeadInput): Promise<Lead | null> {
  const lead = await getLeadById(id);
  if (!lead) return null;
  try {
    const result = await getDb().query<Lead>(
      `UPDATE tbl_leads SET name = $1, email = $2, status = $3, region = $4, institution = $5, updated_at = now() WHERE id = $6
       RETURNING id, name, email, status, region, created_at, institution`,
      [
        input.name !== undefined ? trimOrEmpty(input.name) : lead.name,
        input.email !== undefined ? trimOrNull(input.email) : lead.email,
        input.status ?? lead.status,
        input.region ?? lead.region,
        input.institution !== undefined ? trimOrNull(input.institution) : (lead.institution ?? null),
        id,
      ]
    );
    return result.rows[0] ?? null;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("updateLead", err);
  }
}
