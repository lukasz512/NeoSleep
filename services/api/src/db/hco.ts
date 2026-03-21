import { getDb } from "./connection.js";
import { AppError, DatabaseError } from "../errors.js";

export interface HCO {
  id: string;
  name: string;
  type: string | null;
  region: string;
  status: string;
  created_at: Date;
}

export interface GetHCOFilters {
  search?: string;
  type?: string;
  region?: string;
  status?: string;
}

const HCO_SORT_COLUMNS = ["name", "type", "region", "status", "created_at"] as const;

function isHCOSortColumn(s: string): s is (typeof HCO_SORT_COLUMNS)[number] {
  return HCO_SORT_COLUMNS.includes(s as (typeof HCO_SORT_COLUMNS)[number]);
}

export async function getHCOPaginated(
  filters: GetHCOFilters,
  page: number,
  limit: number,
  sortBy: string,
  sortOrder: "asc" | "desc"
): Promise<{ rows: HCO[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters.search?.trim()) {
    conditions.push(
      `(LOWER(name) LIKE $${paramIndex} OR LOWER(type) LIKE $${paramIndex} OR LOWER(region) LIKE $${paramIndex} OR LOWER(status) LIKE $${paramIndex})`
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

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const orderCol = isHCOSortColumn(sortBy) ? sortBy : "created_at";
  const orderDir = sortOrder === "asc" ? "ASC" : "DESC";
  const safeOrder = orderCol === "created_at" ? "created_at" : `"${orderCol}"`;

  try {
    const countResult = await getDb().query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM tbl_hco ${whereClause}`,
      params
    );
    const total = Number(countResult.rows[0]?.count ?? 0);

    const offset = (page - 1) * limit;
    params.push(limit, offset);
    const dataResult = await getDb().query<HCO>(
      `SELECT id, name, type, region, status, created_at FROM tbl_hco ${whereClause} ORDER BY ${safeOrder} ${orderDir} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params
    );
    return { rows: dataResult.rows, total };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getHCOPaginated", err);
  }
}

export async function getHCOById(id: string): Promise<HCO | null> {
  try {
    const result = await getDb().query<HCO>(
      "SELECT id, name, type, region, status, created_at FROM tbl_hco WHERE id = $1",
      [id]
    );
    return result.rows[0] ?? null;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getHCOById", err);
  }
}
