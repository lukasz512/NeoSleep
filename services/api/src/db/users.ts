import { getDb } from "./connection.js";
import { AppError, DatabaseError } from "../errors.js";

export interface User {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  name: string | null;
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

export interface StaffUser extends User {
  password_hash: string | null;
  force_password_change: boolean;
}

const USER_COLS =
  "id, email, first_name, last_name, name, role, provider, provider_id, region, territory, manager_id, phone, avatar_url, language, hire_date, is_active, token_version, created_at, updated_at";

const STAFF_AUTH_COLS = `${USER_COLS}, password_hash, force_password_change`;

export async function getOrCreateUserByProvider(
  provider: string,
  providerId: string,
  email: string,
  name?: string | null
): Promise<User | null> {
  try {
    const existing = await getDb().query<User>(
      `SELECT ${USER_COLS} FROM tbl_users WHERE provider = $1 AND provider_id = $2`,
      [provider, providerId]
    );
    if (existing.rows[0]) return existing.rows[0];
    const inserted = await getDb().query<User>(
      `INSERT INTO tbl_users (email, name, role, provider, provider_id)
       VALUES ($1, $2, 'rep', $3, $4)
       RETURNING ${USER_COLS}`,
      [email, name ?? null, provider, providerId]
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
      `SELECT ${USER_COLS} FROM tbl_users WHERE id = $1`,
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
      "SELECT id FROM tbl_users ORDER BY created_at ASC LIMIT 1"
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
      `SELECT ${STAFF_AUTH_COLS} FROM tbl_users WHERE email = $1`,
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
      `SELECT ${STAFF_AUTH_COLS} FROM tbl_users WHERE id = $1`,
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
      `UPDATE tbl_users SET password_hash = $1, force_password_change = false, last_password_change_at = now(), updated_at = now() WHERE id = $2`,
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
  try {
    const r = await getDb().query<User>(
      `INSERT INTO tbl_users (email, name, role, provider, provider_id, password_hash, force_password_change)
       VALUES ($1, $2, $3, 'local', $4, $5, $6)
       ON CONFLICT (provider, provider_id) DO NOTHING
       RETURNING ${USER_COLS}`,
      [normalizedEmail, name ?? null, role, normalizedEmail, passwordHash, forcePasswordChange]
    );
    return r.rows[0] ?? null;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("insertStaffUser", err);
  }
}

export async function getUserIdByEmail(email: string): Promise<string | null> {
  try {
    const r = await getDb().query<{ id: string }>(
      "SELECT id FROM tbl_users WHERE email = $1",
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
      "UPDATE tbl_users SET token_version = token_version + 1 WHERE id = $1",
      [userId]
    );
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("incrementUserTokenVersion", err);
  }
}
