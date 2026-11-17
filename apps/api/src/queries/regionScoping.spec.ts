import { describe, it, expect } from "vitest";
import bcrypt from "bcrypt";
import { withTenant, insertStaffUser, getGlobalTerritoryId, getCountryTerritoryId } from "../db.js";
import type { TenantContext } from "../context/TenantContext.js";
import type { StaffRole } from "../db/users.js";
import { ForbiddenError } from "../errors.js";
import { CreatePatientCommand } from "../commands/patient.js";
import { CreatePractitionerCommand, UpdatePractitionerCommand, DeletePractitionerCommand } from "../commands/practitioner.js";
import { CreateOrganizationCommand, UpdateOrganizationCommand, DeleteOrganizationCommand } from "../commands/organization.js";
import { CreateLeadCommand, UpdateLeadCommand, ConvertLeadCommand, SendLeadOfferEmailCommand, DeleteLeadCommand } from "../commands/lead.js";
import { GetPatientListQuery, GetPatientByIdQuery } from "./patient.js";
import { GetPractitionerListQuery, GetPractitionerByIdQuery } from "./practitioner.js";
import { GetOrganizationListQuery, GetOrganizationByIdQuery } from "./organization.js";
import { GetLeadListQuery, GetLeadByIdQuery } from "./lead.js";

/**
 * Regression coverage for the P0 /audit finding: GetPatientListQuery,
 * GetPractitionerListQuery, GetOrganizationListQuery, and GetLeadListQuery
 * (and their ByIdQuery counterparts) never applied the caller's RBAC
 * territory scope (middleware/requireScope.ts) — any authenticated role
 * could list or fetch a record cross-region via direct API call, even
 * though the UI hid this. Real Postgres, no mocks, per CLAUDE.md.
 *
 * Scoping is ltree/territory_id-based (migration 022), not the flat
 * country_code column — a record needs a real territory_id set (not just
 * country_code) for the check to actually restrict anything, since an
 * unassigned record is visible to everyone as a rollout-safety fallback
 * (see requireScope.ts's assertTerritoryAccessByTerritoryId doc comment).
 *
 * One consolidated file rather than four, since the pattern (and the fix)
 * is identical across all four entities — see requireScope.spec.ts for unit
 * coverage of the underlying getAllowedScopePaths/assertTerritoryAccess*
 * primitives themselves; this file proves they're actually wired up.
 */

const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "neosleep";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

type Client = Parameters<typeof CreatePatientCommand>[0]["client"];

async function buildTestContext(client: Client, role: StaffRole, territoryId: string): Promise<TenantContext> {
  const email = `qa-region-scope-${role}-${uniqueSuffix()}@neosleepcare.com`;
  const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
  const user = await insertStaffUser(client, email, "QA", "Scope", role, hash, false, null, null, territoryId);
  return {
    slug: TENANT_SLUG,
    client,
    user: { id: user!.id, email, role, roles: [{ role, territory_id: territoryId }] },
    requestId: `test-${uniqueSuffix()}`,
  };
}

