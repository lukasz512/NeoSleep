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

