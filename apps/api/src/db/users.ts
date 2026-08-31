import type { PoolClient } from "pg";
import { toArray } from "./helpers.js";
import { AppError, DatabaseError } from "../errors.js";

export type StaffRole = "admin" | "manager" | "kam" | "msl" | "rep" | "doctor";

export interface User {
  id: string;
  identity_id: string;
  // From identities JOIN
  email: string;
  salutation: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  /** Computed: first_name + ' ' + last_name */
  name: string | null;
  // From user_roles JOIN — matches the user_roles.role CHECK constraint.
  // "Primary" role/scope (earliest-granted user_roles row) — a user can hold
  // more than one {role, scope} pair (see getUserRoleScopes); most of the app
  // only needs the primary one, mirroring how session/UI treat role today.
  role: StaffRole;
  /** 'global' or a country_code (e.g. 'PL') — the RBAC access scope of `role` above. */
  scope: string;
  // From users table
  google_sub: string | null;
  region: string | null;
  country_code: string | null;
  // From identities JOIN
  language: string | null;
  territory_id: string | null;
  status: string;
  token_version: number;
  created_at: Date;
  updated_at: Date;
}

export interface StaffUser extends User {
  password_hash: string | null;
  force_password_change: boolean;
}

// LATERAL + LIMIT 1 (not a plain LEFT JOIN) so a user with more than one
// user_roles row never fans out the outer query into duplicate result rows —
// it always returns exactly one (earliest-granted) role/scope pair here.
// Use getUserRoleScopes() when the full set is needed (session/RBAC).
const USER_JOIN = `
  FROM users u
  JOIN identities i ON u.identity_id = i.id
  LEFT JOIN LATERAL (
    SELECT role, scope FROM user_roles WHERE user_id = u.id ORDER BY created_at ASC LIMIT 1
  ) ur ON true`.trim();

const USER_COLS = `
  u.id, u.identity_id, i.email, i.title AS salutation, i.first_name, i.last_name, i.phone,
  TRIM(COALESCE(i.first_name, '') || ' ' || COALESCE(i.last_name, '')) AS name,
  COALESCE(ur.role, 'rep') AS role,
  COALESCE(ur.scope, 'global') AS scope,
  u.google_sub, i.region, i.country_code, i.language, i.territory_id, u.status, u.token_version,
  u.created_at, u.updated_at`.trim();

const STAFF_AUTH_COLS = `${USER_COLS}, u.password_hash, u.force_password_change`;

/**
 * All functions below take a tenant-scoped PoolClient (from withTenant()) as the
 * first argument — table names are unqualified because SET LOCAL search_path is
 * already in effect on that client. Never call these with a pool-level client.
 */

export async function getOrCreateUserByProvider(
  client: PoolClient,
  _provider: string,
  googleSub: string,
  email: string,
  name?: string | null
): Promise<User | null> {
  try {
    // Check by google_sub first
    const existing = await client.query<User>(
      `SELECT ${USER_COLS} ${USER_JOIN} WHERE u.google_sub = $1 AND u.deleted_at IS NULL`,
      [googleSub]
    );
    if (existing.rows[0]) return existing.rows[0];

    // Not found — create. The surrounding withTenant() transaction owns atomicity.
    const firstName = name ? name.split(" ")[0] ?? null : null;
    const lastName = name && name.includes(" ") ? name.split(" ").slice(1).join(" ") : null;

    const identityResult = await client.query<{ id: string }>(
      `INSERT INTO identities (email, first_name, last_name) VALUES ($1, $2, $3) RETURNING id`,
      [email.trim().toLowerCase(), firstName, lastName]
    );
    const identityId = identityResult.rows[0]!.id;

    const userResult = await client.query<{ id: string }>(
      `INSERT INTO users (identity_id, google_sub, status) VALUES ($1, $2, 'active') RETURNING id`,
      [identityId, googleSub]
    );
    const userId = userResult.rows[0]!.id;

    await client.query(
      `INSERT INTO user_roles (user_id, role, scope) VALUES ($1, 'rep', 'global') ON CONFLICT (user_id, role, scope) DO NOTHING`,
      [userId]
    );

    const inserted = await client.query<User>(
      `SELECT ${USER_COLS} ${USER_JOIN} WHERE u.id = $1`,
      [userId]
    );
    return inserted.rows[0] ?? null;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getOrCreateUserByProvider", err);
  }
}

