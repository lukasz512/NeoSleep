import type { PoolClient } from "pg";
import { DatabaseError } from "../errors.js";

/** Tenant-scoped — pass the PoolClient from withTenant() so search_path is set. */

export async function createPasswordResetToken(
  client: PoolClient,
  userId: string,
  tokenHash: string,
  expiresAt: Date
): Promise<void> {
  try {
    await client.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [userId, tokenHash, expiresAt]
    );
  } catch (err) {
    throw new DatabaseError("createPasswordResetToken", err);
  }
}

export async function getPasswordResetUserIdByHash(client: PoolClient, tokenHash: string): Promise<string | null> {
  try {
    const r = await client.query<{ user_id: string }>(
      `SELECT user_id FROM password_reset_tokens WHERE token_hash = $1 AND expires_at > now()`,
      [tokenHash]
    );
    return r.rows[0]?.user_id ?? null;
  } catch (err) {
    throw new DatabaseError("getPasswordResetUserIdByHash", err);
  }
}

export async function deletePasswordResetTokenByHash(client: PoolClient, tokenHash: string): Promise<void> {
  try {
    await client.query("DELETE FROM password_reset_tokens WHERE token_hash = $1", [tokenHash]);
  } catch (err) {
    throw new DatabaseError("deletePasswordResetTokenByHash", err);
  }
}

// ---------------------------------------------------------------------------
// remember_me_tokens — refresh-token rotation (ADR-020)
//
// One row per issued refresh token. `revoked_at` set + `replaced_by_id` NULL
// means "revoked, dead end" (logout, or the tail of a theft-killed chain).
// `revoked_at` set + `replaced_by_id` pointing at another row means "rotated
// away" — that row's hash must never authenticate again; if it's presented,
// the whole chain for that user is theft and gets revoked (see auth.ts).
// ---------------------------------------------------------------------------

export interface RememberMeTokenRow {
  id: string;
  user_id: string;
  created_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
  replaced_by_id: string | null;
}

export async function insertRememberMeToken(
  client: PoolClient,
  input: { userId: string; tokenHash: string; expiresAt: Date; userAgent?: string | null; ipAddress?: string | null }
): Promise<string> {
  try {
    const r = await client.query<{ id: string }>(
      `INSERT INTO remember_me_tokens (user_id, token_hash, expires_at, user_agent, ip_address)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [input.userId, input.tokenHash, input.expiresAt, input.userAgent ?? null, input.ipAddress ?? null]
    );
    return r.rows[0]!.id;
  } catch (err) {
    throw new DatabaseError("insertRememberMeToken", err);
  }
}

export async function getRememberMeTokenByHash(client: PoolClient, tokenHash: string): Promise<RememberMeTokenRow | null> {
  try {
    const r = await client.query<RememberMeTokenRow>(
      `SELECT id, user_id, created_at, expires_at, revoked_at, replaced_by_id
       FROM remember_me_tokens WHERE token_hash = $1`,
      [tokenHash]
    );
    return r.rows[0] ?? null;
  } catch (err) {
    throw new DatabaseError("getRememberMeTokenByHash", err);
  }
}

/** Rotates one token: inserts the new row, marks the old one revoked + linked to it.
 *  Both writes happen on the same client — callers already run this inside withTenant()'s
 *  transaction, so a failure here rolls back the whole /auth/refresh request. */
export async function rotateRememberMeToken(
  client: PoolClient,
  oldId: string,
  next: { userId: string; tokenHash: string; expiresAt: Date; userAgent?: string | null; ipAddress?: string | null }
): Promise<string> {
  try {
    const newId = await insertRememberMeToken(client, next);
    await client.query(
      `UPDATE remember_me_tokens SET revoked_at = now(), replaced_by_id = $1, last_used_at = now() WHERE id = $2`,
      [newId, oldId]
    );
    return newId;
  } catch (err) {
    throw new DatabaseError("rotateRememberMeToken", err);
  }
}

export async function revokeRememberMeToken(client: PoolClient, id: string): Promise<void> {
  try {
    await client.query(`UPDATE remember_me_tokens SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`, [id]);
  } catch (err) {
    throw new DatabaseError("revokeRememberMeToken", err);
  }
}

/** Kills every outstanding token for a user — password change, or theft response
 *  when a rotated-away token is reused. Simplest correct implementation: revoke
 *  everything for the user rather than walking the replaced_by_id chain. */
export async function revokeAllRememberMeTokensForUser(client: PoolClient, userId: string): Promise<void> {
  try {
    await client.query(
      `UPDATE remember_me_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId]
    );
  } catch (err) {
    throw new DatabaseError("revokeAllRememberMeTokensForUser", err);
  }
}

