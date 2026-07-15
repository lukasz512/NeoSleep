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

export interface RememberMeToken {
  id: string;
  user_id: string;
  token_hash: string;
}

export async function createRememberMeToken(
  client: PoolClient,
  userId: string,
  tokenHash: string,
  expiresAt: Date,
  deviceName?: string
): Promise<string> {
  try {
    const r = await client.query<{ id: string }>(
      `INSERT INTO remember_me_tokens (user_id, token_hash, expires_at, device_name)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [userId, tokenHash, expiresAt, deviceName ?? null]
    );
    return r.rows[0]!.id;
  } catch (err) {
    throw new DatabaseError("createRememberMeToken", err);
  }
}

/** Unrevoked + unexpired only. */
export async function getRememberMeTokenById(client: PoolClient, id: string): Promise<RememberMeToken | null> {
  try {
    const r = await client.query<RememberMeToken>(
      `SELECT id, user_id, token_hash FROM remember_me_tokens
       WHERE id = $1 AND revoked_at IS NULL AND expires_at > now()`,
      [id]
    );
    return r.rows[0] ?? null;
  } catch (err) {
    throw new DatabaseError("getRememberMeTokenById", err);
  }
}

export async function touchRememberMeToken(client: PoolClient, id: string): Promise<void> {
  try {
    await client.query(`UPDATE remember_me_tokens SET last_used_at = now() WHERE id = $1`, [id]);
  } catch (err) {
    throw new DatabaseError("touchRememberMeToken", err);
  }
}

export async function revokeRememberMeToken(client: PoolClient, id: string): Promise<void> {
  try {
    await client.query(`UPDATE remember_me_tokens SET revoked_at = now() WHERE id = $1`, [id]);
  } catch (err) {
    throw new DatabaseError("revokeRememberMeToken", err);
  }
}

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
