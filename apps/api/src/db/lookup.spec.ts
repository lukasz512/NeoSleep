import { describe, it, expect } from "vitest";
import { withTenant } from "../db.js";
import { getConfigOptions } from "./lookup.js";

const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "neosleep";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

describe("getConfigOptions", () => {
  it("returns platform specialties/organization_types plus tenant-only regions", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      // platform.lookups is seeded (migrations/002_seed.sql), shared across every tenant.
      const before = await getConfigOptions(client);
      expect(before.specialties.length).toBeGreaterThan(0);
      expect(before.organization_types.length).toBeGreaterThan(0);

      const regionKey = `qa-region-${uniqueSuffix()}`;
      await client.query(
        `INSERT INTO lookup (type, key, locale, value, sort_order, enabled)
         VALUES ('region', $1, 'en', 'QA Test Region', 999, true)`,
        [regionKey]
      );

      const after = await getConfigOptions(client);
      expect(after.regions.some((r) => r.key === regionKey && r.value === "QA Test Region")).toBe(true);
    });
  });
});
