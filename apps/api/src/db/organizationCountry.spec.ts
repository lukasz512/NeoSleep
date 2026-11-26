import { describe, it, expect } from "vitest";
import { withTenant, insertOrganization, updateOrganization, insertTerritory } from "../db.js";

// Real-DB integration test (CLAUDE.md: no mock-only API tests). NEO-210: a
// clinic's country follows its territory, never the country of whoever typed
// it in — an MX clinic saved by a PL user was sent to the lab as PL.
const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "neosleep";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

describe("organization country follows its territory", () => {
  it("takes the country of the nearest ancestor territory on insert, ignoring what the form sent", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const s = uniqueSuffix();
      const mx = await insertTerritory(client, { name: `QA MX ${s}`, country_code: "MX", kind: "country" });
      const state = await insertTerritory(client, { name: `QA Estado ${s}`, country_code: "", kind: "region", parent_id: mx.id });

      const org = await insertOrganization(client, {
        name: `QA Clinic ${s}`, country_code: "PL", territory_id: state.id,
      });
      expect(org.country_code).toBe("MX");
    });
  });

  it("re-derives the country when an existing clinic is edited or moved", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const s = uniqueSuffix();
      const mx = await insertTerritory(client, { name: `QA MX ${s}`, country_code: "MX", kind: "country" });
      const pl = await insertTerritory(client, { name: `QA PL ${s}`, country_code: "PL", kind: "country" });
      const org = await insertOrganization(client, { name: `QA Clinic ${s}`, country_code: "PL" });
      expect(org.country_code).toBe("PL");

      const edited = await updateOrganization(client, org.id, { postal_code: "54000", territory_id: mx.id });
      expect(edited?.country_code).toBe("MX");

      const sameCountryResent = await updateOrganization(client, org.id, { country_code: "PL" });
      expect(sameCountryResent?.country_code).toBe("MX");

      const moved = await updateOrganization(client, org.id, { territory_id: pl.id });
      expect(moved?.country_code).toBe("PL");
    });
  });

  it("keeps the sent country when the clinic has no territory", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const org = await insertOrganization(client, { name: `QA Clinic ${uniqueSuffix()}`, country_code: "MX" });
      expect(org.country_code).toBe("MX");
    });
  });
});
