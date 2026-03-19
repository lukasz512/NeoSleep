import { getPool } from "./pool.js";
import { toArray, trimOrNull, trimOrEmpty } from "./helpers.js";

export interface HCPRow {
  id: string;
  name: string;
  email: string | null;
  phone?: string | null;
  specialty: string | null;
  institution: string | null;
  region: string;
  created_at: Date;
}

export interface GetHCPFilters {
  search?: string;
  specialty?: string | string[];
  institution?: string | string[];
  region?: string | string[];
}

export interface InsertHCPInput {
  name: string;
  email: string;
  phone: string;
  specialty?: string | null;
  institution?: string | null;
  region?: string;
  lead_id?: string | null;
}

export interface UpdateHCPInput {
  name?: string;
  email?: string;
  phone?: string;
  specialty?: string | null;
  institution?: string | null;
  region?: string;
}

const MOCK_HCPS: HCPRow[] = [
  { id: "mock-hcp-01", name: "Dr Anna Kowalska",        email: "a.kowalska@neosleep.example",     phone: null, specialty: "Pulmonology",       institution: "NeoSleep Care Center",           region: "Central", created_at: new Date("2025-09-01") },
  { id: "mock-hcp-02", name: "Dr Piotr Nowak",           email: "p.nowak@neosleep.example",        phone: null, specialty: "Sleep medicine",    institution: "NeoSleep Care Center",           region: "Central", created_at: new Date("2025-09-05") },
  { id: "mock-hcp-03", name: "Dr Maria Wiśniewska",      email: "m.wisniewska@hospital.example",   phone: null, specialty: "Neurology",         institution: "City Hospital North",            region: "North",   created_at: new Date("2025-09-08") },
  { id: "mock-hcp-04", name: "Dr Jan Zieliński",         email: "j.zielinski@hospital.example",    phone: null, specialty: "Internal medicine", institution: "City Hospital North",            region: "North",   created_at: new Date("2025-09-10") },
  { id: "mock-hcp-05", name: "Dr Katarzyna Wójcik",      email: "k.wojcik@pulm-south.example",     phone: null, specialty: "ENT",               institution: "Centrum Pulmonologii Południe",  region: "South",   created_at: new Date("2025-09-12") },
  { id: "mock-hcp-06", name: "Dr Marek Kowalczyk",       email: "m.kowalczyk@pulm-south.example",  phone: null, specialty: "Pulmonology",       institution: "Centrum Pulmonologii Południe",  region: "South",   created_at: new Date("2025-09-14") },
  { id: "mock-hcp-07", name: "Dr Agnieszka Lewandowska", email: "a.lewandowska@klinika-z.example", phone: null, specialty: "Sleep medicine",    institution: "Klinika Zdrowia Zachód",         region: "West",    created_at: new Date("2025-09-16") },
  { id: "mock-hcp-08", name: "Dr Tomasz Dąbrowski",      email: "t.dabrowski@klinika-z.example",   phone: null, specialty: "Family medicine",   institution: "Klinika Zdrowia Zachód",         region: "West",    created_at: new Date("2025-09-18") },
  { id: "mock-hcp-09", name: "Dr Ewa Szymańska",         email: "e.szymanska@entclinic.example",   phone: null, specialty: "Pneumonology",      institution: "ENT & Sleep Clinic Centrum",     region: "Central", created_at: new Date("2025-09-20") },
  { id: "mock-hcp-10", name: "Dr Robert Wiśniewski",     email: "r.wisniewski@hospital.example",   phone: null, specialty: "ENT",               institution: "City Hospital North",            region: "North",   created_at: new Date("2025-09-22") },
  { id: "mock-hcp-11", name: "Dr Natalia Kaczmarek",     email: "n.kaczmarek@pulm-south.example",  phone: null, specialty: "Sleep medicine",    institution: "Centrum Pulmonologii Południe",  region: "South",   created_at: new Date("2025-09-24") },
  { id: "mock-hcp-12", name: "Dr Paweł Jankowski",       email: "p.jankowski@neosleep.example",    phone: null, specialty: "Internal medicine", institution: "NeoSleep Care Center",           region: "Central", created_at: new Date("2025-09-26") },
];

const HCP_SORT_COLUMNS = ["name", "email", "specialty", "region", "created_at"] as const;

function isHCPSortColumn(s: string): s is (typeof HCP_SORT_COLUMNS)[number] {
  return HCP_SORT_COLUMNS.includes(s as (typeof HCP_SORT_COLUMNS)[number]);
}

