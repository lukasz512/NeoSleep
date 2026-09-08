import { getPartnerLinksNeedingStatusSync, insertAuditLog, getActiveTenantSlugs, withTenant } from "../db.js";
import { getTreatmentPlanById } from "../db/treatmentPlan.js";
import { getPatientById } from "../db/patient.js";
import { getPractitionerById } from "../db/practitioner.js";
import { insertNotification } from "../db/notification.js";
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
 * Scope deliberately stops at insertNotification(): it writes the in-app
 * inbox row for both the dentist and the patient. Wiring that row up to
 * actual delivery (email/push dispatch, a general notification "hub") is
 * explicitly out of scope here — separate follow-up work, per product
 * decision — this command's job is just to produce a correct notification
 * row and audit trail, not to build the dispatcher.
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

export async function SyncOrthoApneaTreatmentStatusesCommand(
  tenantSlug: string,
  requestId: string
): Promise<SyncOrthoApneaTreatmentStatusesResult> {
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
      const patient = await getPatientById(client, plan.patient_id);
      if (patient) recipientIdentityIds.push(patient.identity_id);
      if (plan.dentist_id) {
        const dentist = await getPractitionerById(client, plan.dentist_id);
        if (dentist) recipientIdentityIds.push(dentist.identity_id);
      }

      for (const identityId of recipientIdentityIds) {
        await insertNotification(client, {
          identity_id: identityId,
          type: "partner_order_status_changed",
          title: "OrthoApnea order status updated",
          body: null,
          entity_type: "TreatmentPlan",
          entity_id: plan.id,
          metadata: { partner: PARTNER_NAME, externalStatus: result.externalStatus },
        });
      }

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
      const result = await SyncOrthoApneaTreatmentStatusesCommand(slug, requestId);
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
