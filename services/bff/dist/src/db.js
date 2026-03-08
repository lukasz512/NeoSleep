/**
 * PostgreSQL client for BFF. Uses DATABASE_URL from env.
 * If unset, getPool() returns null and the app runs without DB (e.g. health-only).
 */
import pg from "pg";
const { Pool } = pg;
let pool = null;
export function getPool() {
    if (pool !== null)
        return pool;
    const url = process.env.DATABASE_URL;
    if (!url || url.trim() === "")
        return null;
    try {
        pool = new Pool({ connectionString: url });
        return pool;
    }
    catch {
        return null;
    }
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
export async function initDb() {
    const p = getPool();
    if (!p)
        return;
    try {
        await p.query(CREATE_LEADS);
        await p.query("ALTER TABLE tbl_leads ADD COLUMN IF NOT EXISTS institution TEXT");
        await p.query("ALTER TABLE tbl_leads ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()");
        await p.query("UPDATE tbl_leads SET updated_at = created_at WHERE updated_at IS NULL");
        const count = await p.query("SELECT COUNT(*) AS count FROM tbl_leads");
        if (Number(count.rows[0]?.count ?? 0) === 0) {
            await p.query("INSERT INTO tbl_leads (name, email, status, region) VALUES ($1, $2, $3, $4), ($5, $6, $7, $8), ($9, $10, $11, $12)", [
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
            ]);
        }
    }
    catch (err) {
        console.error("DB init error:", err);
    }
}
/** Mock leads when DATABASE_URL is not set (e.g. before Docker/Postgres is ready). */
const MOCK_LEADS = [
    { id: "mock-1", name: "Dr. Anna Smith", email: "anna.smith@hospital.example", status: "contacted", region: "North", created_at: new Date("2025-02-01T10:00:00Z"), institution: "City Hospital North" },
    { id: "mock-2", name: "Dr. Jan Kowalski", email: "j.kowalski@clinic.example", status: "new", region: "Central", created_at: new Date("2025-02-02T11:00:00Z"), institution: "Clinic Central" },
    { id: "mock-3", name: "Medical Center Alpha", email: "contact@alpha-med.example", status: "qualified", region: "South", created_at: new Date("2025-02-03T12:00:00Z"), institution: "Medical Center Alpha" },
];
const SORT_COLUMNS = ["name", "email", "status", "region", "created_at"];
function isLeadSortColumn(s) {
    return SORT_COLUMNS.includes(s);
}
/** Server-side leads: pagination, sort, filters. Safe for arbitrary row counts. */
export async function getLeadsPaginated(filters, page, limit, sortBy, sortOrder) {
    const p = getPool();
    if (!p) {
        const all = MOCK_LEADS;
        let filtered = all;
        const search = (filters.search ?? "").trim().toLowerCase();
        if (search) {
            filtered = filtered.filter((l) => l.name.toLowerCase().includes(search) ||
                (l.email?.toLowerCase().includes(search) ?? false) ||
                l.status.toLowerCase().includes(search) ||
                l.region.toLowerCase().includes(search));
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
                if (l.status?.toLowerCase() !== "completed")
                    return true;
                const updatedAt = l.updated_at;
                return updatedAt != null && updatedAt >= cutoff;
            });
        }
        const col = isLeadSortColumn(sortBy) ? sortBy : "created_at";
        filtered.sort((a, b) => {
            const aVal = a[col];
            const bVal = b[col];
            const cmp = String(aVal ?? "").localeCompare(String(bVal ?? ""), undefined, { numeric: col === "created_at" });
            return sortOrder === "asc" ? cmp : -cmp;
        });
        const total = filtered.length;
        const start = (page - 1) * limit;
        const rows = filtered.slice(start, start + limit);
        return { rows, total };
    }
    const conditions = [];
    const params = [];
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
    const countResult = await p.query(`SELECT COUNT(*) AS count FROM tbl_leads ${whereClause}`, params);
    const total = Number(countResult.rows[0]?.count ?? 0);
    const offset = (page - 1) * limit;
    params.push(limit, offset);
    const selectWithInstitution = `SELECT id, name, email, status, region, created_at, institution FROM tbl_leads ${whereClause} ORDER BY ${safeOrder} ${orderDir} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    const selectWithoutInstitution = `SELECT id, name, email, status, region, created_at FROM tbl_leads ${whereClause} ORDER BY ${safeOrder} ${orderDir} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    let dataResult;
    try {
        dataResult = await p.query(selectWithInstitution, params);
    }
    catch (err) {
        const msg = String(err instanceof Error ? err.message : err);
        if (msg.includes("institution") && msg.includes("does not exist")) {
            dataResult = await p.query(selectWithoutInstitution, params);
        }
        else {
            throw err;
        }
    }
    return { rows: dataResult.rows, total };
}
export async function getLeads() {
    const p = getPool();
    if (!p)
        return MOCK_LEADS;
    const result = await p.query("SELECT id, name, email, status, region, created_at FROM tbl_leads ORDER BY created_at DESC");
    return result.rows;
}
/** Insert a new lead. Returns the created lead or null on error. */
export async function insertLead(input) {
    const p = getPool();
    if (!p)
        return null;
    try {
        const name = (input.name ?? "").trim();
        if (!name)
            return null;
        const result = await p.query(`INSERT INTO tbl_leads (name, email, status, region, institution)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, status, region, created_at, institution`, [
            name,
            input.email?.trim() || null,
            input.status?.trim() || "new",
            input.region?.trim() || "",
            input.institution?.trim() || null,
        ]);
        return result.rows[0] ?? null;
    }
    catch (err) {
        console.error("insertLead error:", err);
        return null;
    }
}
/** Update an existing lead. Returns the updated lead or null if not found or on error. */
export async function updateLead(id, input) {
    const p = getPool();
    if (!p) {
        const found = MOCK_LEADS.find((l) => l.id === id);
        if (!found)
            return null;
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
        if (!lead)
            return null;
        const name = input.name !== undefined ? input.name.trim() : lead.name;
        const email = input.email !== undefined ? (input.email?.trim() || null) : lead.email;
        const status = input.status !== undefined ? input.status : lead.status;
        const region = input.region !== undefined ? input.region : lead.region;
        const institution = input.institution !== undefined ? (input.institution?.trim() || null) : lead.institution ?? null;
        const result = await p.query(`UPDATE tbl_leads SET name = $1, email = $2, status = $3, region = $4, institution = $5, updated_at = now() WHERE id = $6
       RETURNING id, name, email, status, region, created_at, institution`, [name, email, status, region, institution, id]);
        return result.rows[0] ?? null;
    }
    catch (err) {
        console.error("updateLead error:", err);
        return null;
    }
}
/** Get a single lead by id. Returns null if not found. */
export async function getLeadById(id) {
    const p = getPool();
    if (!p) {
        const found = MOCK_LEADS.find((l) => l.id === id);
        return found ?? null;
    }
    try {
        const result = await p.query("SELECT id, name, email, status, region, created_at, institution FROM tbl_leads WHERE id = $1", [id]);
        return result.rows[0] ?? null;
    }
    catch (err) {
        const msg = String(err instanceof Error ? err.message : err);
        if (msg.includes("institution") && msg.includes("does not exist")) {
            const result = await p.query("SELECT id, name, email, status, region, created_at FROM tbl_leads WHERE id = $1", [id]);
            return result.rows[0] ?? null;
        }
        throw err;
    }
}
/** Get or create user by auth provider (e.g. Google). New users get role 'rep'. Table from migration 004. */
export async function getOrCreateUserByProvider(provider, providerId, email, name) {
    const p = getPool();
    if (!p)
        return null;
    try {
        const existing = await p.query("SELECT id, email, name, role, provider, provider_id, region, created_at, updated_at FROM tbl_users WHERE provider = $1 AND provider_id = $2", [provider, providerId]);
        if (existing.rows[0])
            return existing.rows[0];
        const inserted = await p.query(`INSERT INTO tbl_users (email, name, role, provider, provider_id)
       VALUES ($1, $2, 'rep', $3, $4)
       RETURNING id, email, name, role, provider, provider_id, region, created_at, updated_at`, [email, name ?? null, provider, providerId]);
        return inserted.rows[0] ?? null;
    }
    catch (err) {
        console.error("getOrCreateUserByProvider error:", err);
        return null;
    }
}
/** Get user by id. */
export async function getUserById(id) {
    const p = getPool();
    if (!p)
        return null;
    try {
        const r = await p.query("SELECT id, email, name, role, provider, provider_id, region, created_at, updated_at FROM tbl_users WHERE id = $1", [id]);
        return r.rows[0] ?? null;
    }
    catch (err) {
        console.error("getUserById error:", err);
        return null;
    }
}
const HCP_SORT_COLUMNS = ["name", "email", "specialty", "region", "created_at"];
function isHCPSortColumn(s) {
    return HCP_SORT_COLUMNS.includes(s);
}
/** HCP list with institution from joined tbl_hco. Paginated, filtered. */
export async function getHCPPaginated(filters, page, limit, sortBy, sortOrder) {
    const p = getPool();
    if (!p)
        return { rows: [], total: 0 };
    const conditions = [];
    const params = [];
    let paramIndex = 1;
    if (filters.search?.trim()) {
        conditions.push(`(LOWER(h.name) LIKE $${paramIndex} OR LOWER(COALESCE(h.email,'')) LIKE $${paramIndex} OR LOWER(COALESCE(h.specialty,'')) LIKE $${paramIndex} OR LOWER(COALESCE(o.name,'')) LIKE $${paramIndex} OR LOWER(h.region) LIKE $${paramIndex})`);
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
    const countResult = await p.query(`SELECT COUNT(*) AS count FROM tbl_hcp h LEFT JOIN tbl_hco o ON h.hco_id = o.id ${whereClause}`, params);
    const total = Number(countResult.rows[0]?.count ?? 0);
    const offset = (page - 1) * limit;
    params.push(limit, offset);
    const sql = `SELECT h.id, h.name, h.email, h.specialty, o.name AS institution, h.region, h.created_at
    FROM tbl_hcp h LEFT JOIN tbl_hco o ON h.hco_id = o.id
    ${whereClause} ORDER BY ${safeOrder} ${orderDir} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    const dataResult = await p.query(sql, params);
    const rows = dataResult.rows.map((r) => ({ ...r, institution: r.institution ?? null }));
    return { rows, total };
}
/** Insert a new HCP. Returns the created HCP or null on error. Creates HCO if institution is new. */
export async function insertHCP(input) {
    const p = getPool();
    if (!p)
        return null;
    try {
        const name = (input.name ?? "").trim();
        const email = (input.email ?? "").trim();
        const phone = (input.phone ?? "").trim();
        if (!name || !email || !phone)
            return null;
        let hcoId = null;
        if (input.institution?.trim()) {
            const hcoResult = await p.query("SELECT id FROM tbl_hco WHERE name = $1 LIMIT 1", [input.institution.trim()]);
            if (hcoResult.rows[0]) {
                hcoId = hcoResult.rows[0].id;
            }
            else {
                const insertHco = await p.query(`INSERT INTO tbl_hco (name, region, status) VALUES ($1, $2, 'active') RETURNING id`, [input.institution.trim(), input.region?.trim() || ""]);
                hcoId = insertHco.rows[0]?.id ?? null;
            }
        }
        const leadId = input.lead_id?.trim() || null;
        const result = await p.query(`INSERT INTO tbl_hcp (name, email, phone, specialty, hco_id, region, status, lead_id)
       VALUES ($1, $2, $3, $4, $5, $6, 'active', $7)
       RETURNING id, name, email, specialty, region, created_at`, [name, email, phone, input.specialty?.trim() || null, hcoId, input.region?.trim() || "", leadId]);
        const row = result.rows[0];
        if (!row)
            return null;
        const institution = hcoId
            ? (await p.query("SELECT name FROM tbl_hco WHERE id = $1", [hcoId])).rows[0]?.name ?? null
            : input.institution ?? null;
        return { ...row, institution };
    }
    catch (err) {
        console.error("insertHCP error:", err);
        return null;
    }
}
/** Update an existing HCP. Returns the updated HCP or null if not found. */
export async function updateHCP(id, input) {
    const p = getPool();
    if (!p)
        return null;
    const existing = await getHCPById(id);
    if (!existing)
        return null;
    try {
        const name = input.name !== undefined ? input.name.trim() : existing.name;
        const email = input.email !== undefined ? input.email.trim() : (existing.email ?? "");
        const phone = input.phone !== undefined ? `+52${input.phone.replace(/\D/g, "")}` : (existing.phone ?? "");
        const specialty = input.specialty !== undefined ? (input.specialty?.trim() || null) : (existing.specialty ?? null);
        const region = input.region !== undefined ? input.region : (existing.region ?? "");
        let hcoId = null;
        const institutionInput = input.institution !== undefined ? input.institution?.trim() : (existing.institution ?? null);
        if (institutionInput) {
            const hcoResult = await p.query("SELECT id FROM tbl_hco WHERE name = $1 LIMIT 1", [institutionInput]);
            if (hcoResult.rows[0]) {
                hcoId = hcoResult.rows[0].id;
            }
            else {
                const insertHco = await p.query(`INSERT INTO tbl_hco (name, region, status) VALUES ($1, $2, 'active') RETURNING id`, [institutionInput, region]);
                hcoId = insertHco.rows[0]?.id ?? null;
            }
        }
        await p.query(`UPDATE tbl_hcp SET name = $1, email = $2, phone = $3, specialty = $4, hco_id = $5, region = $6 WHERE id = $7`, [name, email, phone, specialty, hcoId, region, id]);
        const institution = hcoId
            ? (await p.query("SELECT name FROM tbl_hco WHERE id = $1", [hcoId])).rows[0]?.name ?? null
            : institutionInput ?? null;
        return { ...existing, name, email, phone, specialty, institution, region };
    }
    catch (err) {
        console.error("updateHCP error:", err);
        return null;
    }
}
/** Get single HCP by id. */
export async function getHCPById(id) {
    const p = getPool();
    if (!p)
        return null;
    try {
        const result = await p.query(`SELECT h.id, h.name, h.email, h.phone, h.specialty, o.name AS institution, h.region, h.created_at
       FROM tbl_hcp h LEFT JOIN tbl_hco o ON h.hco_id = o.id WHERE h.id = $1`, [id]);
        const r = result.rows[0];
        if (!r)
            return null;
        return { ...r, institution: r.institution ?? null };
    }
    catch {
        return null;
    }
}
const HCO_SORT_COLUMNS = ["name", "type", "region", "status", "created_at"];
function isHCOSortColumn(s) {
    return HCO_SORT_COLUMNS.includes(s);
}
/** HCO list. Paginated, filtered. */
export async function getHCOPaginated(filters, page, limit, sortBy, sortOrder) {
    const p = getPool();
    if (!p)
        return { rows: [], total: 0 };
    const conditions = [];
    const params = [];
    let paramIndex = 1;
    if (filters.search?.trim()) {
        conditions.push(`(LOWER(name) LIKE $${paramIndex} OR LOWER(type) LIKE $${paramIndex} OR LOWER(region) LIKE $${paramIndex} OR LOWER(status) LIKE $${paramIndex})`);
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
    const countResult = await p.query(`SELECT COUNT(*) AS count FROM tbl_hco ${whereClause}`, params);
    const total = Number(countResult.rows[0]?.count ?? 0);
    const offset = (page - 1) * limit;
    params.push(limit, offset);
    const sql = `SELECT id, name, type, region, status, created_at FROM tbl_hco ${whereClause} ORDER BY ${safeOrder} ${orderDir} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    const dataResult = await p.query(sql, params);
    return { rows: dataResult.rows, total };
}
/** Get single HCO by id. */
export async function getHCOById(id) {
    const p = getPool();
    if (!p)
        return null;
    try {
        const result = await p.query("SELECT id, name, type, region, status, created_at FROM tbl_hco WHERE id = $1", [id]);
        return result.rows[0] ?? null;
    }
    catch {
        return null;
    }
}
const MOCK_PRESENTATIONS = [
    { id: "mock-1", title: "Sample PDF (dev)", url: "https://www.africau.edu/images/default/sample.pdf", file_type: "pdf", created_at: new Date() },
    { id: "mock-2", title: "Sample PPTX (dev)", url: "https://www.learningcontainer.com/wp-content/uploads/2020/05/sample-pptx-file.pptx", file_type: "pptx", created_at: new Date() },
];
/** Get all presentations. */
export async function getPresentations() {
    const p = getPool();
    if (!p)
        return MOCK_PRESENTATIONS;
    try {
        const result = await p.query("SELECT id, title, url, file_type, created_at FROM tbl_presentations ORDER BY created_at DESC");
        return result.rows.length > 0 ? result.rows : MOCK_PRESENTATIONS;
    }
    catch {
        return MOCK_PRESENTATIONS;
    }
}
/** Get single presentation by id. */
export async function getPresentationById(id) {
    const p = getPool();
    if (!p)
        return MOCK_PRESENTATIONS.find((p) => p.id === id) ?? null;
    try {
        const result = await p.query("SELECT id, title, url, file_type, created_at FROM tbl_presentations WHERE id = $1", [id]);
        return result.rows[0] ?? null;
    }
    catch {
        return null;
    }
}
/** Insert audit log row (who did what). Table from migration 012. */
export async function insertAuditLog(row) {
    const p = getPool();
    if (!p)
        return;
    try {
        const userId = row.user_id?.trim();
        const isValidUuid = userId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
        await p.query(`INSERT INTO tbl_audit_log (user_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, $3, $4, $5)`, [
            isValidUuid ? userId : null,
            row.action,
            row.entity_type,
            row.entity_id ?? null,
            row.metadata ? JSON.stringify(row.metadata) : null,
        ]);
    }
    catch (err) {
        console.error("insertAuditLog error:", err);
    }
}
/** Insert a console log row (prod or when ENABLE_CONSOLE_LOG_DB=1). Table from migration 003. */
export async function insertConsoleLog(row) {
    const p = getPool();
    if (!p)
        return;
    try {
        await p.query(`INSERT INTO tbl_console_errors (level, message, message_hash, stack, source, env, user_id, request_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, [
            row.level || "log",
            row.message,
            row.message_hash ?? null,
            row.stack ?? null,
            row.source ?? "bff",
            row.env ?? process.env.NODE_ENV ?? "development",
            row.user_id ?? null,
            row.request_id ?? null,
            row.metadata ? JSON.stringify(row.metadata) : null,
        ]);
    }
    catch (err) {
        console.error("insertConsoleLog error:", err);
    }
}
