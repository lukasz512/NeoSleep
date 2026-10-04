import { withTenant, insertAuditLog, getActiveTenantSlugs, tenantSlugFromHost } from "../db.js";
import {
  insertReconciliationRun,
  listActiveAdminEmails,
  listSentDeviceOrders,
  pruneReconciliationRuns,
  type ReconciliationRun,
  type ReconciliationTrigger,
} from "../db/deviceOrderReconciliation.js";
import { DEPLOY_ENV, FRONTEND_URLS } from "../env.js";
import { sendDeviceOrderReconciliationAlert, type ReconciliationAlert } from "../mailer.js";
import { getDeviceOrderProvider, type DeviceOrderProvider } from "../services/deviceOrders/index.js";
import {
  MISMATCH_REASONS,
  reconcileOrders,
  type ReconciliationItem,
  type ReconciliationResult,
} from "../services/deviceOrders/reconcile.js";

/**
 * COMMANDS — device-order reconciliation (NEO-218): compare the orders this
 * environment sent with the orders the lab lists, store the run, and alert
 * the admins when something needs a look.
 *
 * Run by an admin ("Check now", trigger 'manual') or by the daily job
 * (trigger 'scheduled'). Only a scheduled run emails: a manual run is shown
 * to the admin who started it, right away (default decided 2026-10-03, see
 * docs/stories/device-order-reconciliation.md).
 *
 * TRANSACTION SHAPE (ADR-017): a short transaction reads our orders, the lab
 * is read with no transaction open, and a second short transaction stores the
 * run, prunes old runs and writes the audit entry. A lab that can't be read
 * makes a 'failed' run, never a run full of "missing" orders.
 */

export interface RunReconciliationOptions {
  trigger: ReconciliationTrigger;
  userId: string | null;
  requestId: string;
  /** Overridable in tests; production uses the configured provider and the mailer. */
  provider?: DeviceOrderProvider;
  sendAlert?: (to: string, alert: ReconciliationAlert) => Promise<void>;
}

function alertLine(item: ReconciliationItem): string {
  const order = item.externalId ? `lab order ${item.externalId}` : "no lab order number yet";
  const fields = item.drift.length > 0 ? ` (${item.drift.map((d) => d.field).join(", ")})` : "";
  return `${item.reason.replace(/_/g, " ")} — ${order}${fields}`;
}

function panelUrl(): string {
  const origin = FRONTEND_URLS[0] ?? "";
  return `${origin.replace(/\/$/, "")}/dashboard`;
}

async function alertAdmins(tenantSlug: string, run: ReconciliationRun, send: NonNullable<RunReconciliationOptions["sendAlert"]>): Promise<void> {
  if (run.status === "ok") return;
  const emails = await withTenant(tenantSlug, (client) => listActiveAdminEmails(client));
  const s = run.summary;
  const alert: ReconciliationAlert = {
    status: run.status,
    environment: DEPLOY_ENV,
    matched: s.matched ?? 0,
    mismatches: s.mismatches ?? 0,
    oursSent: s.oursSent ?? 0,
    labTotal: s.labTotal ?? 0,
    lines: run.items.filter((i) => MISMATCH_REASONS.includes(i.reason)).map(alertLine),
    error: run.error,
    panelUrl: panelUrl(),
  };
  for (const to of emails) {
    try {
      await send(to, alert);
    } catch (err) {
      // One bounced admin address must not hide the alert from the others; the run itself is already stored.
      console.error(`[device-order-reconciliation] alert to an admin failed:`, err);
    }
  }
}

export async function RunDeviceOrderReconciliationCommand(tenantSlug: string, opts: RunReconciliationOptions): Promise<ReconciliationRun> {
  const provider = opts.provider ?? getDeviceOrderProvider();
  const startedAt = new Date();
  const ours = await withTenant(tenantSlug, (client) => listSentDeviceOrders(client, provider.name));

  let result: ReconciliationResult | null = null;
  let error: string | null = null;
  try {
    const remote = await provider.listRemoteOrders();
    result = reconcileOrders(ours, remote, { env: DEPLOY_ENV, comparedPaths: provider.comparedPaths, datePaths: provider.comparedDatePaths });
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const run = await withTenant(tenantSlug, async (client) => {
    const stored = await insertReconciliationRun(client, {
      provider: provider.name,
      trigger: opts.trigger,
      triggeredBy: opts.userId,
      status: result ? result.status : "failed",
      summary: result ? result.summary : { oursSent: ours.length },
      items: result ? result.items : [],
      error,
      startedAt,
    });
    await pruneReconciliationRuns(client);
    await insertAuditLog(client, {
      user_id: opts.userId,
      action: "create",
      entity_type: "DeviceOrderReconciliation",
      entity_id: stored.id,
      entity_after: { provider: provider.name, trigger: opts.trigger, status: stored.status, summary: stored.summary, error },
      request_id: opts.requestId,
      metadata: { environment: DEPLOY_ENV },
    });
    return stored;
  });

  if (opts.trigger === "scheduled") {
    await alertAdmins(tenantSlug, run, opts.sendAlert ?? sendDeviceOrderReconciliationAlert);
  }
  return run;
}

export interface ReconcileAllTenantsResult {
  tenants: Record<string, { status: ReconciliationRun["status"]; runId: string } | { error: string }>;
  tenantsFailed: number;
}

/**
 * The daily job: one run per active tenant that uses device orders — the
 * default tenant, plus any tenant with a device-order link. The lab account
 * is shared, so a tenant that never ordered would only list everyone else's
 * orders as "lab only". One tenant's failure doesn't stop the others.
 */
export async function RunDeviceOrderReconciliationAllTenantsCommand(
  requestId: string,
  opts: Pick<RunReconciliationOptions, "provider" | "sendAlert"> = {}
): Promise<ReconcileAllTenantsResult> {
  const provider = opts.provider ?? getDeviceOrderProvider();
  const defaultSlug = tenantSlugFromHost("");
  const tenants: ReconcileAllTenantsResult["tenants"] = {};
  let tenantsFailed = 0;

  const slugs = new Set([defaultSlug, ...(await getActiveTenantSlugs())]);
  for (const slug of slugs) {
    try {
      if (slug !== defaultSlug) {
        const hasOrders = await withTenant(slug, async (client) => (await listSentDeviceOrders(client, provider.name)).length > 0);
        if (!hasOrders) continue;
      }
      const run = await RunDeviceOrderReconciliationCommand(slug, { ...opts, provider, trigger: "scheduled", userId: null, requestId });
      tenants[slug] = { status: run.status, runId: run.id };
    } catch (err) {
      tenantsFailed += 1;
      tenants[slug] = { error: err instanceof Error ? err.message : String(err) };
      console.error(`[device-order-reconciliation] tenant '${slug}' failed:`, err);
    }
  }
  return { tenants, tenantsFailed };
}
