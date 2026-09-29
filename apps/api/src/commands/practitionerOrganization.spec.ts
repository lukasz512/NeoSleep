import { describe, it, expect } from "vitest";
import bcrypt from "bcrypt";
import { withTenant, insertStaffUser, getGlobalTerritoryId, getCountryTerritoryId, getUserPrimaryOrganizationId } from "../db.js";
import type { TenantContext } from "../context/TenantContext.js";
import type { StaffRole } from "../db/users.js";
import { ConflictError, NotFoundError, ValidationError, ForbiddenError } from "../errors.js";
import { CreatePractitionerCommand } from "./practitioner.js";
import { CreateOrganizationCommand } from "./organization.js";
import {
  LinkPractitionerOrganizationCommand,
  UnlinkPractitionerOrganizationCommand,
  SetPractitionerOrganizationPrimaryCommand,
} from "./practitionerOrganization.js";

/**
 * Real DB only, per CLAUDE.md — no mocks. See docs/stories/pwa-medico-view.md
 * for the dual-scoped-primary design these commands implement.
 */

const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "neosleep";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

type Client = Parameters<typeof CreatePractitionerCommand>[0]["client"];

async function buildTestContext(client: Client, role: StaffRole, territoryId: string): Promise<TenantContext> {
  const email = `qa-prac-org-${role}-${uniqueSuffix()}@neosleepcare.com`;
  const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
  const user = await insertStaffUser(client, email, "QA", "Clinics", role, hash, false, null, null, territoryId);
  return {
    slug: TENANT_SLUG,
    client,
    user: { id: user!.id, email, role, roles: [{ role, territory_id: territoryId }] },
    requestId: `test-${uniqueSuffix()}`,
  };
}

async function createTestPractitioner(ctx: TenantContext, territoryId?: string) {
  return CreatePractitionerCommand(ctx, {
    first_name: "Clinics",
    last_name: `Test-${uniqueSuffix()}`,
    email: `qa-prac-${uniqueSuffix()}@example.com`,
    phone: "600100200",
    territory_id: territoryId ?? null,
  });
}

async function createTestOrganization(ctx: TenantContext) {
  return CreateOrganizationCommand(ctx, {
    name: `QA Clinic ${uniqueSuffix()}`,
    type: "clinic",
    email: `qa-clinic-${uniqueSuffix()}@example.com`,
    phone: "600100200",
  });
}

