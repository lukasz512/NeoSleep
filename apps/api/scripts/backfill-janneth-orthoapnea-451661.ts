/**
 * One-off backfill: patient Janneth Candelaria Urdaneta Aguirre's OrthoApnea
 * NOA + MA order was placed directly on the ApneaDock portal
 * (https://www.apneadock.com/recap-treatment/42095/451661), not through this
 * app's own order wizard — the in-app draft for the same treatment
 * (treatment_plan aa345135-27b2-4795-b992-1293990bb44b) had been created and
 * then soft-deleted before the order actually went through on ApneaDock.
 *
 * This restores that plan (rather than creating a duplicate), fills it with
 * the order details from the partner's recap PDF, and creates the
 * partner_link row that CLAUDE.md's OrthoApnea integration needs so the
 * existing status-sync job (commands/orthoapneaSync.ts) can pick up this
 * order's real status going forward.
 *
 *   pnpm --filter @neo/api exec tsx scripts/backfill-janneth-orthoapnea-451661.ts
 *
 * Single-use — safe to leave in place afterward as the record of what this
 * script did and why (see also treatment_plan.metadata.orthoapneaOrder on the
 * plan itself, and the "restore" + "update" audit_log rows it writes).
 */
import { withTenant } from "../src/db.js";
import { RestoreTreatmentPlanCommand, UpdateTreatmentPlanCommand } from "../src/commands/treatmentPlan.js";
import { ensurePendingPartnerLink, markPartnerLinkSynced, insertPartnerTransaction } from "../src/db/partnerLink.js";
import type { TenantContext } from "../src/context/TenantContext.js";

const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "neosleep";
const PLAN_ID = "aa345135-27b2-4795-b992-1293990bb44b";
const LUKASZ_USER_ID = "b17e42f5-c0e7-4ec1-ad3d-f26185cc4f0c";
const RECAP_URL = "https://www.apneadock.com/recap-treatment/42095/451661";

async function run() {
  await withTenant(TENANT_SLUG, async (client) => {
    const ctx: TenantContext = {
      slug: TENANT_SLUG,
      client,
      user: {
        id: LUKASZ_USER_ID,
        email: "lukasz.ostrowski@neosleepcare.com",
        role: "admin",
        roles: [{ role: "admin", scope: "global" }],
      },
      requestId: "manual-backfill-janneth-orthoapnea-451661",
    };

    const restored = await RestoreTreatmentPlanCommand(ctx, PLAN_ID);
    if (!restored) throw new Error(`Restore returned null — plan ${PLAN_ID} not found`);
    console.log(`[backfill] restored treatment_plan ${restored.id} (was status "${restored.status}")`);

    const existingMetadata = (restored.metadata ?? {}) as Record<string, unknown>;

    const updated = await UpdateTreatmentPlanCommand(ctx, PLAN_ID, {
      status: "in_progress",
      notes:
        "OrthoApnea NOA + MA mandibular advancement device ordered directly via the ApneaDock portal (order #451661). " +
        "Backfilled into NeoSleep from the partner recap PDF — the in-app order draft for this same plan had been " +
        "deleted 2026-09-08 before the order was placed on ApneaDock directly.",
      metadata: {
        ...existingMetadata,
        orthoapneaOrder: {
          source: "manual backfill from ApneaDock recap PDF + portal URL",
          recapUrl: RECAP_URL,
          treatmentId: "42095",
          orderId: "451661",
          product: "NOA + MA",
          paymentMethod: "Tarjeta",
          requestedDeliveryDate: "2026-09-03",
          expectedDeliveryDate: "2026-09-07",
          customization: {
            verticalDimension: "Mínima",
            maxRetrusionMm: -5.0,
            maxProtrusionMm: 5.0,
            startingPointMm: 0.0,
            finish: "Mixto",
            sequenceTypePercent: [60.0, 70.0, 80.0],
          },
          shipping: {
            name: "LORENA ALEJANDRA GONZALEZ PIMENTEL",
            address: "AV. CUAHUTEMOC",
            postalCode: "03020",
            city: "CIUDAD DE MEXICO",
            phone: "+525549100921",
          },
          importedAt: new Date().toISOString(),
        },
      },
    });
    if (!updated) throw new Error("Update returned null");
    console.log(`[backfill] updated treatment_plan ${updated.id} -> status "${updated.status}"`);

    const link = await ensurePendingPartnerLink(client, "orthoapnea", "TreatmentPlan", PLAN_ID);
    const synced = await markPartnerLinkSynced(client, link.id, "451661", null);
    console.log(`[backfill] partner_link ${synced.id} external_id=${synced.external_id} sync_status=${synced.sync_status}`);

    await insertPartnerTransaction(client, {
      partner_link_id: synced.id,
      action: "manual_backfill",
      request_payload: null,
      response_payload: { source: "ApneaDock recap PDF + portal URL", recapUrl: RECAP_URL },
      http_status: null,
      success: true,
      validation_report: null,
      error_message: null,
    });
    console.log("[backfill] partner_transaction recorded — done.");
  });
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
