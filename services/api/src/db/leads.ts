import { getDb } from "./connection.js";
import { toArray, trimOrNull, trimOrEmpty } from "./helpers.js";

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
  /** When true, exclude leads with status=completed and updated_at older than 24h (for reps). */
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

const MOCK_LEADS: Lead[] = [
  { id: "mock-1", name: "Dr. Anna Smith",      email: "anna.smith@hospital.example", status: "contacted", region: "North",   created_at: new Date("2025-02-01T10:00:00Z"), institution: "City Hospital North" },
  { id: "mock-2", name: "Dr. Jan Kowalski",    email: "j.kowalski@clinic.example",   status: "new",       region: "Central", created_at: new Date("2025-02-02T11:00:00Z"), institution: "Clinic Central" },
  { id: "mock-3", name: "Medical Center Alpha",email: "contact@alpha-med.example",   status: "qualified", region: "South",   created_at: new Date("2025-02-03T12:00:00Z"), institution: "Medical Center Alpha" },
];

export type LeadSortColumn = "name" | "email" | "status" | "region" | "created_at";

const SORT_COLUMNS: readonly LeadSortColumn[] = ["name", "email", "status", "region", "created_at"];

function isLeadSortColumn(s: string): s is LeadSortColumn {
  return SORT_COLUMNS.includes(s as LeadSortColumn);
}

/** Server-side leads: pagination, sort, filters. */
export async function getLeadsPaginated(
  filters: GetLeadsFilters,
  page: number,
  limit: number,
  sortBy: string,
  sortOrder: "asc" | "desc"
): Promise<GetLeadsPaginatedResult> {
  const p = getDb();
  if (!p) {
    const start = (page - 1) * limit;
    return { rows: MOCK_LEADS.slice(start, start + limit), total: MOCK_LEADS.length };
  }

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

  const countResult = await p.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM tbl_leads ${whereClause}`,
    params
  );
  const total = Number(countResult.rows[0]?.count ?? 0);

  const offset = (page - 1) * limit;
  params.push(limit, offset);
  const dataResult = await p.query<Lead>(
    `SELECT id, name, email, status, region, created_at, institution FROM tbl_leads ${whereClause} ORDER BY ${safeOrder} ${orderDir} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    params
  );
  return { rows: dataResult.rows, total };
}

export async function getLeadById(id: string): Promise<Lead | null> {
  const p = getDb();
  if (!p) return MOCK_LEADS.find((l) => l.id === id) ?? null;
  try {
    const result = await p.query<Lead>(
      "SELECT id, name, email, status, region, created_at, institution FROM tbl_leads WHERE id = $1",
      [id]
    );
    return result.rows[0] ?? null;
  } catch (err) {
    console.error("getLeadById error:", err);
    return null;
  }
}

/** Insert a new lead. Returns the created lead or null on error. */
export async function insertLead(input: InsertLeadInput): Promise<Lead | null> {
  const p = getDb();
  if (!p) return null;
  try {
    const name = trimOrEmpty(input.name);
    if (!name) return null;
    const result = await p.query<Lead>(
      `INSERT INTO tbl_leads (name, email, status, region, institution)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, status, region, created_at, institution`,
      [name, trimOrNull(input.email), trimOrEmpty(input.status) || "new", trimOrEmpty(input.region), trimOrNull(input.institution)]
    );
    return result.rows[0] ?? null;
  } catch (err) {
    console.error("insertLead error:", err);
    return null;
  }
}

/** Update an existing lead. Returns the updated lead or null if not found. */
export async function updateLead(id: string, input: UpdateLeadInput): Promise<Lead | null> {
  const p = getDb();
  if (!p) return null;
  try {
    const lead = await getLeadById(id);
    if (!lead) return null;
    const result = await p.query<Lead>(
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
    console.error("updateLead error:", err);
    return null;
  }
}
