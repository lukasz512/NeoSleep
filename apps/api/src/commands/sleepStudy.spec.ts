import { describe, it, expect } from "vitest";
import bcrypt from "bcrypt";
import { withTenant, insertStaffUser } from "../db.js";
import type { TenantContext } from "../context/TenantContext.js";
import { CreatePatientCommand } from "./patient.js";
import { GetPatientByIdQuery } from "../queries/patient.js";
import { CreateSleepStudyCommand, UpdateSleepStudyCommand } from "./sleepStudy.js";
import { ValidationError } from "../errors.js";

// Command-level integration test — hits the real tenant DB via withTenant(),
// per CLAUDE.md's "No mock-only tests for the API server" rule. Needs a running
// Postgres with this tenant's migrations applied (pnpm start / docker compose).
const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "neosleep";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function buildTestContext(client: Parameters<typeof CreatePatientCommand>[0]["client"]): Promise<TenantContext> {
  const email = `qa-study-cmd-${uniqueSuffix()}@neosleepcare.com`;
  const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
  const user = await insertStaffUser(client, email, "QA", "Pilot", "admin", hash, false);
  return {
    slug: TENANT_SLUG,
    client,
    user: { id: user!.id, email, role: "admin", roles: [{ role: "admin", scope: "global" }] },
    requestId: `test-${uniqueSuffix()}`,
  };
}

async function createTestPatient(ctx: TenantContext) {
  return CreatePatientCommand(ctx, { first_name: "Test", last_name: `Patient-${uniqueSuffix()}` });
}

describe("CreateSleepStudyCommand", () => {
  it("requires a patient_id", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      // @ts-expect-error deliberately omitting the required field
      await expect(CreateSleepStudyCommand(ctx, { status: "ordered" })).rejects.toThrow(ValidationError);
    });
  });

  it("rejects an invalid status", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const patient = await createTestPatient(ctx);
      await expect(
        CreateSleepStudyCommand(ctx, { patient_id: patient.id, status: "not-a-real-status" })
      ).rejects.toThrow(ValidationError);
    });
  });

  it("creates a study defaulting to status 'ordered'", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const patient = await createTestPatient(ctx);
      const study = await CreateSleepStudyCommand(ctx, { patient_id: patient.id });
      expect(study.status).toBe("ordered");
      expect(study.patient_id).toBe(patient.id);
    });
  });
});

describe("UpdateSleepStudyCommand", () => {
  it("propagates a new ahi_score onto the patient's ahi_baseline in the same transaction", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const patient = await createTestPatient(ctx);
      const study = await CreateSleepStudyCommand(ctx, { patient_id: patient.id });

      await UpdateSleepStudyCommand(ctx, study.id, { ahi_score: 22.5, status: "interpreted", interpretation: "Moderate OSA." });

      const updatedPatient = await GetPatientByIdQuery(ctx, patient.id);
      expect(updatedPatient?.ahi_baseline).toBe(22.5);
    });
  });

  it("returns null for a non-existent sleep study", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const result = await UpdateSleepStudyCommand(ctx, "00000000-0000-0000-0000-000000000000", { status: "cancelled" });
      expect(result).toBeNull();
    });
  });
});
