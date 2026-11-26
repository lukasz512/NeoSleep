import { describe, it, expect, vi } from "vitest";
import bcrypt from "bcrypt";
import { withTenant, insertStaffUser, getGlobalTerritoryId } from "../db.js";
import type { TenantContext } from "../context/TenantContext.js";
import { CreatePatientCommand } from "../commands/patient.js";
import { CreateSleepStudyCommand } from "../commands/sleepStudy.js";
import { CreateTreatmentPlanCommand } from "../commands/treatmentPlan.js";
import { CreateNoteCommand, DeleteNoteCommand } from "../commands/note.js";
import { ForbiddenError } from "../errors.js";
import { GetRecentDeviceOrderCommentsQuery } from "./note.js";

/**
 * NEO-217: the admin's Panel shows the latest comments on device orders
 * across all patients. Real Postgres ("test" tenant schema), per CLAUDE.md.
 */
vi.setConfig({ testTimeout: 30_000 });

const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";
const suffix = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function ctxFor(client: TenantContext["client"], role: "admin" | "rep"): Promise<TenantContext> {
  const email = `qa-order-comments-${suffix()}@neosleepcare.com`;
  const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
  const user = await insertStaffUser(client, email, "QA", "Comments", role, hash, false);
  return {
    slug: TENANT_SLUG,
    client,
    user: { id: user!.id, email, role, roles: [{ role, territory_id: await getGlobalTerritoryId(client) }] },
    requestId: `test-${suffix()}`,
  };
}

describe("GetRecentDeviceOrderCommentsQuery (NEO-217)", () => {
  it("lists device-order comments newest first, with the patient and order, and nothing else", async () => {
    const lastName = `Orders-${suffix()}`;
    const { plan, patient, first, second, deleted } = await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await ctxFor(client, "admin");
      const patient = await CreatePatientCommand(ctx, {
        gender: "female", date_of_birth: "1980-01-01", first_name: "Ana", last_name: lastName,
        email: `qa-patient-${suffix()}@example.com`, phone: "600100200",
      });
      const study = await CreateSleepStudyCommand(ctx, { patient_id: patient.id });
      const plan = await CreateTreatmentPlanCommand(ctx, { patient_id: patient.id, sleep_study_id: study.id, type: "dental_appliance" });
      const first = await CreateNoteCommand(ctx, { entity_type: "treatment_plan", entity_id: plan.id, body: "Primero" });
      await client.query("UPDATE note SET created_at = now() - interval '1 minute' WHERE id = $1", [first.id]);
      const second = await CreateNoteCommand(ctx, { entity_type: "treatment_plan", entity_id: plan.id, body: "Segundo" });
      const deleted = await CreateNoteCommand(ctx, { entity_type: "treatment_plan", entity_id: plan.id, body: "Borrado" });
      await DeleteNoteCommand(ctx, deleted.id);
      // A patient note is not an order comment.
      await CreateNoteCommand(ctx, { entity_type: "patient", entity_id: patient.id, body: "Nota del paciente" });
      return { plan, patient, first, second, deleted };
    });

    const items = await withTenant(TENANT_SLUG, async (client) => GetRecentDeviceOrderCommentsQuery(await ctxFor(client, "admin"), { limit: 50 }));
    const mine = items.filter((i) => i.treatment_plan_id === plan.id);

    expect(mine.map((i) => i.id)).toEqual([second.id, first.id]);
    expect(mine.some((i) => i.id === deleted.id)).toBe(false);
    expect(items.some((i) => i.body === "Nota del paciente" && i.patient_id === patient.id)).toBe(false);
    expect(mine[0]).toMatchObject({ patient_id: patient.id, body: "Segundo", order_number: null, author_name: "QA Comments" });
    expect(mine[0]!.patient_name).toContain(lastName);
  });

  it("caps the list at the requested limit", async () => {
    const items = await withTenant(TENANT_SLUG, async (client) => GetRecentDeviceOrderCommentsQuery(await ctxFor(client, "admin"), { limit: 1 }));
    expect(items.length).toBeLessThanOrEqual(1);
  });

  it("is admin-only", async () => {
    await expect(
      withTenant(TENANT_SLUG, async (client) => GetRecentDeviceOrderCommentsQuery(await ctxFor(client, "rep"), { limit: 10 }))
    ).rejects.toThrow(ForbiddenError);
  });
});
