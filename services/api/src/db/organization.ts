import { getDb } from "./connection.js";
import { AppError, DatabaseError } from "../errors.js";

export interface Organization {
  id: string;
  name: string;
  type: string | null;
  identifiers: Record<string, string> | null;
  region: string;
  territory_id: string | null;
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

const ORG_SORT_COLUMNS = ["name", "type", "region", "status", "created_at"] as const;

function isOrgSortColumn(s: string): s is (typeof ORG_SORT_COLUMNS)[number] {
  return ORG_SORT_COLUMNS.includes(s as (typeof ORG_SORT_COLUMNS)[number]);
}

export async function getOrganizationPaginated(
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
      `(LOWER(name) LIKE $${paramIndex} OR LOWER(COALESCE(type,'')) LIKE $${paramIndex} OR LOWER(region) LIKE $${paramIndex} OR LOWER(status) LIKE $${paramIndex})`
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
    const countResult = await getDb().query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM organization ${whereClause}`,
      params
    );
    const total = Number(countResult.rows[0]?.count ?? 0);

    const offset = (page - 1) * limit;
    params.push(limit, offset);
    const dataResult = await getDb().query<Organization>(
      `SELECT id, name, type, identifiers, region, territory_id, status, metadata, created_at, updated_at
       FROM organization ${whereClause} ORDER BY ${safeOrder} ${orderDir} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params
    );
    return { rows: dataResult.rows, total };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getOrganizationPaginated", err);
  }
}

export async function getOrganizationById(id: string): Promise<Organization | null> {
  try {
    const result = await getDb().query<Organization>(
      "SELECT id, name, type, identifiers, region, territory_id, status, metadata, created_at, updated_at FROM organization WHERE id = $1 AND deleted_at IS NULL",
      [id]
    );
    return result.rows[0] ?? null;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getOrganizationById", err);
  }
}
