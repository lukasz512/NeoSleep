/**
 * PostgreSQL client for BFF. Uses DATABASE_URL from env.
 * If unset, getPool() returns null and the app runs without DB (e.g. health-only).
 */
import pg from "pg";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool | null {
  if (pool !== null) return pool;
  const url = process.env.DATABASE_URL;
  if (!url || url.trim() === "") return null;
  try {
    pool = new Pool({ connectionString: url });
    return pool;
  } catch {
    return null;
  }
}

export interface Lead {
  id: string;
  name: string;
  email: string | null;
  status: string;
  region: string;
  created_at: Date;
  institution?: string | null;
}

const CREATE_LEADS = `
CREATE TABLE IF NOT EXISTS tbl_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  region TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

/** Run migrations and seed. Safe to call multiple times. */
export async function initDb(): Promise<void> {
  const p = getPool();
  if (!p) return;
  try {
    await p.query(CREATE_LEADS);
    await p.query("ALTER TABLE tbl_leads ADD COLUMN IF NOT EXISTS institution TEXT");
    await p.query("ALTER TABLE tbl_leads ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()");
    await p.query("UPDATE tbl_leads SET updated_at = created_at WHERE updated_at IS NULL");
    const count = await p.query<{ count: string }>("SELECT COUNT(*) AS count FROM tbl_leads");
    if (Number(count.rows[0]?.count ?? 0) === 0) {
      await p.query(
        "INSERT INTO tbl_leads (name, email, status, region) VALUES ($1, $2, $3, $4), ($5, $6, $7, $8), ($9, $10, $11, $12)",
        [
          "Dr. Anna Smith",
          "anna.smith@hospital.example",
          "contacted",
          "North",
          "Dr. Jan Kowalski",
          "j.kowalski@clinic.example",
          "new",
          "Central",
          "Medical Center Alpha",
          "contact@alpha-med.example",
          "qualified",
          "South",
        ]
      );
    }
  } catch (err) {
    console.error("DB init error:", err);
  }
}

/** Mock leads when DATABASE_URL is not set (e.g. before Docker/Postgres is ready). */
const MOCK_LEADS: Lead[] = [
  { id: "mock-1", name: "Dr. Anna Smith", email: "anna.smith@hospital.example", status: "contacted", region: "North", created_at: new Date("2025-02-01T10:00:00Z"), institution: "City Hospital North" },
  { id: "mock-2", name: "Dr. Jan Kowalski", email: "j.kowalski@clinic.example", status: "new", region: "Central", created_at: new Date("2025-02-02T11:00:00Z"), institution: "Clinic Central" },
  { id: "mock-3", name: "Medical Center Alpha", email: "contact@alpha-med.example", status: "qualified", region: "South", created_at: new Date("2025-02-03T12:00:00Z"), institution: "Medical Center Alpha" },
];

const SORT_COLUMNS = ["name", "email", "status", "region", "created_at"] as const;
export type LeadSortColumn = (typeof SORT_COLUMNS)[number];

function isLeadSortColumn(s: string): s is LeadSortColumn {
  return SORT_COLUMNS.includes(s as LeadSortColumn);
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

/** Server-side leads: pagination, sort, filters. Safe for arbitrary row counts. */
export async function getLeadsPaginated(
  filters: GetLeadsFilters,
  page: number,
  limit: number,
  sortBy: string,
  sortOrder: "asc" | "desc"
): Promise<GetLeadsPaginatedResult> {
  const p = getPool();
  if (!p) {
    const all = MOCK_LEADS;
    let filtered = all;
    const search = (filters.search ?? "").trim().toLowerCase();
    if (search) {
      filtered = filtered.filter(
        (l) =>
          l.name.toLowerCase().includes(search) ||
          (l.email?.toLowerCase().includes(search) ?? false) ||
          l.status.toLowerCase().includes(search) ||
          l.region.toLowerCase().includes(search)
      );
    }
    const statusArr = Array.isArray(filters.status) ? filters.status : filters.status ? [filters.status.trim()] : [];
    if (statusArr.length > 0) {
      const set = new Set(statusArr.map((s) => s.trim()));
      filtered = filtered.filter((l) => set.has(l.status));
    }
const regionArr = Array.isArray(filters.region) ? filters.region : filters.region ? [filters.region.trim()] : [];
  if (regionArr.length > 0) {
    const set = new Set(regionArr.map((s) => s.trim()));
    filtered = filtered.filter((l) => set.has(l.region));
  }
  if (filters.hideCompletedOlderThan24h) {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    filtered = filtered.filter((l) => {
      if (l.status?.toLowerCase() !== "completed") return true;
      const updatedAt = (l as Lead & { updated_at?: Date }).updated_at;
      return updatedAt != null && updatedAt >= cutoff;
    });
  }
    const col = isLeadSortColumn(sortBy) ? sortBy : "created_at";
    filtered.sort((a, b) => {
      const aVal = a[col as keyof Lead];
      const bVal = b[col as keyof Lead];
      const cmp = String(aVal ?? "").localeCompare(String(bVal ?? ""), undefined, { numeric: col === "created_at" });
      return sortOrder === "asc" ? cmp : -cmp;
    });
    const total = filtered.length;
    const start = (page - 1) * limit;
    const rows = filtered.slice(start, start + limit);
    return { rows, total };
  }

  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters.search?.trim()) {
    conditions.push(`(LOWER(name) LIKE $${paramIndex} OR LOWER(COALESCE(email,'')) LIKE $${paramIndex} OR LOWER(status) LIKE $${paramIndex} OR LOWER(region) LIKE $${paramIndex})`);
    params.push(`%${filters.search.trim().toLowerCase()}%`);
    paramIndex++;
  }
  const statusArr = Array.isArray(filters.status) ? filters.status : filters.status ? [filters.status.trim()] : [];
  if (statusArr.length > 0) {
    conditions.push(`status = ANY($${paramIndex}::text[])`);
    params.push(statusArr);
    paramIndex++;
  }
  const regionArr = Array.isArray(filters.region) ? filters.region : filters.region ? [filters.region.trim()] : [];
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
  const selectWithInstitution = `SELECT id, name, email, status, region, created_at, institution FROM tbl_leads ${whereClause} ORDER BY ${safeOrder} ${orderDir} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  const selectWithoutInstitution = `SELECT id, name, email, status, region, created_at FROM tbl_leads ${whereClause} ORDER BY ${safeOrder} ${orderDir} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  let dataResult;
  try {
    dataResult = await p.query<Lead & { institution?: string | null }>(selectWithInstitution, params);
  } catch (err) {
    const msg = String(err instanceof Error ? err.message : err);
    if (msg.includes("institution") && msg.includes("does not exist")) {
      dataResult = await p.query<Lead & { institution?: string | null }>(selectWithoutInstitution, params);
    } else {
      throw err;
    }
  }

  return { rows: dataResult.rows, total };
}

export async function getLeads(): Promise<Lead[]> {
  const p = getPool();
  if (!p) return MOCK_LEADS;
  const result = await p.query<Lead>(
    "SELECT id, name, email, status, region, created_at FROM tbl_leads ORDER BY created_at DESC"
  );
  return result.rows;
}

export interface InsertLeadInput {
  name: string;
  email?: string | null;
  status?: string;
  region?: string;
  institution?: string | null;
}

/** Insert a new lead. Returns the created lead or null on error. */
export async function insertLead(input: InsertLeadInput): Promise<Lead | null> {
  const p = getPool();
  if (!p) return null;
  try {
    const name = (input.name ?? "").trim();
    if (!name) return null;
    const result = await p.query<Lead & { institution?: string | null }>(
      `INSERT INTO tbl_leads (name, email, status, region, institution)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, status, region, created_at, institution`,
      [
        name,
        input.email?.trim() || null,
        input.status?.trim() || "new",
        input.region?.trim() || "",
        input.institution?.trim() || null,
      ]
    );
    return result.rows[0] ?? null;
  } catch (err) {
    console.error("insertLead error:", err);
    return null;
  }
}

export interface UpdateLeadInput {
  name?: string;
  email?: string | null;
  status?: string;
  region?: string;
  institution?: string | null;
}

/** Update an existing lead. Returns the updated lead or null if not found or on error. */
export async function updateLead(id: string, input: UpdateLeadInput): Promise<Lead | null> {
  const p = getPool();
  if (!p) {
    const found = MOCK_LEADS.find((l) => l.id === id);
    if (!found) return null;
    return {
      ...found,
      ...(input.name !== undefined && { name: input.name.trim() }),
      ...(input.email !== undefined && { email: input.email?.trim() || null }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.region !== undefined && { region: input.region }),
      ...(input.institution !== undefined && { institution: input.institution?.trim() || null }),
    };
  }
  try {
    const lead = await getLeadById(id);
    if (!lead) return null;
    const name = input.name !== undefined ? input.name.trim() : lead.name;
    const email = input.email !== undefined ? (input.email?.trim() || null) : lead.email;
    const status = input.status !== undefined ? input.status : lead.status;
    const region = input.region !== undefined ? input.region : lead.region;
    const institution = input.institution !== undefined ? (input.institution?.trim() || null) : lead.institution ?? null;
    const result = await p.query<Lead & { institution?: string | null }>(
      `UPDATE tbl_leads SET name = $1, email = $2, status = $3, region = $4, institution = $5, updated_at = now() WHERE id = $6
       RETURNING id, name, email, status, region, created_at, institution`,
      [name, email, status, region, institution, id]
    );
    return result.rows[0] ?? null;
  } catch (err) {
    console.error("updateLead error:", err);
    return null;
  }
}

/** Get a single lead by id. Returns null if not found. */
export async function getLeadById(id: string): Promise<Lead | null> {
  const p = getPool();
  if (!p) {
    const found = MOCK_LEADS.find((l) => l.id === id);
    return found ?? null;
  }
  try {
    const result = await p.query<Lead & { institution?: string | null }>(
      "SELECT id, name, email, status, region, created_at, institution FROM tbl_leads WHERE id = $1",
      [id]
    );
    return result.rows[0] ?? null;
  } catch (err) {
    const msg = String(err instanceof Error ? err.message : err);
    if (msg.includes("institution") && msg.includes("does not exist")) {
      const result = await p.query<Lead>(
        "SELECT id, name, email, status, region, created_at FROM tbl_leads WHERE id = $1",
        [id]
      );
      return result.rows[0] ?? null;
    }
    throw err;
  }
}

export interface ConsoleLogInsert {
  level: string;
  message: string;
  message_hash?: string | null;
  stack?: string | null;
  source?: string;
  env?: string;
  user_id?: string | null;
  request_id?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface User {
  id: string;
  email: string;
  name: string | null;
  role: "admin" | "manager" | "rep";
  provider: string;
  provider_id: string;
  region: string | null;
  created_at: Date;
  updated_at: Date;
}

/** Staff user with password fields (migration 014). Used for email/password login. */
export interface StaffUser extends User {
  password_hash: string | null;
  force_password_change: boolean;
}

/** Get or create user by auth provider (e.g. Google). New users get role 'rep'. Table from migration 004. */
export async function getOrCreateUserByProvider(
  provider: string,
  providerId: string,
  email: string,
  name?: string | null
): Promise<User | null> {
  const p = getPool();
  if (!p) return null;
  try {
    const existing = await p.query<User>(
      "SELECT id, email, name, role, provider, provider_id, region, created_at, updated_at FROM tbl_users WHERE provider = $1 AND provider_id = $2",
      [provider, providerId]
    );
    if (existing.rows[0]) return existing.rows[0];
    const inserted = await p.query<User>(
      `INSERT INTO tbl_users (email, name, role, provider, provider_id)
       VALUES ($1, $2, 'rep', $3, $4)
       RETURNING id, email, name, role, provider, provider_id, region, created_at, updated_at`,
      [email, name ?? null, provider, providerId]
    );
    return inserted.rows[0] ?? null;
  } catch (err) {
    console.error("getOrCreateUserByProvider error:", err);
    return null;
  }
}

/** Get user by id. */
export async function getUserById(id: string): Promise<User | null> {
  const p = getPool();
  if (!p) return null;
  try {
    const r = await p.query<User>(
      "SELECT id, email, name, role, provider, provider_id, region, created_at, updated_at FROM tbl_users WHERE id = $1",
      [id]
    );
    return r.rows[0] ?? null;
  } catch (err) {
    console.error("getUserById error:", err);
    return null;
  }
}

/** Get first user id (for dev fallback when session is empty). Returns null if no users. */
export async function getFirstUserId(): Promise<string | null> {
  const p = getPool();
  if (!p) return null;
  try {
    const r = await p.query<{ id: string }>(
      "SELECT id FROM tbl_users ORDER BY created_at ASC LIMIT 1"
    );
    return r.rows[0]?.id ?? null;
  } catch (err) {
    console.error("getFirstUserId error:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Staff auth – password login, remember-me, reset (migration 014)
// ---------------------------------------------------------------------------

const STAFF_AUTH_COLS =
  "id, email, name, role, provider, provider_id, region, created_at, updated_at, password_hash, force_password_change";

/** Get staff user by email for login (includes password_hash, force_password_change). */
export async function getStaffUserByEmail(email: string): Promise<StaffUser | null> {
  const p = getPool();
  if (!p) return null;
  try {
    const r = await p.query<StaffUser>(
      `SELECT ${STAFF_AUTH_COLS} FROM tbl_users WHERE email = $1`,
      [email.trim().toLowerCase()]
    );
    return r.rows[0] ?? null;
  } catch (err) {
    console.error("getStaffUserByEmail error:", err);
    return null;
  }
}

/** Get staff user by id (includes force_password_change for session). */
export async function getStaffUserById(id: string): Promise<StaffUser | null> {
  const p = getPool();
  if (!p) return null;
  try {
    const r = await p.query<StaffUser>(
      `SELECT ${STAFF_AUTH_COLS} FROM tbl_users WHERE id = $1`,
      [id]
    );
    return r.rows[0] ?? null;
  } catch (err) {
    console.error("getStaffUserById error:", err);
    return null;
  }
}

/** Set password for user (clears force_password_change, sets last_password_change_at). */
export async function setUserPassword(
  userId: string,
  passwordHash: string
): Promise<boolean> {
  const p = getPool();
  if (!p) return false;
  try {
    await p.query(
      `UPDATE tbl_users SET password_hash = $1, force_password_change = false, last_password_change_at = now(), updated_at = now() WHERE id = $2`,
      [passwordHash, userId]
    );
    return true;
  } catch (err) {
    console.error("setUserPassword error:", err);
    return false;
  }
}

/** Create a remember-me token; returns { id, secret } to send in cookie. Caller hashes secret for DB. */
export async function createRememberMeToken(
  userId: string,
  tokenHash: string,
  expiresAt: Date,
  deviceInfo?: string | null
): Promise<string | null> {
  const p = getPool();
  if (!p) return null;
  try {
    const r = await p.query<{ id: string }>(
      `INSERT INTO tbl_remember_me_tokens (user_id, token_hash, device_info, expires_at)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [userId, tokenHash, deviceInfo ?? null, expiresAt]
    );
    return r.rows[0]?.id ?? null;
  } catch (err) {
    console.error("createRememberMeToken error:", err);
    return null;
  }
}

