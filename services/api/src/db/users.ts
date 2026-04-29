import { getDb } from "./connection.js";
import { AppError, DatabaseError } from "../errors.js";

export interface User {
  id: string;
  identity_id: string;
  // From identities JOIN
  email: string;
  first_name: string | null;
  last_name: string | null;
  /** Computed: first_name + ' ' + last_name */
  name: string | null;
  // From user_roles JOIN
  role: "admin" | "manager" | "rep";
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

export async function getOrCreateUserByProvider(
  _provider: string,
  googleSub: string,
  email: string,
  name?: string | null
): Promise<User | null> {
  try {
    // Check by google_sub first
    const existing = await getDb().query<User>(
      `SELECT ${USER_COLS} ${USER_JOIN} WHERE u.google_sub = $1 AND u.deleted_at IS NULL`,
      [googleSub]
    );
    if (existing.rows[0]) return existing.rows[0];

    // Not found — create via transaction
    const firstName = name ? name.split(" ")[0] ?? null : null;
    const lastName = name && name.includes(" ") ? name.split(" ").slice(1).join(" ") : null;

    const client = await getDb().connect();
    let userId: string;
    try {
      await client.query("BEGIN");

      const identityResult = await client.query<{ id: string }>(
        `INSERT INTO identities (email, first_name, last_name) VALUES ($1, $2, $3) RETURNING id`,
        [email.trim().toLowerCase(), firstName, lastName]
      );
      const identityId = identityResult.rows[0]!.id;

      const userResult = await client.query<{ id: string }>(
        `INSERT INTO users (identity_id, google_sub, status) VALUES ($1, $2, 'active') RETURNING id`,
        [identityId, googleSub]
      );
      userId = userResult.rows[0]!.id;

      await client.query(
        `INSERT INTO user_roles (user_id, role) VALUES ($1, 'rep') ON CONFLICT (user_id) DO NOTHING`,
        [userId]
      );

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    const inserted = await getDb().query<User>(
      `SELECT ${USER_COLS} ${USER_JOIN} WHERE u.id = $1`,
      [userId]
    );
    return inserted.rows[0] ?? null;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getOrCreateUserByProvider", err);
  }
}

export async function getUserById(id: string): Promise<User | null> {
  try {
    const r = await getDb().query<User>(
      `SELECT ${USER_COLS} ${USER_JOIN} WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [id]
    );
    return r.rows[0] ?? null;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getUserById", err);
  }
}

export async function getFirstUserId(): Promise<string | null> {
  try {
    const r = await getDb().query<{ id: string }>(
      "SELECT id FROM users WHERE deleted_at IS NULL ORDER BY created_at ASC LIMIT 1"
    );
    return r.rows[0]?.id ?? null;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getFirstUserId", err);
  }
}

export async function getStaffUserByEmail(email: string): Promise<StaffUser | null> {
  try {
    const r = await getDb().query<StaffUser>(
      `SELECT ${STAFF_AUTH_COLS} ${USER_JOIN} WHERE i.email = $1 AND u.deleted_at IS NULL`,
      [email.trim().toLowerCase()]
    );
    return r.rows[0] ?? null;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getStaffUserByEmail", err);
  }
}

export async function getStaffUserById(id: string): Promise<StaffUser | null> {
  try {
    const r = await getDb().query<StaffUser>(
      `SELECT ${STAFF_AUTH_COLS} ${USER_JOIN} WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [id]
    );
    return r.rows[0] ?? null;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getStaffUserById", err);
  }
}

export async function setUserPassword(userId: string, passwordHash: string): Promise<void> {
  try {
    await getDb().query(
      `UPDATE users SET password_hash = $1, force_password_change = false, updated_at = now() WHERE id = $2`,
      [passwordHash, userId]
    );
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("setUserPassword", err);
  }
}

export async function insertStaffUser(
  email: string,
  name: string | null,
  role: "admin" | "manager" | "rep",
  passwordHash: string,
  forcePasswordChange: boolean
): Promise<User | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const firstName = name ? name.split(" ")[0] ?? null : null;
  const lastName = name && name.includes(" ") ? name.split(" ").slice(1).join(" ") : null;

  const client = await getDb().connect();
  let userId: string;
  try {
    await client.query("BEGIN");

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
    if (!userResult.rows[0]) {
      await client.query("ROLLBACK");
      return null;
    }
    userId = userResult.rows[0].id;

    await client.query(
      `INSERT INTO user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING`,
      [userId, role]
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    if (err instanceof AppError) throw err;
    throw new DatabaseError("insertStaffUser", err);
  } finally {
    client.release();
  }

  const r = await getDb().query<User>(
    `SELECT ${USER_COLS} ${USER_JOIN} WHERE u.id = $1`,
    [userId]
  );
  return r.rows[0] ?? null;
}

export async function getUserIdByEmail(email: string): Promise<string | null> {
  try {
    const r = await getDb().query<{ id: string }>(
      `SELECT u.id FROM users u JOIN identities i ON u.identity_id = i.id WHERE i.email = $1 AND u.deleted_at IS NULL`,
      [email.trim().toLowerCase()]
    );
    return r.rows[0]?.id ?? null;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getUserIdByEmail", err);
  }
}

export async function incrementUserTokenVersion(userId: string): Promise<void> {
  try {
    await getDb().query(
      "UPDATE users SET token_version = token_version + 1 WHERE id = $1",
      [userId]
    );
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("incrementUserTokenVersion", err);
  }
}