/** Find or create HCO by name. Uses INSERT ON CONFLICT to avoid race conditions. */
async function resolveHcoId(
  p: NonNullable<ReturnType<typeof getPool>>,
  institution: string,
  region: string
): Promise<{ id: string; name: string }> {
  const result = await p.query<{ id: string }>(
    `INSERT INTO tbl_hco (name, region, status) VALUES ($1, $2, 'active')
     ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [institution, region]
  );
  return { id: result.rows[0]!.id, name: institution };
}

export async function getHCPPaginated(
  filters: GetHCPFilters,
  page: number,
  limit: number,
  sortBy: string,
  sortOrder: "asc" | "desc"
): Promise<{ rows: HCPRow[]; total: number }> {
  const p = getPool();
  if (!p) {
    const start = (page - 1) * limit;
    return { rows: MOCK_HCPS.slice(start, start + limit), total: MOCK_HCPS.length };
  }

  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters.search?.trim()) {
    conditions.push(
      `(LOWER(h.name) LIKE $${paramIndex} OR LOWER(COALESCE(h.email,'')) LIKE $${paramIndex} OR LOWER(COALESCE(h.specialty,'')) LIKE $${paramIndex} OR LOWER(COALESCE(o.name,'')) LIKE $${paramIndex} OR LOWER(h.region) LIKE $${paramIndex})`
    );
    params.push(`%${filters.search.trim().toLowerCase()}%`);
    paramIndex++;
  }
  const specialtyArr = toArray(filters.specialty);
  if (specialtyArr.length > 0) {
    conditions.push(`h.specialty = ANY($${paramIndex}::text[])`);
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
    conditions.push(`h.region = ANY($${paramIndex}::text[])`);
    params.push(regionArr);
    paramIndex++;
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const orderCol = isHCPSortColumn(sortBy) ? sortBy : "created_at";
  const orderDir = sortOrder === "asc" ? "ASC" : "DESC";
  const safeOrder = orderCol === "created_at" ? "h.created_at" : `h."${orderCol}"`;

  const countResult = await p.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM tbl_hcp h LEFT JOIN tbl_hco o ON h.hco_id = o.id ${whereClause}`,
    params
  );
  const total = Number(countResult.rows[0]?.count ?? 0);

  const offset = (page - 1) * limit;
  params.push(limit, offset);
  const dataResult = await p.query<HCPRow>(
    `SELECT h.id, h.name, h.email, h.specialty, o.name AS institution, h.region, h.created_at
     FROM tbl_hcp h LEFT JOIN tbl_hco o ON h.hco_id = o.id
     ${whereClause} ORDER BY ${safeOrder} ${orderDir} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    params
  );
  return { rows: dataResult.rows, total };
}

export async function getHCPById(id: string): Promise<HCPRow | null> {
  const p = getPool();
  if (!p) return null;
  try {
    const result = await p.query<HCPRow>(
      `SELECT h.id, h.name, h.email, h.phone, h.specialty, o.name AS institution, h.region, h.created_at
       FROM tbl_hcp h LEFT JOIN tbl_hco o ON h.hco_id = o.id WHERE h.id = $1`,
      [id]
    );
    return result.rows[0] ?? null;
  } catch (err) {
    console.error("getHCPById error:", err);
    return null;
  }
}

export async function insertHCP(input: InsertHCPInput): Promise<HCPRow | null> {
  const p = getPool();
  if (!p) return null;
  try {
    const name = trimOrEmpty(input.name);
    const email = trimOrEmpty(input.email);
    const phone = trimOrEmpty(input.phone);
    if (!name || !email || !phone) return null;

    const hco = input.institution?.trim()
      ? await resolveHcoId(p, input.institution.trim(), trimOrEmpty(input.region))
      : null;

    const result = await p.query<HCPRow>(
      `INSERT INTO tbl_hcp (name, email, phone, specialty, hco_id, region, status, lead_id)
       VALUES ($1, $2, $3, $4, $5, $6, 'active', $7)
       RETURNING id, name, email, specialty, region, created_at`,
      [name, email, phone, trimOrNull(input.specialty), hco?.id ?? null, trimOrEmpty(input.region), trimOrNull(input.lead_id)]
    );
    const row = result.rows[0];
    if (!row) return null;
    return { ...row, institution: hco?.name ?? null };
  } catch (err) {
    console.error("insertHCP error:", err);
    return null;
  }
}

export async function updateHCP(id: string, input: UpdateHCPInput): Promise<HCPRow | null> {
  const p = getPool();
  if (!p) return null;
  const existing = await getHCPById(id);
  if (!existing) return null;
  try {
    const name = input.name !== undefined ? trimOrEmpty(input.name) : existing.name;
    const email = input.email !== undefined ? trimOrEmpty(input.email) : (existing.email ?? "");
    const phone = input.phone !== undefined ? trimOrEmpty(input.phone) : (existing.phone ?? "");
    const specialty = input.specialty !== undefined ? trimOrNull(input.specialty) : (existing.specialty ?? null);
    const region = input.region ?? existing.region ?? "";
    const institutionInput = input.institution !== undefined ? trimOrNull(input.institution) : (existing.institution ?? null);

    const hco = institutionInput ? await resolveHcoId(p, institutionInput, region) : null;

    await p.query(
      `UPDATE tbl_hcp SET name = $1, email = $2, phone = $3, specialty = $4, hco_id = $5, region = $6 WHERE id = $7`,
      [name, email, phone, specialty, hco?.id ?? null, region, id]
    );
    return { ...existing, name, email, phone, specialty, institution: hco?.name ?? institutionInput, region };
  } catch (err) {
    console.error("updateHCP error:", err);
    return null;
  }
}
