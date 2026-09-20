import { describe, it, expect } from "vitest";
import { withTenant, insertPatient, softDeletePatient } from "../db.js";
import { insertStopBangScreening, listStopBangScreeningsForPatient, getStopBangScreeningById } from "./stopBangScreening.js";

const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "neosleep";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const ALL_YES = {
  snoring: true,
  tiredness: true,
  observed_apnea: true,
  pressure: true,
  bmi_over_35: true,
  age_over_50: true,
  neck_circumference_over_40cm: true,
  is_male: true,
};
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

describe("insertStopBangScreening", () => {
  it("computes score as the count of true answers (Postgres GENERATED column, not app logic)", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const patient = await insertPatient(client, { first_name: "Score", last_name: `Test-${uniqueSuffix()}` });

      const allYes = await insertStopBangScreening(client, { patient_id: patient.id, recorded_by: null, ...ALL_YES });
      expect(allYes.score).toBe(8);

      const allNo = await insertStopBangScreening(client, { patient_id: patient.id, recorded_by: null, ...ALL_NO });
      expect(allNo.score).toBe(0);

      const mixed = await insertStopBangScreening(client, {
        patient_id: patient.id,
        recorded_by: null,
        ...ALL_NO,
        snoring: true,
        tiredness: true,
        is_male: true,
      });
      expect(mixed.score).toBe(3);

      await softDeletePatient(client, patient.id);
    });
  }, 15000);

  it("allows multiple screenings per patient, listed newest first — unlike endo_intake's one-row-per-patient shape", async () => {
    const patientId = await withTenant(TENANT_SLUG, async (client) => {
      const patient = await insertPatient(client, { first_name: "Recurring", last_name: `Screening-${uniqueSuffix()}` });
      return patient.id;
    });

    // Each insert in its own withTenant() call (its own transaction) — now()
    // is the transaction-start timestamp in Postgres, so two inserts inside
    // the SAME transaction would tie on created_at and make the DESC order
    // ambiguous. Separate transactions is also the more realistic shape:
    // real screenings come from separate HTTP requests, never the same one.
    const first = await withTenant(TENANT_SLUG, (client) =>
      insertStopBangScreening(client, { patient_id: patientId, recorded_by: null, ...ALL_NO })
    );
    await new Promise((r) => setTimeout(r, 10));
    const second = await withTenant(TENANT_SLUG, (client) =>
      insertStopBangScreening(client, { patient_id: patientId, recorded_by: null, ...ALL_YES })
    );

    await withTenant(TENANT_SLUG, async (client) => {
      const list = await listStopBangScreeningsForPatient(client, patientId);
      expect(list.map((s) => s.id)).toEqual([second.id, first.id]);
      await softDeletePatient(client, patientId);
    });
  }, 15000);
});

describe("getStopBangScreeningById", () => {
  it("returns null for a nonexistent id", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const result = await getStopBangScreeningById(client, "00000000-0000-0000-0000-000000000000");
      expect(result).toBeNull();
    });
  });
});
