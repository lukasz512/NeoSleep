/**
 * Read-only reconciliation against the live lab, for hand-run checks (NEO-218).
 * Lists the lab's orders (GET only) and compares them with this database's
 * device-order links — it never places, changes or comments on an order, and
 * it stores nothing (no run row, no email). Prints reasons and lab order
 * numbers only; never patient names.
 *
 *   pnpm --filter @neo/api exec tsx --env-file=../../.env scripts/oa-reconcile-dry.ts [tenant]
 */
import { withTenant } from "../src/db.js";
import { listSentDeviceOrders } from "../src/db/deviceOrderReconciliation.js";
import { DEPLOY_ENV } from "../src/env.js";
import { getDeviceOrderProvider } from "../src/services/deviceOrders/index.js";
import { reconcileOrders } from "../src/services/deviceOrders/reconcile.js";

const tenant = process.argv[2] ?? process.env.DEFAULT_TENANT_SLUG ?? "neosleep";
const provider = getDeviceOrderProvider();
const ours = await withTenant(tenant, (client) => listSentDeviceOrders(client, provider.name));
const remote = await provider.listRemoteOrders();
const result = reconcileOrders(ours, remote, { env: DEPLOY_ENV, comparedPaths: provider.comparedPaths, datePaths: provider.comparedDatePaths });

console.log(JSON.stringify({ environment: DEPLOY_ENV, tenant, status: result.status, summary: result.summary }, null, 2));
for (const item of result.items) {
  console.log(`${item.externalId ?? "(no id)"}\t${item.reason}\tlab status ${item.labStatus ?? "-"}\t${item.requestDate?.slice(0, 10) ?? ""}${item.drift.length ? `\t${item.drift.map((d) => d.field).join(",")}` : ""}`);
}
process.exit(0);
