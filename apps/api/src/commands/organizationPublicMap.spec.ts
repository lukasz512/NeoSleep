import { describe, it, expect } from "vitest";
import bcrypt from "bcrypt";
import { withTenant, insertStaffUser, getGlobalTerritoryId } from "../db.js";
import type { TenantContext } from "../context/TenantContext.js";
import type { StaffRole } from "../db/users.js";
import { CreateOrganizationCommand, UpdateOrganizationCommand } from "./organization.js";

/**
 * NEO-79: organization.show_on_public_map (migration 033) decides whether a
 * clinic appears on the public find-a-specialist map. Only an admin can
 * change it; the PWA form still submits the loaded value for everyone, so a
 * non-admin's value is ignored rather than rejected. Real DB only, per
 * CLAUDE.md.
 */

const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "neosleep";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

type Client = Parameters<typeof CreateOrganizationCommand>[0]["client"];

async function buildTestContext(client: Client, role: StaffRole): Promise<TenantContext> {
  const territoryId = await getGlobalTerritoryId(client);
  const email = `qa-public-map-${role}-${uniqueSuffix()}@neosleepcare.com`;
  const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
  const user = await insertStaffUser(client, email, "QA", "PublicMap", role, hash, false, null, null, territoryId);
  return {
    slug: TENANT_SLUG,
    client,
    user: { id: user!.id, email, role, roles: [{ role, territory_id: territoryId }] },
    requestId: `test-${uniqueSuffix()}`,
  };
}

function createInput() {
  return {
    name: `QA Public Map Clinic ${uniqueSuffix()}`,
    type: "clinic",
    email: `qa-public-map-${uniqueSuffix()}@example.com`,
    phone: "+52 55 5555 0199",
  };
}

describe("organization.show_on_public_map", () => {
  it("defaults to shown for a new organization", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client, "rep");
      const org = await CreateOrganizationCommand(ctx, createInput());
      expect(org.show_on_public_map).toBe(true);
    });
  });

  it("an admin can hide an organization from the public map and show it again", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client, "admin");
      const org = await CreateOrganizationCommand(ctx, { ...createInput(), show_on_public_map: false });
      expect(org.show_on_public_map).toBe(false);

      const shown = await UpdateOrganizationCommand(ctx, org.id, { show_on_public_map: true });
      expect(shown?.show_on_public_map).toBe(true);
    });
  });

  it("a non-admin's value is ignored on create and update (the rest of the edit still saves)", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const rep = await buildTestContext(client, "rep");
      const created = await CreateOrganizationCommand(rep, { ...createInput(), show_on_public_map: false });
      expect(created.show_on_public_map).toBe(true);

      const updated = await UpdateOrganizationCommand(rep, created.id, { city: "Ciudad de México", show_on_public_map: false });
      expect(updated?.city).toBe("Ciudad de México");
      expect(updated?.show_on_public_map).toBe(true);
    });
  });
});
