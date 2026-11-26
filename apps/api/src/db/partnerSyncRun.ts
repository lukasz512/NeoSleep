import type { PoolClient } from "pg";
import { DatabaseError } from "../errors.js";
import { formatDisplayName } from "../utils/personName.js";

/**
 * partner_sync_run — one row per partner status-sync run (migration 052).
 * Inserted when the run starts and finished in a second short statement, so no
 * transaction is ever held across the partner HTTP calls (ADR-017).
 */

export type PartnerSyncTrigger = "app" | "schedule" | "manual";

export interface PartnerSyncRun {
  id: string;
  partner: string;
  trigger: PartnerSyncTrigger;
  started_at: string;
  finished_at: string | null;
  checked: number | null;
  changed: number | null;
  failed: number | null;
  error: string | null;
  triggered_by: string | null;
}

const RUN_COLS = "id, partner, trigger, started_at, finished_at, checked, changed, failed, error, triggered_by";

export async function insertPartnerSyncRun(
  client: PoolClient,
  partner: string,
  trigger: PartnerSyncTrigger,
  triggeredBy: string | null
): Promise<string> {
  try {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO partner_sync_run (partner, trigger, triggered_by) VALUES ($1, $2, $3) RETURNING id`,
      [partner, trigger, triggeredBy]
    );
    return rows[0]!.id;
  } catch (err) {
    throw new DatabaseError("insertPartnerSyncRun", err);
  }
}

export async function finishPartnerSyncRun(
  client: PoolClient,
  id: string,
  outcome: { checked: number; changed: number; failed: number } | { error: string }
): Promise<void> {
  try {
    if ("error" in outcome) {
      await client.query(`UPDATE partner_sync_run SET finished_at = now(), error = $2 WHERE id = $1`, [id, outcome.error]);
      return;
    }
    await client.query(
      `UPDATE partner_sync_run SET finished_at = now(), checked = $2, changed = $3, failed = $4 WHERE id = $1`,
      [id, outcome.checked, outcome.changed, outcome.failed]
    );
  } catch (err) {
    throw new DatabaseError("finishPartnerSyncRun", err);
  }
}

/** Newest first. */
export async function listPartnerSyncRuns(client: PoolClient, partner: string, limit: number): Promise<PartnerSyncRun[]> {
  try {
    const { rows } = await client.query<PartnerSyncRun>(
      `SELECT ${RUN_COLS} FROM partner_sync_run WHERE partner = $1 ORDER BY started_at DESC LIMIT $2`,
      [partner, limit]
    );
    return rows;
  } catch (err) {
    throw new DatabaseError("listPartnerSyncRuns", err);
  }
}

export interface PartnerOpenOrder {
  treatmentPlanId: string;
  patientId: string;
  patientName: string;
  externalId: string | null;
  externalStatus: string | null;
  lastSyncedAt: string | null;
  syncStatus: "pending" | "synced" | "failed";
}

/**
 * The partner orders the sync still watches: sent to the partner, not yet in
 * a terminal status (same filter as getPartnerLinksNeedingStatusSync), plus
 * the count of every link for the partner so a card can tell "nothing open"
 * from "nothing was ever sent".
 */
export async function getPartnerOpenOrders(
  client: PoolClient,
  partner: string,
  terminalStatuses: string[]
): Promise<{ openOrders: PartnerOpenOrder[]; totalLinks: number }> {
  try {
    const { rows } = await client.query<{
      treatment_plan_id: string;
      patient_id: string;
      salutation: string | null;
      first_name: string;
      last_name: string;
      external_id: string | null;
      external_status: string | null;
      last_synced_at: string | null;
      sync_status: "pending" | "synced" | "failed";
    }>(
      `SELECT pl.entity_id AS treatment_plan_id, tp.patient_id, i.title AS salutation, i.first_name, i.last_name,
              pl.external_id, pl.external_status, pl.last_synced_at, pl.sync_status
         FROM partner_link pl
         JOIN treatment_plan tp ON tp.id = pl.entity_id
         JOIN patient p ON p.id = tp.patient_id
         JOIN identities i ON i.id = p.identity_id
        WHERE pl.partner = $1 AND pl.entity_type = 'treatment_plan' AND pl.sync_status = 'synced'
          AND pl.external_id IS NOT NULL
          AND (pl.external_status IS NULL OR NOT (pl.external_status = ANY($2)))
        ORDER BY pl.last_synced_at ASC NULLS FIRST, pl.created_at ASC`,
      [partner, terminalStatuses]
    );
    const total = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM partner_link WHERE partner = $1 AND entity_type = 'treatment_plan'`,
      [partner]
    );
    return {
      openOrders: rows.map((r) => ({
        treatmentPlanId: r.treatment_plan_id,
        patientId: r.patient_id,
        patientName: formatDisplayName({ salutation: r.salutation, first_name: r.first_name, last_name: r.last_name }),
        externalId: r.external_id,
        externalStatus: r.external_status,
        lastSyncedAt: r.last_synced_at,
        syncStatus: r.sync_status,
      })),
      totalLinks: Number(total.rows[0]!.n),
    };
  } catch (err) {
    throw new DatabaseError("getPartnerOpenOrders", err);
  }
}
