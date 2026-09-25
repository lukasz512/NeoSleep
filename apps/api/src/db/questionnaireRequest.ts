import type { PoolClient } from "pg";
import { AppError, DatabaseError } from "../errors.js";

/**
 * questionnaire_request — a single-use, expiring link a doctor hands a
 * patient (as a QR code) to complete checklist steps without an account
 * (migrations 030 + 031, ADR-023/024). Only token_hash (utils/hashToken.ts)
 * is stored; the raw token exists solely in the QR / URL.
 *
 * `items` are the ordered checklist keys (template keys) the link covers —
 * one for a per-item QR, several for "everything the patient has to do".
 * `completed_items` grows as the patient finishes each step; `used_at` is
 * set once every item is done, and only then is the link dead.
 */

export type QuestionnaireRequestKind = "medical_history" | "stop_bang" | "bundle";
export type QuestionnaireRequestStatus = "pending" | "completed" | "cancelled" | "expired";

export interface QuestionnaireRequest {
  id: string;
  patient_id: string;
  kind: QuestionnaireRequestKind;
  items: string[];
  completed_items: string[];
  expires_at: Date;
  used_at: Date | null;
  cancelled_at: Date | null;
  created_by: string | null;
  created_at: Date;
  status: QuestionnaireRequestStatus;
}

const COLS = `id, patient_id, kind, items, completed_items, expires_at, used_at, cancelled_at, created_by, created_at,
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

/** Legacy single-kind label kept in `kind` for readability of old rows; everything reads `items`. */
function kindFor(items: string[]): QuestionnaireRequestKind {
  if (items.length === 1 && items[0] === "medicalHistory") return "medical_history";
  if (items.length === 1 && items[0] === "stopBang") return "stop_bang";
  return "bundle";
}

export function insertQuestionnaireRequest(
  client: PoolClient,
  input: { patient_id: string; items: string[]; token_hash: string; expires_at: Date; created_by: string }
): Promise<QuestionnaireRequest> {
  return run("insertQuestionnaireRequest", async () => {
    const result = await client.query<QuestionnaireRequest>(
      `INSERT INTO questionnaire_request (patient_id, kind, items, token_hash, expires_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${COLS}`,
      [input.patient_id, kindFor(input.items), input.items, input.token_hash, input.expires_at, input.created_by]
    );
    return result.rows[0]!;
  });
}

/**
 * One live link per checklist item: issuing a new link retires every
 * pending one that covers any of the same items ("show QR again" — the raw
 * token is never stored, so it can't be re-shown).
 */
export function cancelPendingQuestionnaireRequests(client: PoolClient, patientId: string, items: string[]): Promise<number> {
  return run("cancelPendingQuestionnaireRequests", async () => {
    const result = await client.query(
      `UPDATE questionnaire_request SET cancelled_at = now()
        WHERE patient_id = $1 AND items && $2::text[] AND used_at IS NULL AND cancelled_at IS NULL AND expires_at > now()`,
      [patientId, items]
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
 * `forUpdate` row-locks it for a submit transaction, so two concurrent
 * submits of the same step can't both succeed — the second waits, then
 * sees the step completed.
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

/** Marks one step done; sets used_at (the link dies) once every item is done. */
export function completeQuestionnaireStep(client: PoolClient, id: string, item: string): Promise<QuestionnaireRequest> {
  return run("completeQuestionnaireStep", async () => {
    const result = await client.query<QuestionnaireRequest>(
      `UPDATE questionnaire_request
          SET completed_items = CASE WHEN $2 = ANY(completed_items) THEN completed_items ELSE array_append(completed_items, $2) END,
              used_at = CASE WHEN items <@ array_append(completed_items, $2) THEN now() ELSE used_at END
        WHERE id = $1
        RETURNING ${COLS}`,
      [id, item]
    );
    return result.rows[0]!;
  });
}

/** Pending links only — completed ones already show up as their resulting records, expired/cancelled ones are noise. */
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
