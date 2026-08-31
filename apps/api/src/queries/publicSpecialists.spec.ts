import { describe, it, expect } from "vitest";
import { withTenant, insertOrganization, insertPractitioner } from "../db.js";
import { GetPublicSpecialistsQuery } from "./organization.js";

// Query-level integration test — hits the real tenant DB via withTenant(),
// per CLAUDE.md's "No mock-only tests for the API server" rule. Needs a
// running Postgres with this tenant's migrations applied (pnpm start /
// docker compose). This is the public, unauthenticated read path for the
// "find a specialist" map — no session/TenantContext involved.
const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "neosleep";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

describe("GetPublicSpecialistsQuery", () => {
  it("only returns active organizations that have been geocoded", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const suffix = uniqueSuffix();

      await insertOrganization(client, {
        name: `QA Active Geocoded Clinic ${suffix}`,
        status: "active",
        latitude: 52.23,
        longitude: 21.01,
      });
      await insertOrganization(client, {
        name: `QA Active Ungeocoded Clinic ${suffix}`,
        status: "active",
      });
      await insertOrganization(client, {
        name: `QA Pending Clinic ${suffix}`,
        status: "pending_approval",
        latitude: 52.23,
        longitude: 21.01,
      });

      const results = await GetPublicSpecialistsQuery(client, suffix);
      const names = results.map((r) => r.name);

      expect(names).toContain(`QA Active Geocoded Clinic ${suffix}`);
      expect(names).not.toContain(`QA Active Ungeocoded Clinic ${suffix}`);
      expect(names).not.toContain(`QA Pending Clinic ${suffix}`);
    });
  });

  it("matches an affiliated practitioner's name and surfaces their clinic", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const suffix = uniqueSuffix();

      const org = await insertOrganization(client, {
        name: `QA Doctor Search Clinic ${suffix}`,
        status: "active",
        latitude: 19.4326,
        longitude: -99.1332,
      });
      await insertPractitioner(client, {
        first_name: "Zbigniew",
        last_name: `Testowski${suffix}`,
        organization_id: org.id,
        status: "active",
      });

      const results = await GetPublicSpecialistsQuery(client, `Testowski${suffix}`);

      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe(org.id);
      expect(results[0]!.practitioners.some((p) => p.name.includes(`Testowski${suffix}`))).toBe(true);
    });
  });
});
