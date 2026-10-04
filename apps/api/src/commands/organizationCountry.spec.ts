import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcrypt";

// Google Geocoding is the external boundary — the only thing mocked; the DB is real (CLAUDE.md).
const geocodeAddress = vi.fn();
vi.mock("../services/geocoding.js", () => ({ geocodeAddress: (...args: unknown[]) => geocodeAddress(...args) }));

import { withTenant, insertStaffUser, getGlobalTerritoryId, insertTerritory } from "../db.js";
import type { TenantContext } from "../context/TenantContext.js";
import { CreateOrganizationCommand, UpdateOrganizationCommand } from "./organization.js";

/**
 * NEO-210 D1 (Łukasz, 2026-10-03): a clinic's country comes from its address
 * (Google); the territory's country is only the fallback when the address
 * gives none. The form's hidden country (the author's own) never wins.
 */
const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "neosleep";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

type Client = Parameters<typeof CreateOrganizationCommand>[0]["client"];

async function adminContext(client: Client): Promise<TenantContext> {
  const territoryId = await getGlobalTerritoryId(client);
  const email = `qa-country-${uniqueSuffix()}@neosleepcare.com`;
  const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
  const user = await insertStaffUser(client, email, "QA", "Country", "admin", hash, false, null, null, territoryId);
  return {
    slug: TENANT_SLUG,
    client,
    user: { id: user!.id, email, role: "admin", roles: [{ role: "admin", territory_id: territoryId }] },
    requestId: `test-${uniqueSuffix()}`,
  };
}

function clinic(extra: Record<string, unknown> = {}) {
  return {
    name: `QA Country Clinic ${uniqueSuffix()}`,
    type: "clinic",
    email: `qa-country-${uniqueSuffix()}@example.com`,
    phone: "+52 55 5555 0199",
    address_line1: "Av. Ejemplo 200",
    city: "Toluca",
    state: "Estado de México",
    postal_code: "50000",
    country_code: "PL",
    ...extra,
  };
}

beforeEach(() => geocodeAddress.mockReset());

describe("organization country (NEO-210 D1)", () => {
  it("takes the country from the geocoded address, over both the territory and the form", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await adminContext(client);
      const pl = await insertTerritory(client, { name: `QA PL ${uniqueSuffix()}`, country_code: "PL", kind: "country" });
      geocodeAddress.mockResolvedValue({ lat: 19.29, lng: -99.65, countryCode: "MX" });

      const org = await CreateOrganizationCommand(ctx, clinic({ territory_id: pl.id }));

      expect(org.country_code).toBe("MX");
      // The territory country only biases the lookup; the stored country is not sent to Google.
      expect(geocodeAddress).toHaveBeenCalledWith(expect.objectContaining({ region_hint: "PL" }));
      expect(geocodeAddress.mock.calls[0]![0]).not.toHaveProperty("country_code");
    });
  });

  it("falls back to the territory's country when the address resolves to none", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await adminContext(client);
      const mx = await insertTerritory(client, { name: `QA MX ${uniqueSuffix()}`, country_code: "MX", kind: "country" });
      geocodeAddress.mockResolvedValue(null);

      const org = await CreateOrganizationCommand(ctx, clinic({ territory_id: mx.id }));

      expect(org.country_code).toBe("MX");
    });
  });

  it("re-derives the country from the address when the address is edited", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await adminContext(client);
      const mx = await insertTerritory(client, { name: `QA MX ${uniqueSuffix()}`, country_code: "MX", kind: "country" });
      geocodeAddress.mockResolvedValue(null);
      const org = await CreateOrganizationCommand(ctx, clinic({ territory_id: mx.id }));
      expect(org.country_code).toBe("MX");

      geocodeAddress.mockResolvedValue({ lat: 52.23, lng: 21.01, countryCode: "PL" });
      const moved = await UpdateOrganizationCommand(ctx, org.id, { address_line1: "ul. Przykładowa 1", city: "Warszawa", state: null, postal_code: "00-001" });

      expect(moved?.country_code).toBe("PL");
    });
  });
});
