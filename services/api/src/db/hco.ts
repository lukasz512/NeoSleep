import { getDb } from "./connection.js";
import { toArray } from "./helpers.js";

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

const MOCK_HCOS: HCO[] = [
  { id: "mock-hco-01", name: "Clínica del Sueño NeoSleep",          type: "clinic",   region: "Central", status: "active", created_at: new Date("2025-08-01") },
  { id: "mock-hco-02", name: "Hospital General de Monterrey",       type: "hospital", region: "North",   status: "active", created_at: new Date("2025-08-05") },
  { id: "mock-hco-03", name: "Centro Pulmonar del Sur",             type: "hospital", region: "South",   status: "active", created_at: new Date("2025-08-10") },
  { id: "mock-hco-04", name: "Clínica Salud Integral Occidente",    type: "clinic",   region: "West",    status: "active", created_at: new Date("2025-08-15") },
  { id: "mock-hco-05", name: "Unidad de ORL y Trastornos del Sueño",type: "clinic",   region: "Central", status: "active", created_at: new Date("2025-08-20") },
];

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
  const p = getDb();
  if (!p) {
    const start = (page - 1) * limit;
    return { rows: MOCK_HCOS.slice(start, start + limit), total: MOCK_HCOS.length };
  }

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

  const countResult = await p.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM tbl_hco ${whereClause}`,
    params
  );
  const total = Number(countResult.rows[0]?.count ?? 0);

  const offset = (page - 1) * limit;
  params.push(limit, offset);
  const dataResult = await p.query<HCO>(
    `SELECT id, name, type, region, status, created_at FROM tbl_hco ${whereClause} ORDER BY ${safeOrder} ${orderDir} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    params
  );

  return { rows: dataResult.rows, total };
}

export async function getHCOById(id: string): Promise<HCO | null> {
  const p = getDb();
  if (!p) return null;
  try {
    const result = await p.query<HCO>(
      "SELECT id, name, type, region, status, created_at FROM tbl_hco WHERE id = $1",
      [id]
    );
    return result.rows[0] ?? null;
  } catch (err) {
    console.error("getHCOById error:", err);
    return null;
  }
}
