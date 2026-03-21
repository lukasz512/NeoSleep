import { getDb } from "./connection.js";
import { DatabaseError } from "../errors.js";

export async function createPasswordResetToken(
  userId: string,
  tokenHash: string,
  expiresAt: Date
): Promise<void> {
  try {
    await getDb().query(
      `INSERT INTO tbl_password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [userId, tokenHash, expiresAt]
    );
  } catch (err) {
    throw new DatabaseError("createPasswordResetToken", err);
  }
}

export async function getPasswordResetUserIdByHash(tokenHash: string): Promise<string | null> {
  try {
    const r = await getDb().query<{ user_id: string }>(
      `SELECT user_id FROM tbl_password_reset_tokens WHERE token_hash = $1 AND expires_at > now()`,
      [tokenHash]
    );
    return r.rows[0]?.user_id ?? null;
  } catch (err) {
    throw new DatabaseError("getPasswordResetUserIdByHash", err);
  }
}

export async function deletePasswordResetTokenByHash(tokenHash: string): Promise<void> {
  try {
    await getDb().query("DELETE FROM tbl_password_reset_tokens WHERE token_hash = $1", [tokenHash]);
  } catch (err) {
    throw new DatabaseError("deletePasswordResetTokenByHash", err);
  }
}
