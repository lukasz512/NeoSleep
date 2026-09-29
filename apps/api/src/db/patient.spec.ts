import { describe, it, expect } from "vitest";
import { withTenant, insertPractitioner, updatePractitioner, insertPatient, updatePatient, insertLead, softDeletePractitioner, softDeletePatient } from "../db.js";

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

describe("shared emails: patients may share, users/doctors/leads may not (NEO-111)", () => {
  it("saves two patients with one email, and a patient with a doctor's email", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const family = `qa-family-${uniqueSuffix()}@example.com`;
      const doctorEmail = `qa-hcp-${uniqueSuffix()}@example.com`;
      const practitioner = await insertPractitioner(client, { first_name: "Taken", last_name: "Email", email: doctorEmail });

      const parent = await insertPatient(client, { first_name: "Parent", last_name: "Family", email: family });
      const child = await insertPatient(client, { first_name: "Child", last_name: "Family", email: family });
      const sameAsDoctor = await insertPatient(client, { first_name: "Doctor", last_name: "AsPatient", email: doctorEmail });
      expect(child.email).toBe(family);
      expect(sameAsDoctor.email).toBe(doctorEmail);

      const moved = await updatePatient(client, parent.id, { email: doctorEmail });
      expect(moved?.email).toBe(doctorEmail);

      for (const p of [parent, child, sameAsDoctor]) await softDeletePatient(client, p.id);
      await softDeletePractitioner(client, practitioner.id);
    });
  }, 15000);

  it("rejects a lead or a doctor taking a doctor's email with 409 EMAIL_IN_USE on the email field", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const taken = `qa-taken-${uniqueSuffix()}@example.com`;
      const first = await insertPractitioner(client, { first_name: "First", last_name: "Doctor", email: taken });
      const second = await insertPractitioner(client, { first_name: "Second", last_name: "Doctor", email: `qa-hcp-${uniqueSuffix()}@example.com` });

      const inUse = { code: "EMAIL_IN_USE", statusCode: 409, field: "email" };
      await expect(insertLead(client, { first_name: "New", last_name: "Lead", email: taken })).rejects.toMatchObject(inUse);
      await expect(updatePractitioner(client, second.id, { email: taken })).rejects.toMatchObject(inUse);

      await softDeletePractitioner(client, first.id);
      await softDeletePractitioner(client, second.id);
    });
  }, 15000);

  it("lets a doctor take an email only a patient has", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const email = `qa-patient-${uniqueSuffix()}@example.com`;
      const patient = await insertPatient(client, { first_name: "Only", last_name: "Patient", email });
      const practitioner = await insertPractitioner(client, { first_name: "Later", last_name: "Doctor", email: `qa-hcp-${uniqueSuffix()}@example.com` });

      const updated = await updatePractitioner(client, practitioner.id, { email });
      expect(updated?.email).toBe(email);
      // A separate identity — the doctor did not take over the patient's record.
      expect(updated?.identity_id).not.toBe(patient.identity_id);

      await softDeletePatient(client, patient.id);
      await softDeletePractitioner(client, practitioner.id);
    });
  }, 15000);

  it("the database itself still refuses two non-patient identities with one email", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const email = `qa-raw-${uniqueSuffix()}@example.com`;
      await client.query("SAVEPOINT raw_dup");
      await client.query("INSERT INTO identities (first_name, last_name, email) VALUES ('A', 'One', $1)", [email]);
      await expect(client.query("INSERT INTO identities (first_name, last_name, email) VALUES ('B', 'Two', $1)", [email]))
        .rejects.toMatchObject({ code: "23505" });
      await client.query("ROLLBACK TO SAVEPOINT raw_dup");
    });
  }, 15000);
});
