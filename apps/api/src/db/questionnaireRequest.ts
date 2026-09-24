import type { PoolClient } from "pg";
import { AppError, DatabaseError } from "../errors.js";
import type { PatientFillableKind } from "../commands/clinicalRecordFields.js";

/**
 * questionnaire_request — a single-use, expiring link a doctor hands a
 * patient (as a QR code) to self-fill a questionnaire without an account
 * (migration 030, ADR-023). Only token_hash (utils/hashToken.ts) is stored;
 * the raw token exists solely in the QR / URL, same convention as
 * db/invite.ts's invite tokens.
 */

export type QuestionnaireRequestStatus = "pending" | "completed" | "cancelled" | "expired";

export interface QuestionnaireRequest {
  id: string;
  patient_id: string;
  kind: PatientFillableKind;
  expires_at: Date;
  used_at: Date | null;
  cancelled_at: Date | null;
  created_by: string | null;
  created_at: Date;
  status: QuestionnaireRequestStatus;
}

const COLS = `id, patient_id, kind, expires_at, used_at, cancelled_at, created_by, created_at,
  CASE WHEN used_at IS NOT NULL THEN 'completed'
       WHEN cancelled_at IS NOT NULL THEN 'cancelled'
       WHEN expires_at <= now() THEN 'expired'
       ELSE 'pending' END AS status`;

async function run<T>(operation: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError(operation, err);
  }
}

export function insertQuestionnaireRequest(
  client: PoolClient,
  input: { patient_id: string; kind: PatientFillableKind; token_hash: string; expires_at: Date; created_by: string }
): Promise<QuestionnaireRequest> {
  return run("insertQuestionnaireRequest", async () => {
    const result = await client.query<QuestionnaireRequest>(
      `INSERT INTO questionnaire_request (patient_id, kind, token_hash, expires_at, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING ${COLS}`,
      [input.patient_id, input.kind, input.token_hash, input.expires_at, input.created_by]
    );
    return result.rows[0]!;
  });
}

/** One live link per patient+kind: issuing a new one (e.g. "show QR again" — the raw token is never stored, so it can't be re-shown) retires the old. */
export function cancelPendingQuestionnaireRequests(client: PoolClient, patientId: string, kind: PatientFillableKind): Promise<number> {
  return run("cancelPendingQuestionnaireRequests", async () => {
    const result = await client.query(
      `UPDATE questionnaire_request SET cancelled_at = now()
        WHERE patient_id = $1 AND kind = $2 AND used_at IS NULL AND cancelled_at IS NULL AND expires_at > now()`,
      [patientId, kind]
    );
    return result.rowCount ?? 0;
  });
}

export function cancelQuestionnaireRequest(client: PoolClient, id: string, patientId: string): Promise<QuestionnaireRequest | null> {
  return run("cancelQuestionnaireRequest", async () => {
    const result = await client.query<QuestionnaireRequest>(
      `UPDATE questionnaire_request SET cancelled_at = now()
        WHERE id = $1 AND patient_id = $2 AND used_at IS NULL AND cancelled_at IS NULL
        RETURNING ${COLS}`,
      [id, patientId]
    );
    return result.rows[0] ?? null;
  });
}

/**
 * Looks up a usable (unused, uncancelled, unexpired) request by token hash.
 * `forUpdate` row-locks it for the submit transaction, so two concurrent
 * submits of the same link can't both succeed — the second waits, then
 * sees used_at set and gets null.
 */
export function getUsableQuestionnaireRequestByHash(
  client: PoolClient,
  tokenHash: string,
  { forUpdate }: { forUpdate: boolean }
): Promise<QuestionnaireRequest | null> {
  return run("getUsableQuestionnaireRequestByHash", async () => {
    // A soft-deleted patient's pending link is dead too — for reading AND submitting.
    const result = await client.query<QuestionnaireRequest>(
      `SELECT ${COLS} FROM questionnaire_request
        WHERE token_hash = $1 AND used_at IS NULL AND cancelled_at IS NULL AND expires_at > now()
          AND EXISTS (SELECT 1 FROM patient p WHERE p.id = questionnaire_request.patient_id AND p.deleted_at IS NULL)
        ${forUpdate ? "FOR UPDATE" : ""}`,
      [tokenHash]
    );
    return result.rows[0] ?? null;
  });
}

export function markQuestionnaireRequestUsed(client: PoolClient, id: string): Promise<void> {
  return run("markQuestionnaireRequestUsed", async () => {
    await client.query(`UPDATE questionnaire_request SET used_at = now() WHERE id = $1`, [id]);
  });
}

/** Pending links only — completed ones already show up as their resulting record, expired/cancelled ones are noise in the Estudios list. */
export function listPendingQuestionnaireRequestsForPatient(client: PoolClient, patientId: string): Promise<QuestionnaireRequest[]> {
  return run("listPendingQuestionnaireRequestsForPatient", async () => {
    const result = await client.query<QuestionnaireRequest>(
      `SELECT ${COLS} FROM questionnaire_request
        WHERE patient_id = $1 AND used_at IS NULL AND cancelled_at IS NULL AND expires_at > now()
        ORDER BY created_at DESC`,
      [patientId]
    );
    return result.rows;
  });
}
