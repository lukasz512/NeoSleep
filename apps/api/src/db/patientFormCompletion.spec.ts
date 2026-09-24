import { describe, it, expect } from "vitest";
import { withTenant, insertPatient, softDeletePatient } from "../db.js";
import { upsertEndoIntake } from "./endoIntake.js";
import { insertStopBangScreening } from "./stopBangScreening.js";
import { getPatientFormCompletion } from "./patientFormCompletion.js";

const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "neosleep";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const ALL_NO = {
  snoring: false,
  tiredness: false,
  observed_apnea: false,
  pressure: false,
  bmi_over_35: false,
  age_over_50: false,
  neck_circumference_over_40cm: false,
  is_male: false,
};

const KEYS = ["informedConsent", "historiaEndo", "stopBang"];

describe("getPatientFormCompletion", () => {
  it("marks a form done only when that patient's own record exists", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const empty = await insertPatient(client, { first_name: "Forms", last_name: `None-${uniqueSuffix()}` });
      const endoOnly = await insertPatient(client, { first_name: "Forms", last_name: `Endo-${uniqueSuffix()}` });
      const both = await insertPatient(client, { first_name: "Forms", last_name: `Both-${uniqueSuffix()}` });

      await upsertEndoIntake(client, endoOnly.id, null, { has_diabetes: false });
      await upsertEndoIntake(client, both.id, null, { has_diabetes: false });
      await insertStopBangScreening(client, { patient_id: both.id, recorded_by: null, ...ALL_NO });

      const result = await getPatientFormCompletion(client, [empty.id, endoOnly.id, both.id], KEYS);

      expect([...(result.get(empty.id) ?? [])]).toEqual([]);
      expect([...(result.get(endoOnly.id) ?? [])]).toEqual(["historiaEndo"]);
      expect([...(result.get(both.id) ?? [])].sort()).toEqual(["historiaEndo", "stopBang"]);

      for (const p of [empty, endoOnly, both]) await softDeletePatient(client, p.id);
    });
  }, 15000);

  it("never marks informedConsent done — no per-patient record exists for it yet", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const patient = await insertPatient(client, { first_name: "Forms", last_name: `Consent-${uniqueSuffix()}` });
      const result = await getPatientFormCompletion(client, [patient.id], ["informedConsent"]);
      expect(result.get(patient.id)?.size).toBe(0);
      await softDeletePatient(client, patient.id);
    });
  }, 15000);

  it("only checks the requested templateKeys", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const patient = await insertPatient(client, { first_name: "Forms", last_name: `Scoped-${uniqueSuffix()}` });
      await upsertEndoIntake(client, patient.id, null, { has_diabetes: false });
      const result = await getPatientFormCompletion(client, [patient.id], ["stopBang"]);
      expect(result.get(patient.id)?.size).toBe(0);
      await softDeletePatient(client, patient.id);
    });
  }, 15000);

  it("returns an empty map for no patients without querying", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const result = await getPatientFormCompletion(client, [], KEYS);
      expect(result.size).toBe(0);
    });
  }, 15000);
});
