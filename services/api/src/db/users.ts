import { getDb } from "./connection.js";

export interface User {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  name: string | null;  // backward compat; may be derived from first_name + last_name
  role: "admin" | "manager" | "rep";
  provider: string;
  provider_id: string;
  region: string | null;
  territory: string | null;
  manager_id: string | null;
  phone: string | null;
  avatar_url: string | null;
  language: string;
  hire_date: Date | null;
  is_active: boolean;
  token_version: number;
  created_at: Date;
  updated_at: Date;
}

/** Staff user with password fields (migration 014). Used for email/password login. */
export interface StaffUser extends User {
  password_hash: string | null;
  force_password_change: boolean;
}

const USER_COLS =
  "id, email, first_name, last_name, name, role, provider, provider_id, region, territory, manager_id, phone, avatar_url, language, hire_date, is_active, token_version, created_at, updated_at";

const STAFF_AUTH_COLS =
  `${USER_COLS}, password_hash, force_password_change`;

/** Get or create user by auth provider (e.g. Google). New users get role 'rep'. */
export async function getOrCreateUserByProvider(
  provider: string,
  providerId: string,
  email: string,
  name?: string | null
): Promise<User | null> {
  const p = getDb();
  if (!p) return null;
  try {
    const existing = await p.query<User>(
      `SELECT ${USER_COLS} FROM tbl_users WHERE provider = $1 AND provider_id = $2`,
      [provider, providerId]
    );
    if (existing.rows[0]) return existing.rows[0];
    const inserted = await p.query<User>(
      `INSERT INTO tbl_users (email, name, role, provider, provider_id)
       VALUES ($1, $2, 'rep', $3, $4)
       RETURNING ${USER_COLS}`,
      [email, name ?? null, provider, providerId]
    );
    return inserted.rows[0] ?? null;
  } catch (err) {
    console.error("getOrCreateUserByProvider error:", err);
    return null;
  }
}

export async function getUserById(id: string): Promise<User | null> {
  const p = getDb();
  if (!p) return null;
  try {
    const r = await p.query<User>(
      `SELECT ${USER_COLS} FROM tbl_users WHERE id = $1`,
      [id]
    );
    return r.rows[0] ?? null;
  } catch (err) {
    console.error("getUserById error:", err);
    return null;
  }
}

/** Get first user id (dev fallback when session is empty). */
export async function getFirstUserId(): Promise<string | null> {
  const p = getDb();
  if (!p) return null;
  try {
    const r = await p.query<{ id: string }>("SELECT id FROM tbl_users ORDER BY created_at ASC LIMIT 1");
    return r.rows[0]?.id ?? null;
  } catch (err) {
    console.error("getFirstUserId error:", err);
    return null;
  }
}

export async function getStaffUserByEmail(email: string): Promise<StaffUser | null> {
  const p = getDb();
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

export async function getStaffUserById(id: string): Promise<StaffUser | null> {
  const p = getDb();
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

export async function setUserPassword(userId: string, passwordHash: string): Promise<boolean> {
  const p = getDb();
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


/** Insert staff user (provider='local') for email/password login. */
export async function insertStaffUser(
  email: string,
  name: string | null,
  role: "admin" | "manager" | "rep",
  passwordHash: string,
  forcePasswordChange: boolean
): Promise<User | null> {
  const p = getDb();
  if (!p) return null;
  const normalizedEmail = email.trim().toLowerCase();
  try {
    const r = await p.query<User>(
      `INSERT INTO tbl_users (email, name, role, provider, provider_id, password_hash, force_password_change)
       VALUES ($1, $2, $3, 'local', $4, $5, $6)
       ON CONFLICT (provider, provider_id) DO NOTHING
       RETURNING ${USER_COLS}`,
      [normalizedEmail, name ?? null, role, normalizedEmail, passwordHash, forcePasswordChange]
    );
    return r.rows[0] ?? null;
  } catch (err) {
    console.error("insertStaffUser error:", err);
    return null;
  }
}

export async function getUserIdByEmail(email: string): Promise<string | null> {
  const p = getDb();
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

/** Increment token_version to immediately invalidate all remember-me sessions for a user. */
export async function incrementUserTokenVersion(userId: string): Promise<boolean> {
  const p = getDb();
  if (!p) return false;
  try {
    await p.query(
      "UPDATE tbl_users SET token_version = token_version + 1 WHERE id = $1",
      [userId]
    );
    return true;
  } catch (err) {
    console.error("incrementUserTokenVersion error:", err);
    return false;
  }
}
