import { withTenant, getActiveTenantSlugs, tenantSlugFromHost } from "../db.js";
import { dispatchDueDeliveries, type AdapterRegistry, type DispatchResult } from "../notifications/dispatcher.js";
import { escalateUnreadNotifications } from "../notifications/escalation.js";
import { purgeNotifications, type PurgeResult } from "../notifications/purge.js";

/**
 * CORE-3: the notification clock. Run daily for now (every 5 min once CORE-5/6 add adapters) by
 * .github/workflows/notification-tick.yml through POST
 * /api/v1/internal/jobs/notifications/tick. One tick per tenant does, in order:
 *   1. escalate: important notifications unread for escalateAfterMin get an email delivery;
 *   2. dispatch: due pending deliveries go to their channel adapter;
 *   3. purge: retention windows.
 * Safe to overlap and to repeat: each step is row-locked or idempotent.
 */

export interface NotificationTickTenantResult {
  escalated: number;
  dispatch: DispatchResult;
  purged: PurgeResult;
}

export interface NotificationTickResult {
  tenants: Record<string, NotificationTickTenantResult | { error: string }>;
  tenantsFailed: number;
}

export async function RunNotificationTickForTenant(
  slug: string,
  opts: { now?: Date; registry?: AdapterRegistry } = {}
): Promise<NotificationTickTenantResult> {
  const now = opts.now ?? new Date();
  return withTenant(slug, async (client) => {
    const escalated = await escalateUnreadNotifications(client, now);
    const dispatch = await dispatchDueDeliveries(client, { now, registry: opts.registry });
    const purged = await purgeNotifications(client, now);
    return { escalated, dispatch, purged };
  });
}

/** Every active tenant; one tenant's failure doesn't stop the others. */
export async function RunNotificationTickAllTenants(now: Date = new Date()): Promise<NotificationTickResult> {
  const tenants: NotificationTickResult["tenants"] = {};
  let tenantsFailed = 0;
  for (const slug of new Set([tenantSlugFromHost(""), ...(await getActiveTenantSlugs())])) {
    try {
      tenants[slug] = await RunNotificationTickForTenant(slug, { now });
    } catch (err) {
      tenantsFailed += 1;
      tenants[slug] = { error: err instanceof Error ? err.message : String(err) };
      console.error(`[notification-tick] tenant '${slug}' failed:`, err);
    }
  }
  return { tenants, tenantsFailed };
}
