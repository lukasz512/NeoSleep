import { describe, it, expect } from "vitest";
import { withTenant, insertPractitioner, insertPatient, insertOrganization, softDeletePractitioner, softDeletePatient } from "../db.js";
import { getEndoIntakeByPatientId, upsertEndoIntake, getPatientPdfContext } from "./endoIntake.js";

const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "neosleep";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

describe("getEndoIntakeByPatientId / upsertEndoIntake", () => {
  it("returns null for a patient with no intake yet", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const patient = await insertPatient(client, { first_name: "No", last_name: `Intake-${uniqueSuffix()}` });
      const result = await getEndoIntakeByPatientId(client, patient.id);
      expect(result).toBeNull();
      await softDeletePatient(client, patient.id);
    });
  }, 15000);

  it("upserts, and a second save fully replaces the given fields on the same row (one row per patient)", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const patient = await insertPatient(client, { first_name: "Endo", last_name: `Intake-${uniqueSuffix()}` });

      const first = await upsertEndoIntake(client, patient.id, null, { has_diabetes: true, has_anemia: false });
      expect(first.has_diabetes).toBe(true);
      expect(first.has_anemia).toBe(false);

      const second = await upsertEndoIntake(client, patient.id, null, { has_diabetes: false, medical_history_other: "Asthma" });
      expect(second.id).toBe(first.id); // same row, not a new one
      expect(second.has_diabetes).toBe(false);
      expect(second.has_anemia).toBe(false); // untouched by the second call, still whatever it was
      expect(second.medical_history_other).toBe("Asthma");

      const reloaded = await getEndoIntakeByPatientId(client, patient.id);
      expect(reloaded?.id).toBe(first.id);

      await softDeletePatient(client, patient.id);
    });
  }, 15000);

  it("stores skeletal_class as one of I/II/III", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const patient = await insertPatient(client, { first_name: "Skeletal", last_name: `Class-${uniqueSuffix()}` });
      const intake = await upsertEndoIntake(client, patient.id, null, { skeletal_class: "II" });
      expect(intake.skeletal_class).toBe("II");
      await softDeletePatient(client, patient.id);
    });
  }, 15000);
});

describe("getPatientPdfContext", () => {
  it("returns null for a nonexistent patient", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const result = await getPatientPdfContext(client, "00000000-0000-0000-0000-000000000000");
      expect(result).toBeNull();
    });
  });

  it("resolves patient name only when there's no linked practitioner", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const patient = await insertPatient(client, { first_name: "Solo", last_name: `Patient-${uniqueSuffix()}` });
      const context = await getPatientPdfContext(client, patient.id);
      expect(context?.patient_name).toContain("Solo Patient");
      expect(context?.practitioner_name).toBeNull();
      expect(context?.organization_name).toBeNull();
      await softDeletePatient(client, patient.id);
    });
  }, 15000);

  it("resolves patient, doctor, and clinic names via the full join chain", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const organization = await insertOrganization(client, {
        name: `Clínica QA ${uniqueSuffix()}`,
        phone: "600100200",
        email: `qa-org-${uniqueSuffix()}@example.com`,
      });
      const practitioner = await insertPractitioner(client, {
        first_name: "Lorena",
        last_name: "González",
        salutation: "Dra.",
        email: `qa-hcp-${uniqueSuffix()}@example.com`,
        organization_id: organization.id,
      });
      const patient = await insertPatient(client, {
        first_name: "Ana",
        last_name: `PdfContext-${uniqueSuffix()}`,
        practitioner_id: practitioner.id,
      });

      const context = await getPatientPdfContext(client, patient.id);
      expect(context?.patient_name).toContain("Ana");
      expect(context?.practitioner_name).toBe("Dra. Lorena González");
      expect(context?.organization_name).toBe(organization.name);

      await softDeletePatient(client, patient.id);
      await softDeletePractitioner(client, practitioner.id);
    });
  }, 15000);
});
