import { getDb } from "./connection.js";

function isoDate(val: Date | string | null | undefined): string {
  if (!val) return "";
  return val instanceof Date ? val.toISOString() : String(val);
}

export type ClientReferredBySource = "website" | "instagram" | "facebook" | "hcp_referral" | "event" | "other";

export interface Client {
  id: string;
  salutation: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  reason: string | null;
  referred_by: string | null;
  referred_by_source: ClientReferredBySource | null;
  hcp_id: string | null;
  status: string;
  region: string;
  country: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface GetClientsFilters {
  search?: string;
  status?: string;
  region?: string;
}

export interface ClientInsert {
  salutation?: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  reason?: string;
  referred_by?: string;
  referred_by_source?: ClientReferredBySource;
  hcp_id?: string;
  status?: string;
  region?: string;
  country?: string;
  notes?: string;
}

export interface ClientUpdate {
  salutation?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  reason?: string;
  referred_by?: string;
  referred_by_source?: ClientReferredBySource;
  hcp_id?: string;
  status?: string;
  region?: string;
  country?: string;
  notes?: string;
}

function buildName(c: { salutation: string | null; first_name: string; last_name: string }): string {
  return [c.salutation, c.first_name, c.last_name].filter(Boolean).join(" ");
}

function serialize(row: {
  id: string; salutation: string | null; first_name: string; last_name: string;
  email: string | null; phone: string | null; reason: string | null; referred_by: string | null;
  referred_by_source: ClientReferredBySource | null;
  hcp_id: string | null; status: string; region: string; country: string | null;
  notes: string | null; created_at: Date | string; updated_at: Date | string;
}): Client {
  return {
    id: row.id,
    salutation: row.salutation,
    first_name: row.first_name,
    last_name: row.last_name,
    email: row.email,
    phone: row.phone,
    reason: row.reason,
    referred_by: row.referred_by,
    referred_by_source: row.referred_by_source,
    hcp_id: row.hcp_id,
    status: row.status,
    region: row.region,
    country: row.country,
    notes: row.notes,
    created_at: isoDate(row.created_at),
    updated_at: isoDate(row.updated_at),
  };
}

export async function getClientsPaginated(
  filters: GetClientsFilters,
  page: number,
  limit: number,
  sortBy = "created_at",
  sortOrder: "asc" | "desc" = "desc"
): Promise<{ rows: (Client & { name: string })[]; total: number }> {
  const p = getDb();
  if (!p) return { rows: [], total: 0 };

  const allowed = ["created_at", "last_name", "first_name", "status", "region", "referred_by"];
  const col = allowed.includes(sortBy) ? sortBy : "created_at";
  const dir = sortOrder === "asc" ? "ASC" : "DESC";

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.search?.trim()) {
    params.push(`%${filters.search.trim().toLowerCase()}%`);
    conditions.push(
      `(LOWER(first_name || ' ' || last_name) LIKE $${params.length}
       OR LOWER(COALESCE(reason,'')) LIKE $${params.length}
       OR LOWER(COALESCE(referred_by,'')) LIKE $${params.length}
       OR LOWER(region) LIKE $${params.length})`
    );
  }
  if (filters.status?.trim()) {
    params.push(filters.status.trim());
    conditions.push(`status = $${params.length}`);
  }
  if (filters.region?.trim()) {
    params.push(filters.region.trim());
    conditions.push(`region = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countResult = await p.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM tbl_clients ${where}`,
    params
  );
  const total = parseInt(countResult.rows[0]?.count ?? "0", 10);

  const offset = (page - 1) * limit;
  params.push(limit, offset);
  const dataResult = await p.query<{
    id: string; salutation: string | null; first_name: string; last_name: string;
    email: string | null; phone: string | null; reason: string | null; referred_by: string | null;
    referred_by_source: ClientReferredBySource | null;
    hcp_id: string | null; status: string; region: string; country: string | null;
    notes: string | null; created_at: Date; updated_at: Date;
  }>(
    `SELECT * FROM tbl_clients ${where}
     ORDER BY ${col} ${dir}
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const rows = dataResult.rows.map((r) => ({
    ...serialize(r),
    name: buildName(r),
  }));

  return { rows, total };
}

export async function getClientById(id: string): Promise<(Client & { name: string }) | null> {
  const p = getDb();
  if (!p) return null;
  const result = await p.query<{
    id: string; salutation: string | null; first_name: string; last_name: string;
    email: string | null; phone: string | null; reason: string | null; referred_by: string | null;
    referred_by_source: ClientReferredBySource | null;
    hcp_id: string | null; status: string; region: string; country: string | null;
    notes: string | null; created_at: Date; updated_at: Date;
  }>(
    `SELECT * FROM tbl_clients WHERE id = $1`,
    [id]
  );
  if (!result.rows[0]) return null;
  const r = result.rows[0];
  return { ...serialize(r), name: buildName(r) };
}

export async function insertClient(data: ClientInsert): Promise<(Client & { name: string }) | null> {
  const p = getDb();
  if (!p) return null;
  const result = await p.query<{
    id: string; salutation: string | null; first_name: string; last_name: string;
    email: string | null; phone: string | null; reason: string | null; referred_by: string | null;
    referred_by_source: ClientReferredBySource | null;
    hcp_id: string | null; status: string; region: string; country: string | null;
    notes: string | null; created_at: Date; updated_at: Date;
  }>(
    `INSERT INTO tbl_clients
       (salutation, first_name, last_name, email, phone, reason, referred_by, referred_by_source, hcp_id, status, region, country, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING *`,
    [
      data.salutation ?? null,
      data.first_name,
      data.last_name,
      data.email ?? null,
      data.phone ?? null,
      data.reason ?? null,
      data.referred_by ?? null,
      data.referred_by_source ?? null,
      data.hcp_id ?? null,
      data.status ?? "active",
      data.region ?? "",
      data.country ?? null,
      data.notes ?? null,
    ]
  );
  if (!result.rows[0]) return null;
  const r = result.rows[0];
  return { ...serialize(r), name: buildName(r) };
}

export async function updateClient(
  id: string,
  data: ClientUpdate
): Promise<(Client & { name: string }) | null> {
  const p = getDb();
  if (!p) return null;

  const sets: string[] = ["updated_at = now()"];
  const params: unknown[] = [];

  const fields: (keyof ClientUpdate)[] = [
    "salutation", "first_name", "last_name", "email", "phone",
    "reason", "referred_by", "referred_by_source", "hcp_id", "status", "region", "country", "notes",
  ];
  for (const field of fields) {
    if (data[field] !== undefined) {
      params.push(data[field] ?? null);
      sets.push(`${field} = $${params.length}`);
    }
  }

  params.push(id);
  const result = await p.query<{
    id: string; salutation: string | null; first_name: string; last_name: string;
    email: string | null; phone: string | null; reason: string | null; referred_by: string | null;
    referred_by_source: ClientReferredBySource | null;
    hcp_id: string | null; status: string; region: string; country: string | null;
    notes: string | null; created_at: Date; updated_at: Date;
  }>(
    `UPDATE tbl_clients SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`,
    params
  );
  if (!result.rows[0]) return null;
  const r = result.rows[0];
  return { ...serialize(r), name: buildName(r) };
}