describe("Row-level region scoping (ADR: requireScope applied to patient/practitioner/organization/lead)", () => {
  it("patient: a PL-scoped rep sees a PL patient but not an MX patient; global admin sees both", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const globalId = await getGlobalTerritoryId(client);
      const plId = await getCountryTerritoryId(client, "PL");
      const mxId = await getCountryTerritoryId(client, "MX");
      if (!plId || !mxId) throw new Error("PL/MX country territory not seeded");

      const adminCtx = await buildTestContext(client, "admin", globalId);
      const plRepCtx = await buildTestContext(client, "rep", plId);

      const plPatient = await CreatePatientCommand(adminCtx, {
        gender: "female",
        date_of_birth: "1980-01-01",
        first_name: "PL", last_name: `Patient-${uniqueSuffix()}`,
        email: `pl-patient-${uniqueSuffix()}@example.com`, phone: "600100200",
        country_code: "PL", territory_id: plId,
      });
      const mxPatient = await CreatePatientCommand(adminCtx, {
        gender: "female",
        date_of_birth: "1980-01-01",
        first_name: "MX", last_name: `Patient-${uniqueSuffix()}`,
        email: `mx-patient-${uniqueSuffix()}@example.com`, phone: "600100201",
        country_code: "MX", territory_id: mxId,
      });

      const repList = await GetPatientListQuery(plRepCtx, {});
      expect(repList.items.some((p) => p.id === plPatient.id)).toBe(true);
      expect(repList.items.some((p) => p.id === mxPatient.id)).toBe(false);

      expect((await GetPatientByIdQuery(plRepCtx, plPatient.id))?.id).toBe(plPatient.id);
      await expect(GetPatientByIdQuery(plRepCtx, mxPatient.id)).rejects.toThrow(ForbiddenError);

      const adminList = await GetPatientListQuery(adminCtx, {});
      expect(adminList.items.some((p) => p.id === plPatient.id)).toBe(true);
      expect(adminList.items.some((p) => p.id === mxPatient.id)).toBe(true);
    });
  }, 20000);

  it("practitioner: an MX-scoped kam sees an MX HCP but not a PL HCP", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const globalId = await getGlobalTerritoryId(client);
      const plId = await getCountryTerritoryId(client, "PL");
      const mxId = await getCountryTerritoryId(client, "MX");
      if (!plId || !mxId) throw new Error("PL/MX country territory not seeded");

      const adminCtx = await buildTestContext(client, "admin", globalId);
      const mxKamCtx = await buildTestContext(client, "kam", mxId);

      const plHcp = await CreatePractitionerCommand(adminCtx, {
        first_name: "PL", last_name: `Doc-${uniqueSuffix()}`,
        email: `pl-hcp-${uniqueSuffix()}@example.com`, phone: "600300400",
        country_code: "PL", territory_id: plId,
      });
      const mxHcp = await CreatePractitionerCommand(adminCtx, {
        first_name: "MX", last_name: `Doc-${uniqueSuffix()}`,
        email: `mx-hcp-${uniqueSuffix()}@example.com`, phone: "600300401",
        country_code: "MX", territory_id: mxId,
      });

      const kamList = await GetPractitionerListQuery(mxKamCtx, {});
      expect(kamList.items.some((p) => p.id === mxHcp.id)).toBe(true);
      expect(kamList.items.some((p) => p.id === plHcp.id)).toBe(false);

      expect((await GetPractitionerByIdQuery(mxKamCtx, mxHcp.id))?.id).toBe(mxHcp.id);
      await expect(GetPractitionerByIdQuery(mxKamCtx, plHcp.id)).rejects.toThrow(ForbiddenError);
    });
  }, 20000);

  it("organization: a PL-scoped msl sees a PL HCO but not an MX HCO", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const globalId = await getGlobalTerritoryId(client);
      const plId = await getCountryTerritoryId(client, "PL");
      const mxId = await getCountryTerritoryId(client, "MX");
      if (!plId || !mxId) throw new Error("PL/MX country territory not seeded");

      const adminCtx = await buildTestContext(client, "admin", globalId);
      const plMslCtx = await buildTestContext(client, "msl", plId);

      const plHco = await CreateOrganizationCommand(adminCtx, {
        name: `PL Clinic ${uniqueSuffix()}`, email: `pl-hco-${uniqueSuffix()}@example.com`,
        phone: "600200300", country_code: "PL", territory_id: plId,
      });
      const mxHco = await CreateOrganizationCommand(adminCtx, {
        name: `MX Clinic ${uniqueSuffix()}`, email: `mx-hco-${uniqueSuffix()}@example.com`,
        phone: "600200301", country_code: "MX", territory_id: mxId,
      });

      const mslList = await GetOrganizationListQuery(plMslCtx, {});
      expect(mslList.items.some((o) => o.id === plHco.id)).toBe(true);
      expect(mslList.items.some((o) => o.id === mxHco.id)).toBe(false);

      expect((await GetOrganizationByIdQuery(plMslCtx, plHco.id))?.id).toBe(plHco.id);
      await expect(GetOrganizationByIdQuery(plMslCtx, mxHco.id)).rejects.toThrow(ForbiddenError);
    });
  }, 20000);

  it("lead: an MX-scoped rep sees an MX lead but not a PL lead", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const globalId = await getGlobalTerritoryId(client);
      const plId = await getCountryTerritoryId(client, "PL");
      const mxId = await getCountryTerritoryId(client, "MX");
      if (!plId || !mxId) throw new Error("PL/MX country territory not seeded");

      const adminCtx = await buildTestContext(client, "admin", globalId);
      const mxRepCtx = await buildTestContext(client, "rep", mxId);

      const plLead = await CreateLeadCommand(adminCtx, {
        first_name: "PL", last_name: `Lead-${uniqueSuffix()}`, type: "doctor",
        country_code: "PL", territory_id: plId, metadata: { institution: "PL Clinic" },
      });
      const mxLead = await CreateLeadCommand(adminCtx, {
        first_name: "MX", last_name: `Lead-${uniqueSuffix()}`, type: "doctor",
        country_code: "MX", territory_id: mxId, metadata: { institution: "MX Clinic" },
      });

      const repList = await GetLeadListQuery(mxRepCtx, {});
      expect(repList.items.some((l) => l.id === mxLead.id)).toBe(true);
      expect(repList.items.some((l) => l.id === plLead.id)).toBe(false);

      expect((await GetLeadByIdQuery(mxRepCtx, mxLead.id))?.id).toBe(mxLead.id);
      await expect(GetLeadByIdQuery(mxRepCtx, plLead.id)).rejects.toThrow(ForbiddenError);
    });
  }, 20000);
});

