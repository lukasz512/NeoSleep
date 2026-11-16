import type { PoolClient } from "pg";

/**
 * {tenant}.kpi_snapshot — one row per (day, scope, metric), written by the nightly
 * job (CORE-213, commands/kpiSnapshot.ts). The day is a UTC calendar day; the counts
 * are the ones the dashboards already show, frozen so a trend survives later edits
 * and deletes.
 *
 *   tenant     patients_created, encounters, pcfs_submitted, device_orders_sent, purchase_orders
 *   user       encounters, pcfs_submitted   (encounter.user_id)
 *   territory  encounters, pcfs_submitted   (encounter.territory_id)
 *
 * Tenant rows are written even at 0 (a quiet day is a fact); user and territory rows
 * only where something happened. A rerun for the same day replaces that day's rows.
 */

export const KPI_METRICS = ["patients_created", "encounters", "pcfs_submitted", "device_orders_sent", "purchase_orders"] as const;
export type KpiMetric = (typeof KPI_METRICS)[number];

export interface KpiSnapshotRow {
  period: string;
  period_type: string;
  scope_type: "tenant" | "user" | "territory";
  scope_id: string | null;
  metric: KpiMetric;
  value: number;
}

/** `day` is YYYY-MM-DD. Returns how many rows were written. */
export async function writeDailyKpiSnapshot(client: PoolClient, day: string): Promise<number> {
  await client.query(`DELETE FROM kpi_snapshot WHERE period = $1 AND period_type = 'day' AND metric = ANY($2)`, [day, KPI_METRICS]);
  const { rowCount } = await client.query(
    `WITH bounds AS (SELECT $1::date::timestamp AT TIME ZONE 'UTC' AS t0, ($1::date + 1)::timestamp AT TIME ZONE 'UTC' AS t1),
     enc AS (
       SELECT e.user_id, e.territory_id,
              (e.start_at >= b.t0 AND e.start_at < b.t1) AS started,
              (e.submitted_at >= b.t0 AND e.submitted_at < b.t1) AS submitted
         FROM encounter e, bounds b
        WHERE e.deleted_at IS NULL
          AND ((e.start_at >= b.t0 AND e.start_at < b.t1) OR (e.submitted_at >= b.t0 AND e.submitted_at < b.t1))
     ),
     counts (scope_type, scope_id, metric, value) AS (
       SELECT 'tenant', NULL::uuid, 'patients_created', count(*) FROM patient p, bounds b
        WHERE p.deleted_at IS NULL AND p.created_at >= b.t0 AND p.created_at < b.t1
       UNION ALL SELECT 'tenant', NULL, 'encounters', count(*) FILTER (WHERE started) FROM enc
       UNION ALL SELECT 'tenant', NULL, 'pcfs_submitted', count(*) FILTER (WHERE submitted) FROM enc
       UNION ALL SELECT 'tenant', NULL, 'device_orders_sent', count(*) FROM partner_link pl, bounds b
        WHERE pl.entity_type = 'treatment_plan' AND pl.created_at >= b.t0 AND pl.created_at < b.t1
       UNION ALL SELECT 'tenant', NULL, 'purchase_orders', count(*) FROM purchase_order po, bounds b
        WHERE po.created_at >= b.t0 AND po.created_at < b.t1
       UNION ALL SELECT 'user', user_id, 'encounters', count(*) FILTER (WHERE started) FROM enc WHERE user_id IS NOT NULL GROUP BY user_id
       UNION ALL SELECT 'user', user_id, 'pcfs_submitted', count(*) FILTER (WHERE submitted) FROM enc WHERE user_id IS NOT NULL GROUP BY user_id
       UNION ALL SELECT 'territory', territory_id, 'encounters', count(*) FILTER (WHERE started) FROM enc WHERE territory_id IS NOT NULL GROUP BY territory_id
       UNION ALL SELECT 'territory', territory_id, 'pcfs_submitted', count(*) FILTER (WHERE submitted) FROM enc WHERE territory_id IS NOT NULL GROUP BY territory_id
     )
     INSERT INTO kpi_snapshot (period, period_type, scope_type, scope_id, metric, value)
     SELECT $1, 'day', scope_type, scope_id, metric, value FROM counts
      WHERE scope_type = 'tenant' OR value > 0`,
    [day]
  );
  return rowCount ?? 0;
}

export async function listDailyKpiSnapshot(client: PoolClient, day: string): Promise<KpiSnapshotRow[]> {
  const { rows } = await client.query<KpiSnapshotRow & { value: string }>(
    `SELECT period, period_type, scope_type, scope_id, metric, value FROM kpi_snapshot
      WHERE period = $1 AND period_type = 'day' ORDER BY scope_type, metric, scope_id`,
    [day]
  );
  return rows.map((r) => ({ ...r, value: Number(r.value) }));
}
