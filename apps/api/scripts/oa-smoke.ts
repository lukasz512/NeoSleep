/**
 * Live OrthoApnea smoke check — run by hand, never in CI:
 *
 *   pnpm --filter @neo/api oa:smoke
 *
 * Goes through the real service code (services/partners/orthoapnea.ts) with
 * the ORTHOAPNEA_* values from the root .env: exactly one login plus one
 * resources read against apneadock.es, so it is safe to run whenever the PWA
 * says it can't connect. To check the credentials Render uses, put Render's
 * values in the environment for one run instead of the .env ones.
 */
import { checkConnection, fetchResources } from "../src/services/partners/orthoapnea.js";

const status = await checkConnection();
if (!status.connected) {
  console.error(`OrthoApnea: NOT connected (reason: ${status.reason ?? "unknown"})`);
  process.exit(1);
}
const resources = await fetchResources("es");
console.log(`OrthoApnea: connected, ${resources.length} resources readable`);
