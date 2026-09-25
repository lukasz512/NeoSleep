import { describe, it, expect } from "vitest";
import { withTenant, insertPractitioner, insertPatient, updatePatient, softDeletePractitioner, softDeletePatient } from "../db.js";

const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "neosleep";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

describe("getPatientById practitioner_name", () => {
  it("includes the practitioner's salutation, mirroring the patient's own display name rule", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const practitioner = await insertPractitioner(client, {
        first_name: "Lorena",
        last_name: "Pimentel",
        salutation: "Dr.",
        email: `qa-hcp-${uniqueSuffix()}@example.com`,
      });
      const patient = await insertPatient(client, {
        first_name: "Janneth",
        last_name: "Urdaneta",
        practitioner_id: practitioner.id,
      });

      expect(patient.practitioner_name).toBe("Dr. Lorena Pimentel");

      await softDeletePatient(client, patient.id);
      await softDeletePractitioner(client, practitioner.id);
    });
  }, 15000);

  it("omits the salutation when the practitioner has none set", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const practitioner = await insertPractitioner(client, {
        first_name: "Jan",
        last_name: "Kowalski",
        email: `qa-hcp-${uniqueSuffix()}@example.com`,
      });
      const patient = await insertPatient(client, {
        first_name: "Test",
        last_name: "Patient",
        practitioner_id: practitioner.id,
      });

      expect(patient.practitioner_name).toBe("Jan Kowalski");

      await softDeletePatient(client, patient.id);
      await softDeletePractitioner(client, practitioner.id);
    });
  }, 15000);

  it("is null when the patient has no assigned practitioner", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const patient = await insertPatient(client, {
        first_name: "Unassigned",
        last_name: "Patient",
      });

      expect(patient.practitioner_name).toBeNull();

      await softDeletePatient(client, patient.id);
    });
  }, 15000);
});

describe("patient demographics + doctor specialty (NEO-57)", () => {
  it("round-trips gender and date_of_birth, and returns the assigned doctor's specialty", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const practitioner = await insertPractitioner(client, {
        first_name: "Lorena",
        last_name: "Pimentel",
        primary_specialty: "dentist",
        email: `qa-hcp-${uniqueSuffix()}@example.com`,
      });
      const patient = await insertPatient(client, {
        first_name: "Janneth",
        last_name: "Urdaneta",
        gender: "female",
        date_of_birth: "1979-03-12",
        practitioner_id: practitioner.id,
      });

      expect(patient.gender).toBe("female");
      // DATE comes back as the same calendar day, never shifted by a time zone.
      expect(patient.date_of_birth).toBe("1979-03-12");
      expect(patient.practitioner_specialty).toBe("dentist");

      const cleared = await updatePatient(client, patient.id, { gender: null, date_of_birth: null });
      expect(cleared?.gender).toBeNull();
      expect(cleared?.date_of_birth).toBeNull();

      await softDeletePatient(client, patient.id);
      await softDeletePractitioner(client, practitioner.id);
    });
  }, 15000);
});
