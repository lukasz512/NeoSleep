import type { PoolClient } from "pg";
import { DatabaseError } from "../errors.js";
import type { LocalOrder, ReconciliationItem, ReconciliationSummary } from "../services/deviceOrders/reconcile.js";

/**
 * device_order_reconciliation_run (migration 042, NEO-218) plus the reads the
 * reconciliation needs: the orders this environment sent (partner_link +
 * the payload of its create call) and the admins to alert.
 */

export type ReconciliationTrigger = "manual" | "scheduled";
export type ReconciliationStatus = "ok" | "mismatch" | "failed";

export interface ReconciliationRun {
  id: string;
  provider: string;
  trigger: ReconciliationTrigger;
  triggered_by: string | null;
  status: ReconciliationStatus;
  summary: Partial<ReconciliationSummary>;
  items: ReconciliationItem[];
  error: string | null;
  started_at: string;
  finished_at: string;
}

export type ReconciliationRunSummary = Omit<ReconciliationRun, "items">;

export interface InsertReconciliationRunInput {
  provider: string;
  trigger: ReconciliationTrigger;
  triggeredBy: string | null;
  status: ReconciliationStatus;
  summary: Partial<ReconciliationSummary>;
  items: ReconciliationItem[];
  error: string | null;
  startedAt: Date;
}

/** Days a run is kept (story: device-order-reconciliation.md). */
export const RECONCILIATION_RETENTION_DAYS = 90;

const RUN_SUMMARY_COLS = "id, provider, trigger, triggered_by, status, summary, error, started_at, finished_at";

/**
 * Every device order this environment sent or is sending to `partner`: synced
 * and pending treatment_plan links. 'failed' links never reached the lab (a
 * timeout keeps a link 'pending', not 'failed'), so they are left out. The
 * payload is the latest create call's request, a successful one first.
 */
export async function listSentDeviceOrders(client: PoolClient, partner: string): Promise<LocalOrder[]> {
  try {
    const { rows } = await client.query<{
      entity_id: string;
      external_id: string | null;
      sync_status: "pending" | "synced";
      patient_id: string | null;
      request_payload: Record<string, unknown> | null;
    }>(
      `SELECT pl.entity_id, pl.external_id, pl.sync_status, tp.patient_id,
              (SELECT pt.request_payload FROM partner_transaction pt
                WHERE pt.partner_link_id = pl.id AND pt.action = 'create_treatment' AND pt.request_payload IS NOT NULL
                ORDER BY pt.success DESC, pt.created_at DESC LIMIT 1) AS request_payload
         FROM partner_link pl
         LEFT JOIN treatment_plan tp ON tp.id = pl.entity_id
        WHERE pl.partner = $1 AND pl.entity_type = 'treatment_plan' AND pl.sync_status IN ('pending', 'synced')
        ORDER BY pl.created_at`,
      [partner]
    );
    return rows.map((r) => ({
      treatmentPlanId: r.entity_id,
      patientId: r.patient_id,
      externalId: r.external_id,
      syncStatus: r.sync_status,
      sentPayload: r.request_payload,
    }));
  } catch (err) {
    throw new DatabaseError("listSentDeviceOrders", err);
  }
}

export async function insertReconciliationRun(client: PoolClient, input: InsertReconciliationRunInput): Promise<ReconciliationRun> {
  try {
    const { rows } = await client.query<ReconciliationRun>(
      `INSERT INTO device_order_reconciliation_run (provider, trigger, triggered_by, status, summary, items, error, started_at, finished_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, now())
       RETURNING ${RUN_SUMMARY_COLS}, items`,
      [
        input.provider,
        input.trigger,
        input.triggeredBy,
        input.status,
        JSON.stringify(input.summary),
        JSON.stringify(input.items),
        input.error,
        input.startedAt.toISOString(),
      ]
    );
    return rows[0]!;
  } catch (err) {
    throw new DatabaseError("insertReconciliationRun", err);
  }
}

export async function getLatestReconciliationRun(client: PoolClient, provider: string): Promise<ReconciliationRun | null> {
  try {
    const { rows } = await client.query<ReconciliationRun>(
      `SELECT ${RUN_SUMMARY_COLS}, items FROM device_order_reconciliation_run
        WHERE provider = $1 ORDER BY started_at DESC LIMIT 1`,
      [provider]
    );
    return rows[0] ?? null;
  } catch (err) {
    throw new DatabaseError("getLatestReconciliationRun", err);
  }
}

export async function listReconciliationRuns(client: PoolClient, provider: string, limit: number): Promise<ReconciliationRunSummary[]> {
  try {
    const { rows } = await client.query<ReconciliationRunSummary>(
      `SELECT ${RUN_SUMMARY_COLS} FROM device_order_reconciliation_run
        WHERE provider = $1 ORDER BY started_at DESC LIMIT $2`,
      [provider, limit]
    );
    return rows;
  } catch (err) {
    throw new DatabaseError("listReconciliationRuns", err);
  }
}

/** Deletes runs older than the retention window; returns how many went. */
export async function pruneReconciliationRuns(client: PoolClient, retentionDays = RECONCILIATION_RETENTION_DAYS): Promise<number> {
  try {
    const { rowCount } = await client.query(
      `DELETE FROM device_order_reconciliation_run WHERE started_at < now() - make_interval(days => $1)`,
      [retentionDays]
    );
    return rowCount ?? 0;
  } catch (err) {
    throw new DatabaseError("pruneReconciliationRuns", err);
  }
}

/** Active admins' emails — who the reconciliation alert goes to (Łukasz Q1). */
export async function listActiveAdminEmails(client: PoolClient): Promise<string[]> {
  try {
    const { rows } = await client.query<{ email: string }>(
      `SELECT DISTINCT i.email
         FROM users u
         JOIN identities i ON i.id = u.identity_id
         JOIN user_roles ur ON ur.user_id = u.id AND ur.role = 'admin'
        WHERE u.deleted_at IS NULL AND u.status = 'active' AND i.email IS NOT NULL
        ORDER BY i.email`
    );
    return rows.map((r) => r.email);
  } catch (err) {
    throw new DatabaseError("listActiveAdminEmails", err);
  }
}