describe("LinkPractitionerOrganizationCommand", () => {
  it("links a practitioner to a clinic and returns the updated affiliation list", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const globalId = await getGlobalTerritoryId(client);
      const adminCtx = await buildTestContext(client, "admin", globalId);
      const practitioner = await createTestPractitioner(adminCtx);
      const org = await createTestOrganization(adminCtx);

      const result = await LinkPractitionerOrganizationCommand(adminCtx, practitioner.id, { organization_id: org.id });

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ organization_id: org.id, name: org.name, is_primary: false });
    });
  }, 15000);

  it("throws ConflictError, not a raw DatabaseError, when linking the same clinic twice", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const globalId = await getGlobalTerritoryId(client);
      const adminCtx = await buildTestContext(client, "admin", globalId);
      const practitioner = await createTestPractitioner(adminCtx);
      const org = await createTestOrganization(adminCtx);
      await LinkPractitionerOrganizationCommand(adminCtx, practitioner.id, { organization_id: org.id });

      await expect(
        LinkPractitionerOrganizationCommand(adminCtx, practitioner.id, { organization_id: org.id })
      ).rejects.toThrow(ConflictError);
    });
  }, 15000);

  it("throws NotFoundError for a non-existent practitioner", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const globalId = await getGlobalTerritoryId(client);
      const adminCtx = await buildTestContext(client, "admin", globalId);
      const org = await createTestOrganization(adminCtx);

      await expect(
        LinkPractitionerOrganizationCommand(adminCtx, "00000000-0000-0000-0000-000000000000", { organization_id: org.id })
      ).rejects.toThrow(NotFoundError);
    });
  }, 15000);

  it("throws NotFoundError for a non-existent organization", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const globalId = await getGlobalTerritoryId(client);
      const adminCtx = await buildTestContext(client, "admin", globalId);
      const practitioner = await createTestPractitioner(adminCtx);

      await expect(
        LinkPractitionerOrganizationCommand(adminCtx, practitioner.id, { organization_id: "00000000-0000-0000-0000-000000000000" })
      ).rejects.toThrow(NotFoundError);
    });
  }, 15000);

  it("throws ValidationError when organization_id is missing", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const globalId = await getGlobalTerritoryId(client);
      const adminCtx = await buildTestContext(client, "admin", globalId);
      const practitioner = await createTestPractitioner(adminCtx);

      await expect(
        LinkPractitionerOrganizationCommand(adminCtx, practitioner.id, { organization_id: "" })
      ).rejects.toThrow(ValidationError);
    });
  }, 15000);

  it("denies a rep outside the practitioner's territory with ForbiddenError (first write-side use of assertTerritoryAccessByTerritoryId)", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const globalId = await getGlobalTerritoryId(client);
      const plId = await getCountryTerritoryId(client, "PL");
      const mxId = await getCountryTerritoryId(client, "MX");
      if (!plId || !mxId) throw new Error("PL/MX country territory not seeded");

      const adminCtx = await buildTestContext(client, "admin", globalId);
      const mxRepCtx = await buildTestContext(client, "rep", mxId);
      const plPractitioner = await createTestPractitioner(adminCtx, plId);
      const org = await createTestOrganization(adminCtx);

      await expect(
        LinkPractitionerOrganizationCommand(mxRepCtx, plPractitioner.id, { organization_id: org.id })
      ).rejects.toThrow(ForbiddenError);
    });
  }, 20000);
});

describe("UnlinkPractitionerOrganizationCommand", () => {
  it("removes the affiliation and clears a rep's primary_org_id if it pointed at that clinic", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const globalId = await getGlobalTerritoryId(client);
      const adminCtx = await buildTestContext(client, "admin", globalId);
      const repCtx = await buildTestContext(client, "rep", globalId);
      const practitioner = await createTestPractitioner(adminCtx);
      const org = await createTestOrganization(adminCtx);
      await LinkPractitionerOrganizationCommand(adminCtx, practitioner.id, { organization_id: org.id });
      await SetPractitionerOrganizationPrimaryCommand(repCtx, practitioner.id, org.id);
      expect(await getUserPrimaryOrganizationId(client, practitioner.id, repCtx.user.id)).toBe(org.id);

      const result = await UnlinkPractitionerOrganizationCommand(adminCtx, practitioner.id, org.id);

      expect(result).toHaveLength(0);
      expect(await getUserPrimaryOrganizationId(client, practitioner.id, repCtx.user.id)).toBeNull();
    });
  }, 15000);

  it("throws NotFoundError when the affiliation doesn't exist", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const globalId = await getGlobalTerritoryId(client);
      const adminCtx = await buildTestContext(client, "admin", globalId);
      const practitioner = await createTestPractitioner(adminCtx);
      const org = await createTestOrganization(adminCtx);

      await expect(UnlinkPractitionerOrganizationCommand(adminCtx, practitioner.id, org.id)).rejects.toThrow(NotFoundError);
    });
  }, 15000);
});

