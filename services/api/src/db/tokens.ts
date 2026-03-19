import { getDb } from "./connection.js";

export async function createPasswordResetToken(
  userId: string,
  tokenHash: string,
  expiresAt: Date
): Promise<boolean> {
  const p = getDb();
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
  const p = getDb();
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
  const p = getDb();
  if (!p) return;
  try {
    await p.query("DELETE FROM tbl_password_reset_tokens WHERE token_hash = $1", [tokenHash]);
  } catch (err) {
    console.error("deletePasswordResetTokenByHash error:", err);
  }
}
