import type { PoolClient } from "pg";
import { DatabaseError } from "../errors.js";

/**
 * Partner/doctor registration invites — see 009_partner_invite_and_documents.sql.
 * Same shape as password_reset_tokens (hashed token, expiry, single-use), but
 * models a first-time-registration invite: longer TTL, and an optional link
 * back to the originating Lead so acceptance can convert it.
 */

export interface InviteToken {
  id: string;
  user_id: string;
  lead_id: string | null;
}

export interface InviteTokenWithIdentity extends InviteToken {
  email: string;
  first_name: string | null;
  last_name: string | null;
}

export async function createInviteToken(
  client: PoolClient,
  userId: string,
  leadId: string | null,
  tokenHash: string,
  expiresAt: Date,
  createdBy: string
): Promise<string> {
  try {
    const r = await client.query<{ id: string }>(
      `INSERT INTO invite_tokens (user_id, lead_id, token_hash, expires_at, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [userId, leadId, tokenHash, expiresAt, createdBy]
    );
    return r.rows[0]!.id;
  } catch (err) {
    throw new DatabaseError("createInviteToken", err);
  }
}

/** Unused + unexpired only. Joins identities so the registration page can prefill name/email. */
export async function getInviteTokenByHash(
  client: PoolClient,
  tokenHash: string
): Promise<InviteTokenWithIdentity | null> {
  try {
    const r = await client.query<InviteTokenWithIdentity>(
      `SELECT it.id, it.user_id, it.lead_id, i.email, i.first_name, i.last_name
       FROM invite_tokens it
       JOIN users u ON u.id = it.user_id
       JOIN identities i ON i.id = u.identity_id
       WHERE it.token_hash = $1 AND it.used_at IS NULL AND it.expires_at > now()`,
      [tokenHash]
    );
    return r.rows[0] ?? null;
  } catch (err) {
    throw new DatabaseError("getInviteTokenByHash", err);
  }
}

export async function markInviteTokenUsed(client: PoolClient, id: string): Promise<void> {
  try {
    await client.query(`UPDATE invite_tokens SET used_at = now() WHERE id = $1`, [id]);
  } catch (err) {
    throw new DatabaseError("markInviteTokenUsed", err);
  }
}