describe("SetPractitionerOrganizationPrimaryCommand (dual-scoped primary)", () => {
  it("admin sets the global primary and it unsets any previous global primary", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const globalId = await getGlobalTerritoryId(client);
      const adminCtx = await buildTestContext(client, "admin", globalId);
      const practitioner = await createTestPractitioner(adminCtx);
      const orgA = await createTestOrganization(adminCtx);
      const orgB = await createTestOrganization(adminCtx);
      await LinkPractitionerOrganizationCommand(adminCtx, practitioner.id, { organization_id: orgA.id });
      await LinkPractitionerOrganizationCommand(adminCtx, practitioner.id, { organization_id: orgB.id });

      await SetPractitionerOrganizationPrimaryCommand(adminCtx, practitioner.id, orgA.id);
      let result = await SetPractitionerOrganizationPrimaryCommand(adminCtx, practitioner.id, orgB.id);

      const byId = Object.fromEntries(result.organizations.map((o) => [o.organization_id, o]));
      expect(byId[orgA.id]!.is_primary).toBe(false);
      expect(byId[orgB.id]!.is_primary).toBe(true);
      expect(result.my_primary_organization_id).toBeNull(); // admin has no personal assignment row
    });
  }, 15000);

  it("manager sets the global primary too (same as admin)", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const globalId = await getGlobalTerritoryId(client);
      const adminCtx = await buildTestContext(client, "admin", globalId);
      const managerCtx = await buildTestContext(client, "manager", globalId);
      const practitioner = await createTestPractitioner(adminCtx);
      const org = await createTestOrganization(adminCtx);
      await LinkPractitionerOrganizationCommand(adminCtx, practitioner.id, { organization_id: org.id });

      const result = await SetPractitionerOrganizationPrimaryCommand(managerCtx, practitioner.id, org.id);

      expect(result.organizations[0]!.is_primary).toBe(true);
    });
  }, 15000);

  it("rep sets only their own primary_org_id — never touches the global is_primary flag", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const globalId = await getGlobalTerritoryId(client);
      const adminCtx = await buildTestContext(client, "admin", globalId);
      const repCtx = await buildTestContext(client, "rep", globalId);
      const practitioner = await createTestPractitioner(adminCtx);
      const org = await createTestOrganization(adminCtx);
      await LinkPractitionerOrganizationCommand(adminCtx, practitioner.id, { organization_id: org.id });

      const result = await SetPractitionerOrganizationPrimaryCommand(repCtx, practitioner.id, org.id);

      expect(result.organizations[0]!.is_primary).toBe(false); // global default untouched
      expect(result.my_primary_organization_id).toBe(org.id);
      expect(await getUserPrimaryOrganizationId(client, practitioner.id, repCtx.user.id)).toBe(org.id);
    });
  }, 15000);

  it("two different reps can each have their own primary for the same practitioner without conflicting", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const globalId = await getGlobalTerritoryId(client);
      const adminCtx = await buildTestContext(client, "admin", globalId);
      const repACtx = await buildTestContext(client, "rep", globalId);
      const repBCtx = await buildTestContext(client, "rep", globalId);
      const practitioner = await createTestPractitioner(adminCtx);
      const orgA = await createTestOrganization(adminCtx);
      const orgB = await createTestOrganization(adminCtx);
      await LinkPractitionerOrganizationCommand(adminCtx, practitioner.id, { organization_id: orgA.id });
      await LinkPractitionerOrganizationCommand(adminCtx, practitioner.id, { organization_id: orgB.id });

      await SetPractitionerOrganizationPrimaryCommand(repACtx, practitioner.id, orgA.id);
      await SetPractitionerOrganizationPrimaryCommand(repBCtx, practitioner.id, orgB.id);

      expect(await getUserPrimaryOrganizationId(client, practitioner.id, repACtx.user.id)).toBe(orgA.id);
      expect(await getUserPrimaryOrganizationId(client, practitioner.id, repBCtx.user.id)).toBe(orgB.id);
    });
  }, 20000);

  it("throws ValidationError when the target clinic isn't linked to the practitioner yet", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const globalId = await getGlobalTerritoryId(client);
      const adminCtx = await buildTestContext(client, "admin", globalId);
      const practitioner = await createTestPractitioner(adminCtx);
      const org = await createTestOrganization(adminCtx);

      await expect(SetPractitionerOrganizationPrimaryCommand(adminCtx, practitioner.id, org.id)).rejects.toThrow(ValidationError);
    });
  }, 15000);
});
