import { describe, it, expect } from "vitest";
import bcrypt from "bcrypt";
import { withTenant, insertStaffUser, getGlobalTerritoryId, getCountryTerritoryId, getPatientById } from "../db.js";
import type { TenantContext } from "../context/TenantContext.js";
import type { StaffRole } from "../db/users.js";
import { ForbiddenError } from "../errors.js";
import { CreatePatientCommand, UpdatePatientCommand, DeletePatientCommand } from "./patient.js";

/**
 * Real DB only, per CLAUDE.md — no mocks. NEO-47: write paths must enforce the
 * same territory scope as GetPatientByIdQuery.
 */

const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "neosleep";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

type Client = TenantContext["client"];

async function buildTestContext(client: Client, role: StaffRole, territoryId: string): Promise<TenantContext> {
  const email = `qa-patient-${role}-${uniqueSuffix()}@neosleepcare.com`;
  const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
  const user = await insertStaffUser(client, email, "QA", "Patients", role, hash, false, null, null, territoryId);
  return {
    slug: TENANT_SLUG,
    client,
    user: { id: user!.id, email, role, roles: [{ role, territory_id: territoryId }] },
    requestId: `test-${uniqueSuffix()}`,
  };
}

async function createTestPatient(ctx: TenantContext, territoryId: string | null) {
  return CreatePatientCommand(ctx, {
    first_name: "Scope",
    last_name: `Test-${uniqueSuffix()}`,
    email: `qa-patient-${uniqueSuffix()}@example.com`,
    phone: "600100200",
    gender: "female",
    date_of_birth: "1980-05-17",
    territory_id: territoryId,
  });
}

async function seedTerritories(client: Client) {
  const globalId = await getGlobalTerritoryId(client);
  const plId = await getCountryTerritoryId(client, "PL");
  const mxId = await getCountryTerritoryId(client, "MX");
  if (!plId || !mxId) throw new Error("PL/MX country territory not seeded");
  return { globalId, plId, mxId };
}

describe("UpdatePatientCommand territory scoping (NEO-47)", () => {
  it("denies a rep editing a patient outside their territory, and leaves the row unchanged", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const { globalId, plId, mxId } = await seedTerritories(client);
      const adminCtx = await buildTestContext(client, "admin", globalId);
      const mxRepCtx = await buildTestContext(client, "rep", mxId);
      const plPatient = await createTestPatient(adminCtx, plId);

      await expect(
        UpdatePatientCommand(mxRepCtx, plPatient.id, { status: "follow_up" })
      ).rejects.toThrow(ForbiddenError);

      expect((await getPatientById(client, plPatient.id))!.status).toBe(plPatient.status);
    });
  }, 20000);

  it("allows a rep editing a patient inside their territory", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const { globalId, plId } = await seedTerritories(client);
      const adminCtx = await buildTestContext(client, "admin", globalId);
      const plRepCtx = await buildTestContext(client, "rep", plId);
      const plPatient = await createTestPatient(adminCtx, plId);

      const updated = await UpdatePatientCommand(plRepCtx, plPatient.id, { status: "follow_up" });

      expect(updated!.status).toBe("follow_up");
    });
  }, 20000);

  it("denies a rep moving an in-scope patient into a territory they don't cover", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const { globalId, plId, mxId } = await seedTerritories(client);
      const adminCtx = await buildTestContext(client, "admin", globalId);
      const plRepCtx = await buildTestContext(client, "rep", plId);
      const plPatient = await createTestPatient(adminCtx, plId);

      await expect(
        UpdatePatientCommand(plRepCtx, plPatient.id, { territory_id: mxId })
      ).rejects.toThrow(ForbiddenError);
    });
  }, 20000);

  it("still allows editing a patient with no territory assigned (rollout-safety fallback)", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const { globalId, mxId } = await seedTerritories(client);
      const adminCtx = await buildTestContext(client, "admin", globalId);
      const mxRepCtx = await buildTestContext(client, "rep", mxId);
      const unassigned = await createTestPatient(adminCtx, null);

      const updated = await UpdatePatientCommand(mxRepCtx, unassigned.id, { status: "follow_up" });

      expect(updated!.status).toBe("follow_up");
    });
  }, 20000);
});

describe("DeletePatientCommand territory scoping (NEO-47)", () => {
  it("denies a region-scoped admin deleting a patient outside their territory", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const { globalId, plId, mxId } = await seedTerritories(client);
      const globalAdminCtx = await buildTestContext(client, "admin", globalId);
      const mxAdminCtx = await buildTestContext(client, "admin", mxId);
      const plPatient = await createTestPatient(globalAdminCtx, plId);

      await expect(DeletePatientCommand(mxAdminCtx, plPatient.id)).rejects.toThrow(ForbiddenError);

      expect(await getPatientById(client, plPatient.id)).not.toBeNull();
    });
  }, 20000);
});