/** Find remember-me token by id; returns user_id and token_hash if not expired. */
export async function getRememberMeToken(
  tokenId: string
): Promise<{ userId: string; tokenHash: string } | null> {
  const p = getPool();
  if (!p) return null;
  try {
    const r = await p.query<{ user_id: string; token_hash: string }>(
      `SELECT user_id, token_hash FROM tbl_remember_me_tokens WHERE id = $1 AND expires_at > now()`,
      [tokenId]
    );
    const row = r.rows[0];
    return row ? { userId: row.user_id, tokenHash: row.token_hash } : null;
  } catch (err) {
    console.error("getRememberMeToken error:", err);
    return null;
  }
}

/** Delete remember-me token (e.g. on logout). */
export async function deleteRememberMeToken(tokenId: string): Promise<void> {
  const p = getPool();
  if (!p) return;
  try {
    await p.query("DELETE FROM tbl_remember_me_tokens WHERE id = $1", [tokenId]);
  } catch (err) {
    console.error("deleteRememberMeToken error:", err);
  }
}

/** Create password-reset token; returns plaintext token (store hash in DB). Expiry typically 1 hour. */
export async function createPasswordResetToken(
  userId: string,
  tokenHash: string,
  expiresAt: Date
): Promise<boolean> {
  const p = getPool();
  if (!p) return false;
  try {
    await p.query(
      `INSERT INTO tbl_password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [userId, tokenHash, expiresAt]
    );
    return true;
  } catch (err) {
    console.error("createPasswordResetToken error:", err);
    return false;
  }
}

/** Find password-reset token by hash; returns user_id if not expired. Caller should delete after use. */
export async function getPasswordResetUserIdByHash(
  tokenHash: string
): Promise<string | null> {
  const p = getPool();
  if (!p) return null;
  try {
    const r = await p.query<{ user_id: string }>(
      `SELECT user_id FROM tbl_password_reset_tokens WHERE token_hash = $1 AND expires_at > now()`,
      [tokenHash]
    );
    return r.rows[0]?.user_id ?? null;
  } catch (err) {
    console.error("getPasswordResetUserIdByHash error:", err);
    return null;
  }
}

/** Delete password-reset token (single use). */
export async function deletePasswordResetTokenByHash(tokenHash: string): Promise<void> {
  const p = getPool();
  if (!p) return;
  try {
    await p.query("DELETE FROM tbl_password_reset_tokens WHERE token_hash = $1", [tokenHash]);
  } catch (err) {
    console.error("deletePasswordResetTokenByHash error:", err);
  }
}

/** Insert staff user (provider='local') for email/password login. Used by ensureStaffAdmin. */
export async function insertStaffUser(
  email: string,
  name: string | null,
  role: "admin" | "manager" | "rep",
  passwordHash: string,
  forcePasswordChange: boolean
): Promise<User | null> {
  const p = getPool();
  if (!p) return null;
  const normalizedEmail = email.trim().toLowerCase();
  try {
    const r = await p.query<User>(
      `INSERT INTO tbl_users (email, name, role, provider, provider_id, password_hash, force_password_change)
       VALUES ($1, $2, $3, 'local', $4, $5, $6)
       ON CONFLICT (provider, provider_id) DO NOTHING
       RETURNING id, email, name, role, provider, provider_id, region, created_at, updated_at`,
      [normalizedEmail, name ?? null, role, normalizedEmail, passwordHash, forcePasswordChange]
    );
    return r.rows[0] ?? null;
  } catch (err) {
    console.error("insertStaffUser error:", err);
    return null;
  }
}

/** Check if a user exists with email (for ensureStaffAdmin). */
export async function getUserIdByEmail(email: string): Promise<string | null> {
  const p = getPool();
  if (!p) return null;
  try {
    const r = await p.query<{ id: string }>(
      "SELECT id FROM tbl_users WHERE email = $1",
      [email.trim().toLowerCase()]
    );
    return r.rows[0]?.id ?? null;
  } catch (err) {
    console.error("getUserIdByEmail error:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Events – tbl_events, tbl_event_attendees from migration 011
// ---------------------------------------------------------------------------

export interface EventRow {
  id: string;
  rep_id: string;
  start_at: Date;
  end_at: Date;
  type: "f2f" | "video";
  title: string | null;
  location: string | null;
  video_link: string | null;
  notes: string | null;
  region: string;
  status: "scheduled" | "completed" | "cancelled" | "no_show";
  attendees?: { attendee_type: "hcp" | "hco" | "lead"; attendee_id: string; is_primary?: boolean }[];
}

export interface GetEventsFilters {
  start?: string;
  end?: string;
  region?: string;
  repId?: string | null;
}

/** Get events in date range. */
export async function getEvents(filters: GetEventsFilters): Promise<{ rows: EventRow[] }> {
  const p = getPool();
  if (!p) return { rows: [] };
  try {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters.start?.trim()) {
      conditions.push(`e.end_at >= $${paramIndex}::timestamptz`);
      params.push(filters.start.trim());
      paramIndex++;
    }
    if (filters.end?.trim()) {
      conditions.push(`e.start_at <= $${paramIndex}::timestamptz`);
      params.push(filters.end.trim());
      paramIndex++;
    }
    if (filters.region?.trim()) {
      conditions.push(`e.region = $${paramIndex}`);
      params.push(filters.region.trim());
      paramIndex++;
    }
    if (filters.repId?.trim()) {
      conditions.push(`e.rep_id = $${paramIndex}`);
      params.push(filters.repId.trim());
      paramIndex++;
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const sql = `SELECT e.id, e.rep_id, e.start_at, e.end_at, e.type, e.title, e.location, e.video_link, e.notes, e.region, e.status
      FROM tbl_events e ${whereClause} ORDER BY e.start_at ASC`;
    const result = await p.query<EventRow>(sql, params);
    const rows = await Promise.all(
      result.rows.map(async (r) => {
        const attendeesResult = await p.query<{ attendee_type: string; attendee_id: string; is_primary: boolean }>(
          "SELECT attendee_type, attendee_id, is_primary FROM tbl_event_attendees WHERE event_id = $1",
          [r.id]
        );
        const attendees = attendeesResult.rows.map((a) => ({
          attendee_type: a.attendee_type as "hcp" | "hco" | "lead",
          attendee_id: a.attendee_id,
          is_primary: a.is_primary ?? false,
        }));
        return { ...r, attendees };
      })
    );
    return { rows };
  } catch (err) {
    console.error("getEvents error:", err);
    return { rows: [] };
  }
}

/** Get single event by id. */
export async function getEventById(id: string): Promise<EventRow | null> {
  const p = getPool();
  if (!p) return null;
  try {
    const result = await p.query<EventRow>(
      "SELECT id, rep_id, start_at, end_at, type, title, location, video_link, notes, region, status FROM tbl_events WHERE id = $1",
      [id]
    );
    const r = result.rows[0];
    if (!r) return null;
    const attendeesResult = await p.query<{ attendee_type: string; attendee_id: string; is_primary: boolean }>(
      "SELECT attendee_type, attendee_id, is_primary FROM tbl_event_attendees WHERE event_id = $1",
      [id]
    );
    const attendees = attendeesResult.rows.map((a) => ({
      attendee_type: a.attendee_type as "hcp" | "hco" | "lead",
      attendee_id: a.attendee_id,
      is_primary: a.is_primary ?? false,
    }));
    return { ...r, attendees };
  } catch (err) {
    console.error("getEventById error:", err);
    return null;
  }
}

export interface InsertEventInput {
  rep_id: string;
  title?: string | null;
  start_at: string;
  end_at: string;
  type: "f2f" | "video";
  status?: "scheduled" | "completed" | "cancelled" | "no_show";
  location?: string | null;
  video_link?: string | null;
  notes?: string | null;
  region?: string;
  attendees?: { attendee_type: "hcp" | "hco" | "lead"; attendee_id: string; is_primary?: boolean }[];
}

/** Insert event and attendees. Returns created event or null. */
export async function insertEvent(input: InsertEventInput): Promise<EventRow | null> {
  const p = getPool();
  if (!p) return null;
  try {
    const status = input.status ?? "scheduled";
    const region = input.region ?? "";
    const result = await p.query<EventRow>(
      `INSERT INTO tbl_events (rep_id, start_at, end_at, type, title, location, video_link, notes, region, status)
       VALUES ($1, $2::timestamptz, $3::timestamptz, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, rep_id, start_at, end_at, type, title, location, video_link, notes, region, status`,
      [
        input.rep_id,
        input.start_at,
        input.end_at,
        input.type,
        input.title?.trim() || null,
        input.location?.trim() || null,
        input.video_link?.trim() || null,
        input.notes?.trim() || null,
        region,
        status,
      ]
    );
    const event = result.rows[0];
    if (!event) return null;

    const attendees = Array.isArray(input.attendees) ? input.attendees : [];
    for (let i = 0; i < attendees.length; i++) {
      const a = attendees[i];
      if (a?.attendee_type && a?.attendee_id) {
        await p.query(
          `INSERT INTO tbl_event_attendees (event_id, attendee_type, attendee_id, is_primary)
           VALUES ($1, $2, $3, $4)`,
          [event.id, a.attendee_type, a.attendee_id, a.is_primary ?? false]
        );
      }
    }

    return { ...event, attendees };
  } catch (err) {
    console.error("insertEvent error:", err);
    return null;
  }
}

export interface UpdateEventInput {
  title?: string;
  start_at?: string;
  end_at?: string;
  type?: "f2f" | "video";
  status?: "scheduled" | "completed" | "cancelled" | "no_show";
  location?: string | null;
  video_link?: string | null;
  notes?: string | null;
  region?: string;
  attendees?: { attendee_type: "hcp" | "hco" | "lead"; attendee_id: string; is_primary?: boolean }[];
}

/** Update event. Replaces attendees if provided. Returns updated event or null. */
export async function updateEvent(id: string, input: UpdateEventInput): Promise<EventRow | null> {
  const p = getPool();
  if (!p) return null;
  try {
    const existing = await getEventById(id);
    if (!existing) return null;

    const updates: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (input.title !== undefined) {
      updates.push(`title = $${paramIndex}`);
      params.push(input.title.trim() || null);
      paramIndex++;
    }
    if (input.start_at !== undefined) {
      updates.push(`start_at = $${paramIndex}::timestamptz`);
      params.push(input.start_at);
      paramIndex++;
    }
    if (input.end_at !== undefined) {
      updates.push(`end_at = $${paramIndex}::timestamptz`);
      params.push(input.end_at);
      paramIndex++;
    }
    if (input.type !== undefined) {
      updates.push(`type = $${paramIndex}`);
      params.push(input.type);
      paramIndex++;
    }
    if (input.status !== undefined) {
      updates.push(`status = $${paramIndex}`);
      params.push(input.status);
      paramIndex++;
    }
    if (input.location !== undefined) {
      updates.push(`location = $${paramIndex}`);
      params.push(input.location?.trim() || null);
      paramIndex++;
    }
    if (input.video_link !== undefined) {
      updates.push(`video_link = $${paramIndex}`);
      params.push(input.video_link?.trim() || null);
      paramIndex++;
    }
    if (input.notes !== undefined) {
      updates.push(`notes = $${paramIndex}`);
      params.push(input.notes?.trim() || null);
      paramIndex++;
    }
    if (input.region !== undefined) {
      updates.push(`region = $${paramIndex}`);
      params.push(input.region.trim());
      paramIndex++;
    }

    if (updates.length > 0) {
      updates.push(`updated_at = now()`);
      params.push(id);
      await p.query(
        `UPDATE tbl_events SET ${updates.join(", ")} WHERE id = $${paramIndex}`,
        params
      );
    }

    if (Array.isArray(input.attendees)) {
      await p.query("DELETE FROM tbl_event_attendees WHERE event_id = $1", [id]);
      for (const a of input.attendees) {
        if (a?.attendee_type && a?.attendee_id) {
          await p.query(
            `INSERT INTO tbl_event_attendees (event_id, attendee_type, attendee_id, is_primary)
             VALUES ($1, $2, $3, $4)`,
            [id, a.attendee_type, a.attendee_id, a.is_primary ?? false]
          );
        }
      }
    }

    return getEventById(id);
  } catch (err) {
    console.error("updateEvent error:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// HCP (Healthcare Professionals) – tbl_hcp from migration 006
// ---------------------------------------------------------------------------

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

const HCP_SORT_COLUMNS = ["name", "email", "specialty", "region", "created_at"] as const;

function isHCPSortColumn(s: string): s is (typeof HCP_SORT_COLUMNS)[number] {
  return HCP_SORT_COLUMNS.includes(s as (typeof HCP_SORT_COLUMNS)[number]);
}

/** HCP list with institution from joined tbl_hco. Paginated, filtered. */
export async function getHCPPaginated(
  filters: GetHCPFilters,
  page: number,
  limit: number,
  sortBy: string,
  sortOrder: "asc" | "desc"
): Promise<{ rows: HCPRow[]; total: number }> {
  const p = getPool();
  if (!p) return { rows: [], total: 0 };

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
  const specialtyArr = Array.isArray(filters.specialty) ? filters.specialty : filters.specialty ? [filters.specialty.trim()] : [];
  if (specialtyArr.length > 0) {
    conditions.push(`h.specialty = ANY($${paramIndex}::text[])`);
    params.push(specialtyArr);
    paramIndex++;
  }
  const institutionArr = Array.isArray(filters.institution) ? filters.institution : filters.institution ? [filters.institution.trim()] : [];
  if (institutionArr.length > 0) {
    conditions.push(`o.name = ANY($${paramIndex}::text[])`);
    params.push(institutionArr);
    paramIndex++;
  }
  const regionArr = Array.isArray(filters.region) ? filters.region : filters.region ? [filters.region.trim()] : [];
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
  const sql = `SELECT h.id, h.name, h.email, h.specialty, o.name AS institution, h.region, h.created_at
    FROM tbl_hcp h LEFT JOIN tbl_hco o ON h.hco_id = o.id
    ${whereClause} ORDER BY ${safeOrder} ${orderDir} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  const dataResult = await p.query<HCPRow & { institution?: string | null }>(sql, params);
  const rows = dataResult.rows.map((r) => ({ ...r, institution: r.institution ?? null }));

  return { rows, total };
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

/** Insert a new HCP. Returns the created HCP or null on error. Creates HCO if institution is new. */
export async function insertHCP(input: InsertHCPInput): Promise<HCPRow | null> {
  const p = getPool();
  if (!p) return null;
  try {
    const name = (input.name ?? "").trim();
    const email = (input.email ?? "").trim();
    const phone = (input.phone ?? "").trim();
    if (!name || !email || !phone) return null;

    let hcoId: string | null = null;
    if (input.institution?.trim()) {
      const hcoResult = await p.query<{ id: string }>(
        "SELECT id FROM tbl_hco WHERE name = $1 LIMIT 1",
        [input.institution.trim()]
      );
      if (hcoResult.rows[0]) {
        hcoId = hcoResult.rows[0].id;
      } else {
        const insertHco = await p.query<{ id: string }>(
          `INSERT INTO tbl_hco (name, region, status) VALUES ($1, $2, 'active') RETURNING id`,
          [input.institution.trim(), input.region?.trim() || ""]
        );
        hcoId = insertHco.rows[0]?.id ?? null;
      }
    }

    const leadId = input.lead_id?.trim() || null;
    const result = await p.query<HCPRow & { institution?: string | null }>(
      `INSERT INTO tbl_hcp (name, email, phone, specialty, hco_id, region, status, lead_id)
       VALUES ($1, $2, $3, $4, $5, $6, 'active', $7)
       RETURNING id, name, email, specialty, region, created_at`,
      [name, email, phone, input.specialty?.trim() || null, hcoId, input.region?.trim() || "", leadId]
    );
    const row = result.rows[0];
    if (!row) return null;
    const institution = hcoId
      ? (await p.query<{ name: string }>("SELECT name FROM tbl_hco WHERE id = $1", [hcoId])).rows[0]?.name ?? null
      : input.institution ?? null;
    return { ...row, institution };
  } catch (err) {
    console.error("insertHCP error:", err);
    return null;
  }
}

export interface UpdateHCPInput {
  name?: string;
  email?: string;
  phone?: string;
  specialty?: string | null;
  institution?: string | null;
  region?: string;
}

/** Update an existing HCP. Returns the updated HCP or null if not found. */
export async function updateHCP(id: string, input: UpdateHCPInput): Promise<HCPRow | null> {
  const p = getPool();
  if (!p) return null;
  const existing = await getHCPById(id);
  if (!existing) return null;
  try {
    const name = input.name !== undefined ? input.name.trim() : existing.name;
    const email = input.email !== undefined ? input.email.trim() : (existing.email ?? "");
    const phone = input.phone !== undefined ? `+52${input.phone.replace(/\D/g, "")}` : (existing.phone ?? "");
    const specialty = input.specialty !== undefined ? (input.specialty?.trim() || null) : (existing.specialty ?? null);
    const region = input.region !== undefined ? input.region : (existing.region ?? "");
    let hcoId: string | null = null;
    const institutionInput = input.institution !== undefined ? input.institution?.trim() : (existing.institution ?? null);
    if (institutionInput) {
      const hcoResult = await p.query<{ id: string }>("SELECT id FROM tbl_hco WHERE name = $1 LIMIT 1", [institutionInput]);
      if (hcoResult.rows[0]) {
        hcoId = hcoResult.rows[0].id;
      } else {
        const insertHco = await p.query<{ id: string }>(
          `INSERT INTO tbl_hco (name, region, status) VALUES ($1, $2, 'active') RETURNING id`,
          [institutionInput, region]
        );
        hcoId = insertHco.rows[0]?.id ?? null;
      }
    }
    await p.query(
      `UPDATE tbl_hcp SET name = $1, email = $2, phone = $3, specialty = $4, hco_id = $5, region = $6 WHERE id = $7`,
      [name, email, phone, specialty, hcoId, region, id]
    );
    const institution: string | null = hcoId
      ? (await p.query<{ name: string }>("SELECT name FROM tbl_hco WHERE id = $1", [hcoId])).rows[0]?.name ?? null
      : institutionInput ?? null;
    return { ...existing, name, email, phone, specialty, institution, region };
  } catch (err) {
    console.error("updateHCP error:", err);
    return null;
  }
}

/** Get single HCP by id. */
export async function getHCPById(id: string): Promise<HCPRow | null> {
  const p = getPool();
  if (!p) return null;
  try {
    const result = await p.query<HCPRow & { institution?: string | null }>(
      `SELECT h.id, h.name, h.email, h.phone, h.specialty, o.name AS institution, h.region, h.created_at
       FROM tbl_hcp h LEFT JOIN tbl_hco o ON h.hco_id = o.id WHERE h.id = $1`,
      [id]
    );
    const r = result.rows[0];
    if (!r) return null;
    return { ...r, institution: r.institution ?? null };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// HCO (Healthcare Organizations) – tbl_hco from migration 006
// ---------------------------------------------------------------------------

export interface HCORow {
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

/** HCO list. Paginated, filtered. */
export async function getHCOPaginated(
  filters: GetHCOFilters,
  page: number,
  limit: number,
  sortBy: string,
  sortOrder: "asc" | "desc"
): Promise<{ rows: HCORow[]; total: number }> {
  const p = getPool();
  if (!p) return { rows: [], total: 0 };

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
  const sql = `SELECT id, name, type, region, status, created_at FROM tbl_hco ${whereClause} ORDER BY ${safeOrder} ${orderDir} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  const dataResult = await p.query<HCORow>(sql, params);

  return { rows: dataResult.rows, total };
}

/** Get single HCO by id. */
export async function getHCOById(id: string): Promise<HCORow | null> {
  const p = getPool();
  if (!p) return null;
  try {
    const result = await p.query<HCORow>(
      "SELECT id, name, type, region, status, created_at FROM tbl_hco WHERE id = $1",
      [id]
    );
    return result.rows[0] ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Presentations – tbl_presentations from migration 010
// ---------------------------------------------------------------------------

export interface PresentationRow {
  id: string;
  title: string;
  url: string;
  file_type: string;
  created_at: Date;
}

const MOCK_PRESENTATIONS: PresentationRow[] = [
  { id: "mock-1", title: "Sample PDF (dev)", url: "https://www.africau.edu/images/default/sample.pdf", file_type: "pdf", created_at: new Date() },
  { id: "mock-2", title: "Sample PPTX (dev)", url: "https://www.learningcontainer.com/wp-content/uploads/2020/05/sample-pptx-file.pptx", file_type: "pptx", created_at: new Date() },
];

/** Get all presentations. */
export async function getPresentations(): Promise<PresentationRow[]> {
  const p = getPool();
  if (!p) return MOCK_PRESENTATIONS;
  try {
    const result = await p.query<PresentationRow>(
      "SELECT id, title, url, file_type, created_at FROM tbl_presentations ORDER BY created_at DESC"
    );
    return result.rows.length > 0 ? result.rows : MOCK_PRESENTATIONS;
  } catch {
    return MOCK_PRESENTATIONS;
  }
}

/** Get single presentation by id. */
export async function getPresentationById(id: string): Promise<PresentationRow | null> {
  const p = getPool();
  if (!p) return MOCK_PRESENTATIONS.find((p) => p.id === id) ?? null;
  try {
    const result = await p.query<PresentationRow>(
      "SELECT id, title, url, file_type, created_at FROM tbl_presentations WHERE id = $1",
      [id]
    );
    return result.rows[0] ?? null;
  } catch {
    return null;
  }
}

export interface AuditLogInsert {
  user_id?: string | null;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** Insert audit log row (who did what). Table from migration 012. */
export async function insertAuditLog(row: AuditLogInsert): Promise<void> {
  const p = getPool();
  if (!p) return;
  try {
    const userId = row.user_id?.trim();
    const isValidUuid = userId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
    await p.query(
      `INSERT INTO tbl_audit_log (user_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        isValidUuid ? userId : null,
        row.action,
        row.entity_type,
        row.entity_id ?? null,
        row.metadata ? JSON.stringify(row.metadata) : null,
      ]
    );
  } catch (err) {
    console.error("insertAuditLog error:", err);
  }
}

/** Insert a console log row (prod or when ENABLE_CONSOLE_LOG_DB=1). Table from migration 003. */
export async function insertConsoleLog(row: ConsoleLogInsert): Promise<void> {
  const p = getPool();
  if (!p) return;
  try {
    await p.query(
      `INSERT INTO tbl_console_errors (level, message, message_hash, stack, source, env, user_id, request_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        row.level || "log",
        row.message,
        row.message_hash ?? null,
        row.stack ?? null,
        row.source ?? "bff",
        row.env ?? process.env.NODE_ENV ?? "development",
        row.user_id ?? null,
        row.request_id ?? null,
        row.metadata ? JSON.stringify(row.metadata) : null,
      ]
    );
  } catch (err) {
    console.error("insertConsoleLog error:", err);
  }
}

/** App config (theme/branding). Table from migration 015 + 016 + 017. Single row. */
export interface AppConfigRow {
  primary_color: string;
  secondary_color: string;
  primary_color_dark: string;
  secondary_color_dark: string;
  border_radius: string;
  logo_url: string | null;
  surface_color: string;
  hero_container_style: "compact" | "wide";
  color_scheme: "light" | "dark";
}

const DEFAULT_APP_CONFIG: AppConfigRow = {
  primary_color: "#1976d2",
  secondary_color: "#2e7d32",
  primary_color_dark: "#42a5f5",
  secondary_color_dark: "#66bb6a",
  border_radius: "8px",
  logo_url: null,
  surface_color: "#fafafa",
  hero_container_style: "compact",
  color_scheme: "light",
};

export async function getAppConfig(): Promise<AppConfigRow> {
  const p = getPool();
  if (!p) return DEFAULT_APP_CONFIG;
  try {
    const result = await p.query<
      AppConfigRow & {
        surface_color?: string;
        hero_container_style?: string;
        color_scheme?: string;
        primary_color_dark?: string;
        secondary_color_dark?: string;
      }
    >(
      `SELECT primary_color, secondary_color, border_radius, logo_url,
              COALESCE(surface_color, $1) AS surface_color,
              COALESCE(NULLIF(hero_container_style, ''), 'compact') AS hero_container_style,
              COALESCE(NULLIF(color_scheme, ''), 'light') AS color_scheme,
              COALESCE(primary_color_dark, $2) AS primary_color_dark,
              COALESCE(secondary_color_dark, $3) AS secondary_color_dark
       FROM tbl_app_config LIMIT 1`,
      [
        DEFAULT_APP_CONFIG.surface_color,
        DEFAULT_APP_CONFIG.primary_color_dark,
        DEFAULT_APP_CONFIG.secondary_color_dark,
      ]
    );
    const row = result.rows[0];
    if (!row) return DEFAULT_APP_CONFIG;
    const hero = row.hero_container_style === "wide" ? "wide" : "compact";
    const scheme = row.color_scheme === "dark" ? "dark" : "light";
    return {
      primary_color: row.primary_color ?? DEFAULT_APP_CONFIG.primary_color,
      secondary_color: row.secondary_color ?? DEFAULT_APP_CONFIG.secondary_color,
      primary_color_dark: row.primary_color_dark ?? DEFAULT_APP_CONFIG.primary_color_dark,
      secondary_color_dark: row.secondary_color_dark ?? DEFAULT_APP_CONFIG.secondary_color_dark,
      border_radius: row.border_radius ?? DEFAULT_APP_CONFIG.border_radius,
      logo_url: row.logo_url ?? null,
      surface_color: row.surface_color ?? DEFAULT_APP_CONFIG.surface_color,
      hero_container_style: hero,
      color_scheme: scheme,
    };
  } catch (err) {
    console.error("getAppConfig error:", err);
    return DEFAULT_APP_CONFIG;
  }
}

export type AppConfigUpdate = Partial<
  Pick<
    AppConfigRow,
    | "primary_color"
    | "secondary_color"
    | "primary_color_dark"
    | "secondary_color_dark"
    | "border_radius"
    | "logo_url"
    | "surface_color"
    | "hero_container_style"
    | "color_scheme"
  >
>;

export async function updateAppConfig(updates: AppConfigUpdate): Promise<AppConfigRow> {
  const p = getPool();
  if (!p) return DEFAULT_APP_CONFIG;
  const current = await getAppConfig();
  const primary_color = updates.primary_color ?? current.primary_color;
  const secondary_color = updates.secondary_color ?? current.secondary_color;
  const primary_color_dark = updates.primary_color_dark ?? current.primary_color_dark;
  const secondary_color_dark = updates.secondary_color_dark ?? current.secondary_color_dark;
  const border_radius = updates.border_radius ?? current.border_radius;
  const logo_url = updates.logo_url !== undefined ? updates.logo_url : current.logo_url;
  const surface_color = updates.surface_color ?? current.surface_color;
  const hero_container_style = updates.hero_container_style ?? current.hero_container_style;
  const color_scheme = updates.color_scheme ?? current.color_scheme;
  const row = {
    primary_color,
    secondary_color,
    primary_color_dark,
    secondary_color_dark,
    border_radius,
    logo_url,
    surface_color,
    hero_container_style,
    color_scheme,
  };
  try {
    const result = await p.query(
      `UPDATE tbl_app_config SET
        primary_color = $1, secondary_color = $2, primary_color_dark = $3, secondary_color_dark = $4,
        border_radius = $5, logo_url = $6, surface_color = $7, hero_container_style = $8, color_scheme = $9, updated_at = now()
       WHERE id = (SELECT id FROM tbl_app_config LIMIT 1)`,
      [
        primary_color,
        secondary_color,
        primary_color_dark,
        secondary_color_dark,
        border_radius,
        logo_url,
        surface_color,
        hero_container_style,
        color_scheme,
      ]
    );
    if (result.rowCount === 0) {
      await p.query(
        `INSERT INTO tbl_app_config (primary_color, secondary_color, primary_color_dark, secondary_color_dark, border_radius, logo_url, surface_color, hero_container_style, color_scheme)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          primary_color,
          secondary_color,
          primary_color_dark,
          secondary_color_dark,
          border_radius,
          logo_url,
          surface_color,
          hero_container_style,
          color_scheme,
        ]
      );
    }
    return row;
  } catch (err) {
    console.error("updateAppConfig error:", err);
    return current;
  }
}