export async function getUserById(client: PoolClient, id: string): Promise<User | null> {
  try {
    const r = await client.query<User>(
      `SELECT ${USER_COLS} ${USER_JOIN} WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [id]
    );
    return r.rows[0] ?? null;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getUserById", err);
  }
}

export async function getStaffUserByEmail(client: PoolClient, email: string): Promise<StaffUser | null> {
  try {
    const r = await client.query<StaffUser>(
      `SELECT ${STAFF_AUTH_COLS} ${USER_JOIN} WHERE i.email = $1 AND u.deleted_at IS NULL`,
      [email.trim().toLowerCase()]
    );
    return r.rows[0] ?? null;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getStaffUserByEmail", err);
  }
}

export async function setUserPassword(
  client: PoolClient,
  userId: string,
  passwordHash: string,
  forcePasswordChange = false
): Promise<void> {
  try {
    await client.query(
      `UPDATE users SET password_hash = $1, force_password_change = $2, updated_at = now() WHERE id = $3`,
      [passwordHash, forcePasswordChange, userId]
    );
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("setUserPassword", err);
  }
}

/** Shallow-merges into identities.metadata JSONB — used to record clinic/invoice data collected at partner-invite acceptance. */
export async function mergeIdentityMetadataForUser(
  client: PoolClient,
  userId: string,
  patch: Record<string, unknown>
): Promise<void> {
  try {
    await client.query(
      `UPDATE identities i SET metadata = COALESCE(i.metadata, '{}'::jsonb) || $1::jsonb, updated_at = now()
       FROM users u WHERE u.identity_id = i.id AND u.id = $2`,
      [JSON.stringify(patch), userId]
    );
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("mergeIdentityMetadataForUser", err);
  }
}

export async function insertStaffUser(
  client: PoolClient,
  email: string,
  firstName: string | null,
  lastName: string | null,
  role: StaffRole,
  passwordHash: string | null,
  forcePasswordChange: boolean,
  salutation?: string | null,
  phone?: string | null,
  scope = "global",
  grantedBy?: string | null
): Promise<User | null> {
  const normalizedEmail = email.trim().toLowerCase();

  try {
    const identityResult = await client.query<{ id: string }>(
      `INSERT INTO identities (email, title, first_name, last_name, phone) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
       RETURNING id`,
      [normalizedEmail, salutation?.trim() || null, firstName, lastName, phone ?? null]
    );
    const identityId = identityResult.rows[0]!.id;

    // identity_id is UNIQUE on users, so a previously soft-deleted staff user
    // (deleted_at set) still occupies this slot and would otherwise make this
    // email permanently unreusable. Reactivate it instead of no-op'ing — but
    // only when the conflicting row is actually soft-deleted: if it's a live
    // active/suspended user, the WHERE clause below leaves it untouched and
    // this still returns no row, so the caller's "already exists" check fires.
    const userResult = await client.query<{ id: string }>(
      `INSERT INTO users (identity_id, password_hash, force_password_change, status)
       VALUES ($1, $2, $3, 'active')
       ON CONFLICT (identity_id) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         force_password_change = EXCLUDED.force_password_change,
         status = 'active',
         deleted_at = NULL,
         updated_at = now()
       WHERE users.deleted_at IS NOT NULL
       RETURNING id`,
      [identityId, passwordHash, forcePasswordChange]
    );
    if (!userResult.rows[0]) return null;
    const userId = userResult.rows[0].id;

    // Delete-then-insert (rather than ON CONFLICT) since reactivation may need
    // to replace roles left over from before the account was deleted, and
    // user_roles' only unique constraint is the composite (user_id, role,
    // scope) — not user_id alone — so ON CONFLICT (user_id) has no matching
    // constraint to target.
    await client.query(`DELETE FROM user_roles WHERE user_id = $1`, [userId]);
    await client.query(
      `INSERT INTO user_roles (user_id, role, scope, granted_by) VALUES ($1, $2, $3, $4)`,
      [userId, role, scope, grantedBy ?? null]
    );

    const r = await client.query<User>(
      `SELECT ${USER_COLS} ${USER_JOIN} WHERE u.id = $1`,
      [userId]
    );
    return r.rows[0] ?? null;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("insertStaffUser", err);
  }
}

export interface UserRoleScope {
  role: StaffRole;
  scope: string;
}

/**
 * Full {role, scope} set for a user (unlike User.role/scope on USER_COLS,
 * which only surface the earliest-granted pair). Used at login/session-
 * refresh time to build the RBAC scope set requireScope() checks against.
 */
export async function getUserRoleScopes(client: PoolClient, userId: string): Promise<UserRoleScope[]> {
  try {
    const r = await client.query<UserRoleScope>(
      `SELECT role, scope FROM user_roles WHERE user_id = $1 ORDER BY created_at ASC`,
      [userId]
    );
    return r.rows;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getUserRoleScopes", err);
  }
}

/** Seeded staff accounts with no password set yet (bootstrapped on startup — see auth.ts). */
export async function getUsersWithoutPassword(client: PoolClient): Promise<{ id: string; email: string }[]> {
  try {
    const r = await client.query<{ id: string; email: string }>(
      `SELECT u.id, i.email FROM users u JOIN identities i ON u.identity_id = i.id
       WHERE u.password_hash IS NULL AND u.deleted_at IS NULL`
    );
    return r.rows;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getUsersWithoutPassword", err);
  }
}

export async function getUserIdByEmail(client: PoolClient, email: string): Promise<string | null> {
  try {
    const r = await client.query<{ id: string }>(
      `SELECT u.id FROM users u JOIN identities i ON u.identity_id = i.id WHERE i.email = $1 AND u.deleted_at IS NULL`,
      [email.trim().toLowerCase()]
    );
    return r.rows[0]?.id ?? null;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getUserIdByEmail", err);
  }
}

/** Single-column read for TenantContext.buildContext()'s per-request token_version check —
 *  cheaper than getUserById's full identities/user_roles join. */
export async function getUserTokenVersion(client: PoolClient, userId: string): Promise<number | null> {
  try {
    const r = await client.query<{ token_version: number }>(
      `SELECT token_version FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [userId]
    );
    return r.rows[0]?.token_version ?? null;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getUserTokenVersion", err);
  }
}

