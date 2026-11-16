import { withTenant, getActiveTenantSlugs, tenantSlugFromHost } from "../db/tenant.js";
import { writeDailyKpiSnapshot } from "../db/kpiSnapshot.js";
import { ValidationError } from "../errors.js";

/**
 * CORE-213: the nightly KPI snapshot. Called by .github/workflows/kpi-snapshot.yml
 * shortly after midnight UTC for the day that just ended; a manual call may name any
 * past day to backfill or recompute it (same day twice = same rows).
 */

export interface KpiSnapshotResult {
  day: string;
  tenants: Record<string, { rows: number } | { error: string }>;
  tenantsFailed: number;
}

/** Yesterday as a UTC calendar day, YYYY-MM-DD. */
export function previousUtcDay(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1)).toISOString().slice(0, 10);
}

export function parseKpiDay(raw: unknown, now: Date = new Date()): string {
  if (raw === undefined || raw === null || raw === "") return previousUtcDay(now);
  const ok = typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw) && new Date(`${raw}T00:00:00Z`).toISOString().startsWith(raw);
  if (!ok) throw new ValidationError("day must be a date as YYYY-MM-DD", "day");
  if (raw >= now.toISOString().slice(0, 10)) throw new ValidationError("day must be before today (UTC)", "day");
  return raw;
}

export async function RunKpiSnapshotAllTenants(day: string): Promise<KpiSnapshotResult> {
  const tenants: KpiSnapshotResult["tenants"] = {};
  let tenantsFailed = 0;
  for (const slug of new Set([tenantSlugFromHost(""), ...(await getActiveTenantSlugs())])) {
    try {
      tenants[slug] = { rows: await withTenant(slug, (client) => writeDailyKpiSnapshot(client, day)) };
    } catch (err) {
      tenantsFailed += 1;
      tenants[slug] = { error: err instanceof Error ? err.message : String(err) };
      console.error(`[kpi-snapshot] tenant '${slug}' failed:`, err);
    }
  }
  return { day, tenants, tenantsFailed };
}