/**
 * CORE-226 slice 1: a write reaches exactly as far as a read. Before it, the
 * create/update/delete commands of practitioner, organization and lead (and
 * patient create) applied no territory check at all, so a caller who got a 403
 * on GET could still PATCH or DELETE the same record.
 */
describe("Row-level region scoping on writes (CORE-226)", () => {
  const outsideScope = { statusCode: 403, reason: "OUTSIDE_TERRITORY" };

  async function setup(client: Client) {
    const globalId = await getGlobalTerritoryId(client);
    const plId = await getCountryTerritoryId(client, "PL");
    const mxId = await getCountryTerritoryId(client, "MX");
    if (!plId || !mxId) throw new Error("PL/MX country territory not seeded");
    return { plId, mxId, adminCtx: await buildTestContext(client, "admin", globalId), mxCtx: await buildTestContext(client, "manager", mxId) };
  }

  it("practitioner: an MX manager can't create in PL, nor update, move or delete a PL HCP; their own MX HCP they can", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const { plId, mxId, adminCtx, mxCtx } = await setup(client);
      const hcp = (territory_id: string, cc: string) => ({
        first_name: cc, last_name: `Doc-${uniqueSuffix()}`,
        email: `${cc.toLowerCase()}-hcp-w-${uniqueSuffix()}@example.com`, phone: "600300400",
        country_code: cc, territory_id,
      });
      const plHcp = await CreatePractitionerCommand(adminCtx, hcp(plId, "PL"));

      await expect(CreatePractitionerCommand(mxCtx, hcp(plId, "PL"))).rejects.toMatchObject(outsideScope);
      await expect(UpdatePractitionerCommand(mxCtx, plHcp.id, { phone: "600999888" })).rejects.toMatchObject(outsideScope);
      await expect(DeletePractitionerCommand(mxCtx, plHcp.id)).rejects.toMatchObject(outsideScope);
      expect((await GetPractitionerByIdQuery(adminCtx, plHcp.id))?.phone).toBe("600300400");

      const mxHcp = await CreatePractitionerCommand(mxCtx, hcp(mxId, "MX"));
      expect((await UpdatePractitionerCommand(mxCtx, mxHcp.id, { phone: "600999777" }))?.phone).toBe("600999777");
      await expect(UpdatePractitionerCommand(mxCtx, mxHcp.id, { territory_id: plId })).rejects.toMatchObject(outsideScope);
    });
  }, 20000);

  it("organization: an MX manager can't create in PL, nor update, move or delete a PL HCO; their own MX HCO they can", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const { plId, mxId, adminCtx, mxCtx } = await setup(client);
      const hco = (territory_id: string, cc: string) => ({
        name: `${cc} Clinic W ${uniqueSuffix()}`, email: `${cc.toLowerCase()}-hco-w-${uniqueSuffix()}@example.com`,
        phone: "600200300", country_code: cc, territory_id,
      });
      const plHco = await CreateOrganizationCommand(adminCtx, hco(plId, "PL"));

      await expect(CreateOrganizationCommand(mxCtx, hco(plId, "PL"))).rejects.toMatchObject(outsideScope);
      await expect(UpdateOrganizationCommand(mxCtx, plHco.id, { phone: "600999888" })).rejects.toMatchObject(outsideScope);
      await expect(DeleteOrganizationCommand(mxCtx, plHco.id)).rejects.toMatchObject(outsideScope);
      expect((await GetOrganizationByIdQuery(adminCtx, plHco.id))?.phone).toBe("600200300");

      const mxHco = await CreateOrganizationCommand(mxCtx, hco(mxId, "MX"));
      expect((await UpdateOrganizationCommand(mxCtx, mxHco.id, { phone: "600999777" }))?.phone).toBe("600999777");
      await expect(UpdateOrganizationCommand(mxCtx, mxHco.id, { territory_id: plId })).rejects.toMatchObject(outsideScope);
    });
  }, 20000);

  it("lead: an MX manager can't create in PL, nor update, move, convert or delete a PL lead; their own MX lead they can", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const { plId, mxId, adminCtx, mxCtx } = await setup(client);
      const lead = (territory_id: string, cc: string) => ({
        first_name: cc, last_name: `Lead-W-${uniqueSuffix()}`, type: "doctor",
        country_code: cc, territory_id, metadata: { institution: `${cc} Clinic` },
      });
      const plLead = await CreateLeadCommand(adminCtx, lead(plId, "PL"));

      await expect(CreateLeadCommand(mxCtx, lead(plId, "PL"))).rejects.toMatchObject(outsideScope);
      await expect(UpdateLeadCommand(mxCtx, plLead.id, { first_name: "Changed" })).rejects.toMatchObject(outsideScope);
      await expect(ConvertLeadCommand(mxCtx, plLead.id, { converted_to_id: plLead.id, converted_to_type: "practitioner" })).rejects.toMatchObject(outsideScope);
      await expect(SendLeadOfferEmailCommand(mxCtx, plLead.id)).rejects.toMatchObject(outsideScope);
      await expect(DeleteLeadCommand(mxCtx, plLead.id)).rejects.toMatchObject(outsideScope);
      expect((await GetLeadByIdQuery(adminCtx, plLead.id))?.first_name).toBe("PL");

      const mxLead = await CreateLeadCommand(mxCtx, lead(mxId, "MX"));
      expect((await UpdateLeadCommand(mxCtx, mxLead.id, { first_name: "Renamed" }))?.first_name).toBe("Renamed");
      await expect(UpdateLeadCommand(mxCtx, mxLead.id, { territory_id: plId })).rejects.toMatchObject(outsideScope);
    });
  }, 20000);

  it("patient: an MX manager can't create a patient in a PL territory", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const { plId, mxId, mxCtx } = await setup(client);
      const patient = (territory_id: string, cc: string) => ({
        gender: "female", date_of_birth: "1980-01-01",
        first_name: cc, last_name: `Patient-W-${uniqueSuffix()}`,
        email: `${cc.toLowerCase()}-patient-w-${uniqueSuffix()}@example.com`, phone: "600100200",
        country_code: cc, territory_id,
      });
      await expect(CreatePatientCommand(mxCtx, patient(plId, "PL"))).rejects.toMatchObject(outsideScope);
      expect((await CreatePatientCommand(mxCtx, patient(mxId, "MX"))).territory_id).toBe(mxId);
    });
  }, 20000);
});
