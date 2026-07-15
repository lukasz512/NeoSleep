import type { PoolClient } from "pg";
import { toArray } from "./helpers.js";
import { AppError, DatabaseError } from "../errors.js";

export type StaffRole = "admin" | "manager" | "kam" | "msl" | "rep" | "doctor";

export interface User {
  id: string;
  identity_id: string;
  // From identities JOIN
  email: string;
  first_name: string | null;
  last_name: string | null;
  /** Computed: first_name + ' ' + last_name */
  name: string | null;
  // From user_roles JOIN — matches the user_roles.role CHECK constraint
  role: StaffRole;
  // From users table
  google_sub: string | null;
  region: string | null;
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

const USER_JOIN = `
  FROM users u
  JOIN identities i ON u.identity_id = i.id
  LEFT JOIN user_roles ur ON ur.user_id = u.id`.trim();

const USER_COLS = `
  u.id, u.identity_id, i.email, i.first_name, i.last_name,
  TRIM(COALESCE(i.first_name, '') || ' ' || COALESCE(i.last_name, '')) AS name,
  COALESCE(ur.role, 'rep') AS role,
  u.google_sub, u.region, u.territory_id, u.status, u.token_version,
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
      `INSERT INTO user_roles (user_id, role) VALUES ($1, 'rep') ON CONFLICT (user_id) DO NOTHING`,
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

export async function insertStaffUser(
  client: PoolClient,
  email: string,
  name: string | null,
  role: StaffRole,
  passwordHash: string | null,
  forcePasswordChange: boolean
): Promise<User | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const firstName = name ? name.split(" ")[0] ?? null : null;
  const lastName = name && name.includes(" ") ? name.split(" ").slice(1).join(" ") : null;

  try {
    const identityResult = await client.query<{ id: string }>(
      `INSERT INTO identities (email, first_name, last_name) VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
       RETURNING id`,
      [normalizedEmail, firstName, lastName]
    );
    const identityId = identityResult.rows[0]!.id;

    const userResult = await client.query<{ id: string }>(
      `INSERT INTO users (identity_id, password_hash, force_password_change, status)
       VALUES ($1, $2, $3, 'active')
       ON CONFLICT (identity_id) DO NOTHING
       RETURNING id`,
      [identityId, passwordHash, forcePasswordChange]
    );
    if (!userResult.rows[0]) return null;
    const userId = userResult.rows[0].id;

    await client.query(
      `INSERT INTO user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING`,
      [userId, role]
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
  first_name?: string;
  last_name?: string;
  phone?: string | null;
  status?: "active" | "inactive" | "suspended";
  country_code?: string | null;
  role?: StaffRole;
}

export async function updateUser(client: PoolClient, id: string, input: UpdateUserInput): Promise<User | null> {
  const existing = await getUserById(client, id);
  if (!existing) return null;

  try {
    if (input.first_name !== undefined || input.last_name !== undefined || input.phone !== undefined) {
      await client.query(
        `UPDATE identities i SET
           first_name = COALESCE($1, i.first_name),
           last_name  = COALESCE($2, i.last_name),
           phone      = $3,
           updated_at = now()
         FROM users u
         WHERE u.identity_id = i.id AND u.id = $4`,
        [input.first_name ?? null, input.last_name ?? null, input.phone ?? null, id]
      );
    }
    if (input.status !== undefined) {
      await client.query(`UPDATE users SET status = $1, updated_at = now() WHERE id = $2`, [input.status, id]);
    }
    if (input.country_code !== undefined) {
      await client.query(`UPDATE users SET country_code = $1, updated_at = now() WHERE id = $2`, [input.country_code, id]);
    }
    if (input.role !== undefined) {
      // Single global role per user (region IS NULL) — replace rather than upsert,
      // since UNIQUE(user_id, role, region) treats NULL region as never-equal.
      await client.query(`DELETE FROM user_roles WHERE user_id = $1 AND region IS NULL`, [id]);
      await client.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, $2)`, [id, input.role]);
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