export async function incrementUserTokenVersion(client: PoolClient, userId: string): Promise<void> {
  try {
    await client.query(
      "UPDATE users SET token_version = token_version + 1 WHERE id = $1",
      [userId]
    );
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("incrementUserTokenVersion", err);
  }
}

export interface GetUsersFilters {
  search?: string;
  role?: string | string[];
  status?: string | string[];
  /** RBAC scope filter: null = unrestricted, [] = matches nothing, otherwise restrict to these country_codes. */
  countryCodes?: string[] | null;
}

const USER_SORT_COLUMNS = ["first_name", "last_name", "email", "status", "created_at"] as const;
function isUserSortColumn(s: string): s is (typeof USER_SORT_COLUMNS)[number] {
  return USER_SORT_COLUMNS.includes(s as (typeof USER_SORT_COLUMNS)[number]);
}

export async function getUsersPaginated(
  client: PoolClient,
  filters: GetUsersFilters,
  page: number,
  limit: number,
  sortBy: string,
  sortOrder: "asc" | "desc"
): Promise<{ rows: User[]; total: number }> {
  const conditions: string[] = ["u.deleted_at IS NULL"];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters.search?.trim()) {
    conditions.push(
      `(LOWER(i.first_name) LIKE $${paramIndex} OR LOWER(i.last_name) LIKE $${paramIndex} OR LOWER(i.email) LIKE $${paramIndex})`
    );
    params.push(`%${filters.search.trim().toLowerCase()}%`);
    paramIndex++;
  }
  const roleArr = toArray(filters.role);
  if (roleArr.length > 0) {
    conditions.push(`ur.role = ANY($${paramIndex}::text[])`);
    params.push(roleArr);
    paramIndex++;
  }
  if (filters.countryCodes !== undefined && filters.countryCodes !== null) {
    conditions.push(`i.country_code = ANY($${paramIndex}::text[])`);
    params.push(filters.countryCodes);
    paramIndex++;
  }
  const statusArr = toArray(filters.status);
  if (statusArr.length > 0) {
    conditions.push(`u.status = ANY($${paramIndex}::text[])`);
    params.push(statusArr);
    paramIndex++;
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;
  const orderCol = isUserSortColumn(sortBy) ? sortBy : "created_at";
  const orderDir = sortOrder === "asc" ? "ASC" : "DESC";
  const safeOrder = orderCol === "created_at" ? "u.created_at" : `i."${orderCol}"`;

  try {
    const countResult = await client.query<{ count: string }>(
      `SELECT COUNT(DISTINCT u.id) AS count ${USER_JOIN} ${whereClause}`,
      params
    );
    const total = Number(countResult.rows[0]?.count ?? 0);

    const offset = (page - 1) * limit;
    params.push(limit, offset);
    const dataResult = await client.query<User>(
      `SELECT ${USER_COLS} ${USER_JOIN} ${whereClause}
       ORDER BY ${safeOrder} ${orderDir} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params
    );
    return { rows: dataResult.rows, total };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getUsersPaginated", err);
  }
}

export interface UpdateUserInput {
  salutation?: string | null;
  first_name?: string;
  last_name?: string;
  phone?: string | null;
  status?: "active" | "inactive" | "suspended";
  country_code?: string | null;
  role?: StaffRole;
  /** 'global' or a country_code — RBAC access scope for `role`. Defaults to the existing scope, or 'global' for a brand-new role. */
  scope?: string;
}

export async function updateUser(
  client: PoolClient,
  id: string,
  input: UpdateUserInput,
  grantedBy?: string | null
): Promise<User | null> {
  const existing = await getUserById(client, id);
  if (!existing) return null;

  try {
    if (
      input.salutation !== undefined ||
      input.first_name !== undefined ||
      input.last_name !== undefined ||
      input.phone !== undefined
    ) {
      // Unconditional write per field (not COALESCE) so an explicit null
      // (e.g. clearing the salutation combobox) actually clears it, while a
      // field simply absent from the payload falls back to its current value.
      const salutation = input.salutation !== undefined ? (input.salutation?.trim() || null) : existing.salutation;
      const firstName  = input.first_name !== undefined ? input.first_name : existing.first_name;
      const lastName   = input.last_name  !== undefined ? input.last_name  : existing.last_name;
      const phone      = input.phone      !== undefined ? input.phone      : existing.phone;
      await client.query(
        `UPDATE identities i SET
           title      = $1,
           first_name = $2,
           last_name  = $3,
           phone      = $4,
           updated_at = now()
         FROM users u
         WHERE u.identity_id = i.id AND u.id = $5`,
        [salutation, firstName, lastName, phone, id]
      );
    }
    if (input.status !== undefined) {
      await client.query(`UPDATE users SET status = $1, updated_at = now() WHERE id = $2`, [input.status, id]);
    }
    if (input.country_code !== undefined) {
      await client.query(`UPDATE identities SET country_code = $1, updated_at = now() WHERE id = $2`, [input.country_code, existing.identity_id]);
    }
    if (input.role !== undefined || input.scope !== undefined) {
      // Single {role, scope} pair per user for now (no multi-role assignment
      // UI yet) — replace rather than upsert so a role change doesn't leave
      // a stale row behind under the old role.
      const role = input.role ?? existing.role;
      const scope = input.scope ?? existing.scope;
      await client.query(`DELETE FROM user_roles WHERE user_id = $1`, [id]);
      await client.query(
        `INSERT INTO user_roles (user_id, role, scope, granted_by) VALUES ($1, $2, $3, $4)`,
        [id, role, scope, grantedBy ?? null]
      );
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("updateUser", err);
  }

  return getUserById(client, id);
}

export async function softDeleteUser(client: PoolClient, id: string): Promise<void> {
  try {
    await client.query(
      `UPDATE users SET deleted_at = now(), status = 'inactive' WHERE id = $1`,
      [id]
    );
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("softDeleteUser", err);
  }
}
