import {
  getPartnerLinksNeedingStatusSync,
  insertAuditLog,
  getActiveTenantSlugs,
  withTenant,
  insertPartnerSyncRun,
  finishPartnerSyncRun,
  type PartnerSyncTrigger,
} from "../db.js";
import { getTreatmentPlanById } from "../db/treatmentPlan.js";
import { getPractitionerById } from "../db/practitioner.js";
import { notify } from "../notifications/notify.js";
import { fetchOrthoApneaTreatmentStatus, ORTHOAPNEA_TERMINAL_STATUSES } from "../services/partners/orthoapnea.js";

/**
 * COMMANDS — OrthoApnea partner status-sync job.
 *
 * Called by the internal job route (requireInternalJobSecret-gated, no user
 * session) — so this takes a bare `tenantSlug`/`requestId`, not a full
 * TenantContext: there is no logged-in user here to populate ctx.user with,
 * and audit_log.user_id is nullable precisely for system-initiated writes
 * like this one.
 *
 * Notifies the dentist through notify() (ADR-027): the event catalog decides
 * copy and channels, and the delivery worker (NEO-136) sends the push. The
 * patient is not notified here: patients have no in-app inbox, and patient
 * messages go by email only, with consent (NEO-146/147).
 *
 * TRANSACTION SHAPE (see ADR-017): this used to run its entire loop —
 * including N sequential OrthoApnea HTTP round-trips — inside ONE withTenant()
 * transaction, holding a pooled Postgres connection open the whole time.
 * Now: one short transaction to fetch the worklist, then per link the
 * external call happens with NO transaction open (fetchOrthoApneaTreatmentStatus
 * manages its own short transaction internally for recording the outcome),
 * and only the local plan-lookup/notifications/audit-log write is wrapped in
 * its own short transaction. A slow OrthoApnea response for link #3 of 50 no
 * longer holds up a DB connection for the other 49.
 */

export interface SyncOrthoApneaTreatmentStatusesResult {
  checked: number;
  changed: number;
  failed: number;
}

const PARTNER_NAME = "orthoapnea";

/**
 * Records a partner_sync_run row (admin Dashboard card): inserted before any
 * lab call, finished with the counts, or with the error message when the run
 * throws (the error is then rethrown). Each of the two writes is its own
 * short transaction, never held across the lab calls.
 */
export async function SyncOrthoApneaTreatmentStatusesCommand(
  tenantSlug: string,
  requestId: string,
  trigger: PartnerSyncTrigger,
  userId?: string
): Promise<SyncOrthoApneaTreatmentStatusesResult> {
  const runId = await withTenant(tenantSlug, (client) =>
    insertPartnerSyncRun(client, PARTNER_NAME, trigger, userId ?? null)
  );
  try {
    const result = await runStatusSync(tenantSlug, requestId);
    await withTenant(tenantSlug, (client) => finishPartnerSyncRun(client, runId, result));
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      await withTenant(tenantSlug, (client) => finishPartnerSyncRun(client, runId, { error: message }));
    } catch (recordErr) {
      console.error("[orthoapnea-sync] could not record the failed run:", recordErr);
    }
    throw err;
  }
}

async function runStatusSync(tenantSlug: string, requestId: string): Promise<SyncOrthoApneaTreatmentStatusesResult> {
  const links = await withTenant(tenantSlug, (client) =>
    getPartnerLinksNeedingStatusSync(client, PARTNER_NAME, "treatment_plan", ORTHOAPNEA_TERMINAL_STATUSES)
  );

  let changed = 0;
  let failed = 0;

  for (const link of links) {
    let result: { externalStatus: string | null; changed: boolean };
    try {
      result = await fetchOrthoApneaTreatmentStatus(tenantSlug, link);
    } catch (err) {
      failed += 1;
      console.error(`[orthoapnea-sync] status poll failed for treatment_plan '${link.entity_id}':`, err);
      continue;
    }

    if (!result.changed) continue;
    changed += 1;

    await withTenant(tenantSlug, async (client) => {
      const plan = await getTreatmentPlanById(client, link.entity_id);
      if (!plan) return; // treatment_plan was deleted locally since the link was created — nothing to notify about

      const recipientIdentityIds: string[] = [];
      if (plan.dentist_id) {
        const dentist = await getPractitionerById(client, plan.dentist_id);
        if (dentist) recipientIdentityIds.push(dentist.identity_id);
      }

      await notify(client, {
        type: "partner_order_status_changed",
        recipients: recipientIdentityIds,
        entityId: plan.id,
        link: { patientId: plan.patient_id },
        meta: { partner: PARTNER_NAME, externalStatus: result.externalStatus },
      });

      await insertAuditLog(client, {
        action: "status_change",
        entity_type: "PartnerOrder",
        entity_id: plan.id,
        entity_after: { partner: PARTNER_NAME, externalStatus: result.externalStatus },
        request_id: requestId,
      });
    });
  }

  return { checked: links.length, changed, failed };
}

