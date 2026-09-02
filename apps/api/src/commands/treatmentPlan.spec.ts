import { describe, it, expect } from "vitest";
import bcrypt from "bcrypt";
import { withTenant, insertStaffUser } from "../db.js";
import type { TenantContext } from "../context/TenantContext.js";
import { CreatePatientCommand } from "./patient.js";
import { CreateSleepStudyCommand } from "./sleepStudy.js";
import { CreateTreatmentPlanCommand } from "./treatmentPlan.js";
import { ValidationError } from "../errors.js";

// Command-level integration test — hits the real tenant DB via withTenant(),
// per CLAUDE.md's "No mock-only tests for the API server" rule. Needs a running
// Postgres with this tenant's migrations applied (pnpm start / docker compose).
const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "neosleep";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function buildTestContext(client: Parameters<typeof CreatePatientCommand>[0]["client"]): Promise<TenantContext> {
  const email = `qa-tx-plan-cmd-${uniqueSuffix()}@neosleepcare.com`;
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

describe("CreateTreatmentPlanCommand", () => {
  it("rejects an invalid type", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const patient = await createTestPatient(ctx);
      const study = await CreateSleepStudyCommand(ctx, { patient_id: patient.id });

      await expect(
        CreateTreatmentPlanCommand(ctx, { patient_id: patient.id, sleep_study_id: study.id, type: "space_helmet" })
      ).rejects.toThrow(ValidationError);
    });
  });

  it("rejects a sleep_study_id that does not belong to the given patient_id", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const patientA = await createTestPatient(ctx);
      const patientB = await createTestPatient(ctx);
      const studyForB = await CreateSleepStudyCommand(ctx, { patient_id: patientB.id });

      await expect(
        CreateTreatmentPlanCommand(ctx, { patient_id: patientA.id, sleep_study_id: studyForB.id, type: "dental_appliance" })
      ).rejects.toThrow(ValidationError);
    });
  });

  it("creates a dental_appliance plan linked to the patient's own sleep study", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const patient = await createTestPatient(ctx);
      const study = await CreateSleepStudyCommand(ctx, { patient_id: patient.id });

      const plan = await CreateTreatmentPlanCommand(ctx, {
        patient_id: patient.id,
        sleep_study_id: study.id,
        type: "dental_appliance",
      });

      expect(plan.type).toBe("dental_appliance");
      expect(plan.status).toBe("initiated");
      expect(plan.patient_id).toBe(patient.id);
      expect(plan.sleep_study_id).toBe(study.id);
    });
  });
});
