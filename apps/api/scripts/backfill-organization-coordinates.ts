/**
 * One-off backfill: geocodes every existing active organization missing
 * coordinates, for the public "find a specialist" map
 * (apps/web/src/views/FindSpecialistView.vue). Run once after migration 012
 * and GOOGLE_MAPS_SERVER_API_KEY are both in place:
 *
 *   pnpm --filter @neo/api exec tsx scripts/backfill-organization-coordinates.ts
 *
 * New/edited organizations get geocoded automatically going forward (see
 * commands/organization.ts) — this script only needs to run once, for data
 * that already existed before this feature shipped.
 */
import { withTenant, getOrganizationPaginated, updateOrganization } from "../src/db.js";
import { geocodeAddress } from "../src/services/geocoding.js";

const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "neosleep";

async function run() {
  await withTenant(TENANT_SLUG, async (client) => {
    const { rows } = await getOrganizationPaginated(client, { status: "active" }, 1, 10_000, "created_at", "asc");
    const missing = rows.filter((o) => o.latitude === null || o.longitude === null);
    console.log(`[backfill] ${missing.length} of ${rows.length} active organizations missing coordinates`);

    let geocoded = 0;
    for (const org of missing) {
      const coords = await geocodeAddress({
        address_line1: org.address_line1,
        city: org.city,
        state: org.state,
        postal_code: org.postal_code,
        country_code: org.country_code,
      });
      if (!coords) {
        console.warn(`[backfill] skipped "${org.name}" (${org.id}) — no geocode match`);
        continue;
      }
      await updateOrganization(client, org.id, { latitude: coords.lat, longitude: coords.lng });
      geocoded++;
      console.log(`[backfill] geocoded "${org.name}" -> ${coords.lat}, ${coords.lng}`);
      // Stay comfortably under Google's rate limits between requests.
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    console.log(`[backfill] done — ${geocoded}/${missing.length} geocoded`);
  });
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[backfill] failed:", err);
    process.exit(1);
  });