/** At most one in-app sync per tenant in this window, however many users have the app open (CORE-67). */
export const OPEN_APP_SYNC_INTERVAL_MS = 15 * 60_000;

const lastOpenAppSyncAt = new Map<string, number>();
const openAppSyncInFlight = new Map<string, Promise<SyncOrthoApneaTreatmentStatusesResult>>();

export type SyncOrthoApneaStatusesForOpenAppResult =
  | ({ ran: true } & SyncOrthoApneaTreatmentStatusesResult)
  | { ran: false };

/**
 * The sync the app triggers while someone has it open (every 15 min), on top
 * of the scheduled job's 4 runs a day (CORE-67). Throttled per tenant here,
 * not per user: ten open tabs still mean one round of lab calls per window,
 * and a call that arrives while one is running joins it. The throttle is
 * in-memory, which holds because the API runs one instance (max-instances=1);
 * a duplicate across dev and prod is harmless since the status write is
 * locked (updatePartnerLinkStatus), so the dentist is still notified once.
 */
export async function SyncOrthoApneaStatusesForOpenAppCommand(
  tenantSlug: string,
  requestId: string,
  now: number = Date.now()
): Promise<SyncOrthoApneaStatusesForOpenAppResult> {
  const running = openAppSyncInFlight.get(tenantSlug);
  if (running) return { ran: true, ...(await running) };

  const last = lastOpenAppSyncAt.get(tenantSlug);
  if (last !== undefined && now - last < OPEN_APP_SYNC_INTERVAL_MS) return { ran: false };

  lastOpenAppSyncAt.set(tenantSlug, now);
  const run = SyncOrthoApneaTreatmentStatusesCommand(tenantSlug, requestId, "app");
  openAppSyncInFlight.set(tenantSlug, run);
  try {
    return { ran: true, ...(await run) };
  } finally {
    openAppSyncInFlight.delete(tenantSlug);
  }
}

export function __resetOpenAppSyncThrottleForTests(): void {
  lastOpenAppSyncAt.clear();
  openAppSyncInFlight.clear();
}

export interface SyncOrthoApneaTreatmentStatusesAllTenantsResult {
  checked: number;
  changed: number;
  failed: number;
  tenantsFailed: number;
  tenants: Record<string, SyncOrthoApneaTreatmentStatusesResult | { error: string }>;
}

/**
 * Runs SyncOrthoApneaTreatmentStatusesCommand once per active tenant, called
 * by the machine-to-machine job route (see routes/partners/
 * orthoapnea-treatments.ts) instead of tenantSlugFromHost() — that helper is
 * a single-tenant stub (see its own doc comment in db/tenant.ts) and would
 * silently only ever sync one tenant (e.g. never 'fourseasons') if used here.
 * One tenant's failure is caught and recorded per-tenant, not allowed to
 * abort the rest — a partner outage or bad data for one tenant must not stop
 * every other tenant's sync from running.
 */
export async function SyncOrthoApneaTreatmentStatusesAllTenantsCommand(
  requestId: string
): Promise<SyncOrthoApneaTreatmentStatusesAllTenantsResult> {
  const slugs = await getActiveTenantSlugs();

  let checked = 0;
  let changed = 0;
  let failed = 0;
  let tenantsFailed = 0;
  const tenants: SyncOrthoApneaTreatmentStatusesAllTenantsResult["tenants"] = {};

  for (const slug of slugs) {
    try {
      const result = await SyncOrthoApneaTreatmentStatusesCommand(slug, requestId, "schedule");
      tenants[slug] = result;
      checked += result.checked;
      changed += result.changed;
      failed += result.failed;
    } catch (err) {
      tenantsFailed += 1;
      const message = err instanceof Error ? err.message : String(err);
      tenants[slug] = { error: message };
      console.error(`[orthoapnea-sync] tenant '${slug}' sync job failed entirely:`, err);
    }
  }

  return { checked, changed, failed, tenantsFailed, tenants };
}
