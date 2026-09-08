import { describe, it, expect } from "vitest";
import { getActiveTenantSlugs } from "./tenant.js";

/**
 * getActiveTenantSlugs() is a plain platform-schema read (no tenant
 * search_path involved) — real Postgres per CLAUDE.md's "no mock-only
 * tests" rule, nothing to mock here at all. Added alongside
 * SyncOrthoApneaTreatmentStatusesAllTenantsCommand (see
 * commands/orthoapneaSync.spec.ts), which is the first real caller of this —
 * see that function's own doc comment for why tenantSlugFromHost() alone
 * isn't enough for a job that must run for every tenant.
 */
describe("getActiveTenantSlugs", () => {
  it("returns 'neosleep' (status='active') but not 'fourseasons' (status='provisioning')", async () => {
    // Both rows are real, persistent seed data in platform.tenants (not
    // created/torn down by this test) — see migration 000_platform.sql and
    // project memory on the fourseasons pivot. The integration-test "test"
    // schema is deliberately NOT one of platform.tenants' rows (provisioned
    // directly by scripts/sync-test-schema.ts, outside the normal tenant
    // registry), so it's correctly absent from this result too.
    const slugs = await getActiveTenantSlugs();
    expect(Array.isArray(slugs)).toBe(true);
    expect(slugs).toContain("neosleep");
    expect(slugs).not.toContain("fourseasons");
    slugs.forEach((slug) => expect(typeof slug).toBe("string"));
  });
});
