import { getPool } from "./pool.js";

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

const STAFF_AUTH_COLS =
  "id, email, name, role, provider, provider_id, region, created_at, updated_at, password_hash, force_password_change";

/** Get or create user by auth provider (e.g. Google). New users get role 'rep'. */
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

/** Get first user id (dev fallback when session is empty). */
export async function getFirstUserId(): Promise<string | null> {
  const p = getPool();
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

export async function setUserPassword(userId: string, passwordHash: string): Promise<boolean> {
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

export async function deleteRememberMeToken(tokenId: string): Promise<void> {
  const p = getPool();
  if (!p) return;
  try {
    await p.query("DELETE FROM tbl_remember_me_tokens WHERE id = $1", [tokenId]);
  } catch (err) {
    console.error("deleteRememberMeToken error:", err);
  }
}

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

export async function getPasswordResetUserIdByHash(tokenHash: string): Promise<string | null> {
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

export async function deletePasswordResetTokenByHash(tokenHash: string): Promise<void> {
  const p = getPool();
  if (!p) return;
  try {
    await p.query("DELETE FROM tbl_password_reset_tokens WHERE token_hash = $1", [tokenHash]);
  } catch (err) {
    console.error("deletePasswordResetTokenByHash error:", err);
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
