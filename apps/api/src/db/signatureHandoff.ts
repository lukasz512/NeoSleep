import type { PoolClient } from "pg";
import { DatabaseError } from "../errors.js";

/**
 * "Sign on your phone" (CORE-172) — see 056_signature_handoff.sql. One row
 * per QR shown next to a signature pad on a computer.
 */

export type SignatureHandoffPurpose = "partner_agreement" | "patient_consent" | "doctor_print";

/** What the phone shows above the pad. */
export interface SignatureHandoffLabel {
  signerName?: string | null;
  versionLabel?: string | null;
}

export interface SignatureHandoff {
  id: string;
  purpose: SignatureHandoffPurpose;
  owner_ref: string;
  label: SignatureHandoffLabel;
  expires_at: Date;
  signature: string | null;
  signed_at: Date | null;
  picked_up_at: Date | null;
  replaced_at: Date | null;
}

const COLS = "id, purpose, owner_ref, label, expires_at, signature, signed_at, picked_up_at, replaced_at";

async function run<T>(operation: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw new DatabaseError(operation, err);
  }
}

/** Retires the starter's earlier QRs (one live code per pad), then stores the new one. */
export function insertSignatureHandoff(
  client: PoolClient,
  row: {
    purpose: SignatureHandoffPurpose;
    ownerRef: string;
    label: SignatureHandoffLabel;
    signTokenHash: string;
    pickupTokenHash: string;
    expiresAt: Date;
  }
): Promise<void> {
  return run("insertSignatureHandoff", async () => {
    await client.query(
      `UPDATE signature_handoff SET replaced_at = now(), signature = NULL
        WHERE purpose = $1 AND owner_ref = $2 AND replaced_at IS NULL AND picked_up_at IS NULL`,
      [row.purpose, row.ownerRef]
    );
    await client.query(
      `INSERT INTO signature_handoff (purpose, owner_ref, label, sign_token_hash, pickup_token_hash, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [row.purpose, row.ownerRef, JSON.stringify(row.label), row.signTokenHash, row.pickupTokenHash, row.expiresAt]
    );
  });
}

export function getSignatureHandoffBySignHash(client: PoolClient, hash: string, { forUpdate }: { forUpdate: boolean }): Promise<SignatureHandoff | null> {
  return run("getSignatureHandoffBySignHash", async () => {
    const r = await client.query<SignatureHandoff>(
      `SELECT ${COLS} FROM signature_handoff WHERE sign_token_hash = $1 ${forUpdate ? "FOR UPDATE" : ""}`,
      [hash]
    );
    return r.rows[0] ?? null;
  });
}

export function getSignatureHandoffByPickupHash(client: PoolClient, hash: string): Promise<SignatureHandoff | null> {
  return run("getSignatureHandoffByPickupHash", async () => {
    const r = await client.query<SignatureHandoff>(`SELECT ${COLS} FROM signature_handoff WHERE pickup_token_hash = $1 FOR UPDATE`, [hash]);
    return r.rows[0] ?? null;
  });
}

export function markSignatureHandoffSigned(
  client: PoolClient,
  id: string,
  data: { signature: string; ip: string | null; userAgent: string | null }
): Promise<void> {
  return run("markSignatureHandoffSigned", async () => {
    await client.query(
      `UPDATE signature_handoff SET signature = $2, signed_at = now(), signed_ip = $3, signed_user_agent = $4 WHERE id = $1`,
      [id, data.signature, data.ip, data.userAgent]
    );
  });
}

/** The signature leaves the table with the pickup; the evidence (who, when, from where) stays. */
export function markSignatureHandoffPickedUp(client: PoolClient, id: string): Promise<void> {
  return run("markSignatureHandoffPickedUp", async () => {
    await client.query(`UPDATE signature_handoff SET picked_up_at = now(), signature = NULL WHERE id = $1`, [id]);
  });
}

/** Drops any signature still waiting for an owner that no longer needs it (e.g. the invite was accepted). */
export function clearSignatureHandoffsFor(client: PoolClient, purpose: SignatureHandoffPurpose, ownerRef: string): Promise<void> {
  return run("clearSignatureHandoffsFor", async () => {
    await client.query(
      `UPDATE signature_handoff SET signature = NULL, replaced_at = COALESCE(replaced_at, now())
        WHERE purpose = $1 AND owner_ref = $2 AND picked_up_at IS NULL`,
      [purpose, ownerRef]
    );
  });
}
