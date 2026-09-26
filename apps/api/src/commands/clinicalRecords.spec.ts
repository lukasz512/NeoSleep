import { describe, it, expect } from "vitest";
import bcrypt from "bcrypt";
import { withTenant, insertStaffUser, insertPatient, getGlobalTerritoryId, getCountryTerritoryId } from "../db.js";
import { getAuditLogForEntities } from "../db/audit-log.js";
import type { TenantContext } from "../context/TenantContext.js";
import type { StaffRole } from "../db/users.js";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors.js";
import { RecordClinicalQuestionnaireCommand, CompleteStopBangCommand } from "./clinicalRecords.js";
import { ListClinicalRecordsQuery } from "../queries/clinicalRecords.js";

const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";
type Client = TenantContext["client"];

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function buildContext(client: Client, role: StaffRole = "admin", territoryId?: string): Promise<TenantContext> {
  const email = `qa-clinical-records-${role}-${uniqueSuffix()}@neosleepcare.com`;
  const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
  const territory = territoryId ?? (await getGlobalTerritoryId(client));
  const user = await insertStaffUser(client, email, "QA", "Clinician", role, hash, false, null, null, territory);
  return { slug: TENANT_SLUG, client, user: { id: user!.id, email, role, roles: [{ role, territory_id: territory }] }, requestId: `test-${uniqueSuffix()}` };
}

const newPatient = (client: Client, territoryId?: string) =>
  insertPatient(client, { first_name: "Ana", last_name: `Clinical-${uniqueSuffix()}`, territory_id: territoryId ?? null });

const ALL_STOP = { snoring: true, tiredness: false, observed_apnea: true, pressure: false };
const ALL_BANG = { bmi_over_35: true, age_over_50: true, neck_circumference_over_40cm: false, is_male: true };

describe("RecordClinicalQuestionnaireCommand", () => {
  it("appends a new dated row per fill — history is kept, never overwritten", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildContext(client);
      const patient = await newPatient(client);

      const first = await RecordClinicalQuestionnaireCommand(ctx, patient.id, "medical_history", { has_diabetes: true });
      const second = await RecordClinicalQuestionnaireCommand(ctx, patient.id, "medical_history", { has_diabetes: false });

      expect(first.id).not.toBe(second.id);
      const { records } = await ListClinicalRecordsQuery(ctx, patient.id);
      const histories = records.filter((r) => r.kind === "medical_history");
      expect(histories).toHaveLength(2);
      expect(histories.map((r) => r.kind === "medical_history" && r.has_diabetes).sort()).toEqual([false, true]);
      expect(histories[0]).toMatchObject({ source: "staff", recorded_by: ctx.user.id, recorded_by_name: "QA Clinician" });

      const audit = await getAuditLogForEntities(client, ["MedicalHistoryQuestionnaire"], [first.id]);
      expect(audit[0]?.action).toBe("create");
    });
  }, 20000);

  it("rejects an empty questionnaire, a non-boolean answer and an invalid skeletal class", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildContext(client);
      const patient = await newPatient(client);
      await expect(RecordClinicalQuestionnaireCommand(ctx, patient.id, "medical_history", {})).rejects.toThrow(ValidationError);
      await expect(RecordClinicalQuestionnaireCommand(ctx, patient.id, "medical_history", { has_hiv: "yes" })).rejects.toThrow(ValidationError);
      await expect(RecordClinicalQuestionnaireCommand(ctx, patient.id, "oral_exam", { skeletal_class: "IV" })).rejects.toThrow(ValidationError);
    });
  });

  it("records an oral exam with skeletal class and tooth", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildContext(client);
      const patient = await newPatient(client);
      const exam = await RecordClinicalQuestionnaireCommand(ctx, patient.id, "oral_exam", { has_bruxism: true, skeletal_class: "II", tooth: " 36 " });
      expect(exam).toMatchObject({ has_bruxism: true, skeletal_class: "II", tooth: "36", has_xerostomia: null });
    });
  });

  it("STOP-Bang: score is computed by Postgres, and NULL until B-A-N-G is answered", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildContext(client);
      const patient = await newPatient(client);

      const full = await RecordClinicalQuestionnaireCommand(ctx, patient.id, "stop_bang", { ...ALL_STOP, ...ALL_BANG });
      expect("score" in full && full.score).toBe(5);

      const partial = await RecordClinicalQuestionnaireCommand(ctx, patient.id, "stop_bang", ALL_STOP);
      expect("score" in partial && partial.score).toBeNull();
    });
  });

  it("STOP-Bang: B-A-N-G is all-or-nothing", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildContext(client);
      const patient = await newPatient(client);
      await expect(
        RecordClinicalQuestionnaireCommand(ctx, patient.id, "stop_bang", { ...ALL_STOP, bmi_over_35: true })
      ).rejects.toThrow(ValidationError);
    });
  });

  it("enforces territory access — a PL rep can't read or write an MX patient's records", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const plId = await getCountryTerritoryId(client, "PL");
      const mxId = await getCountryTerritoryId(client, "MX");
      if (!plId || !mxId) throw new Error("PL/MX country territory not seeded");
      const plRep = await buildContext(client, "rep", plId);
      const mxPatient = await newPatient(client, mxId);

      await expect(ListClinicalRecordsQuery(plRep, mxPatient.id)).rejects.toThrow(ForbiddenError);
      await expect(RecordClinicalQuestionnaireCommand(plRep, mxPatient.id, "oral_exam", { has_bruxism: true })).rejects.toThrow(ForbiddenError);
    });
  });
});

describe("CompleteStopBangCommand", () => {
  it("fills in B-A-N-G once; a second completion is a conflict", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildContext(client);
      const patient = await newPatient(client);
      const partial = await RecordClinicalQuestionnaireCommand(ctx, patient.id, "stop_bang", ALL_STOP);

      const done = await CompleteStopBangCommand(ctx, patient.id, partial.id, ALL_BANG);
      expect(done.score).toBe(5);
      await expect(CompleteStopBangCommand(ctx, patient.id, partial.id, ALL_BANG)).rejects.toThrow(ConflictError);
    });
  });

  it("requires all four B-A-N-G answers and a screening belonging to that patient", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildContext(client);
      const patient = await newPatient(client);
      const other = await newPatient(client);
      const partial = await RecordClinicalQuestionnaireCommand(ctx, patient.id, "stop_bang", ALL_STOP);

      await expect(CompleteStopBangCommand(ctx, patient.id, partial.id, { bmi_over_35: true })).rejects.toThrow(ValidationError);
      await expect(CompleteStopBangCommand(ctx, other.id, partial.id, ALL_BANG)).rejects.toThrow(NotFoundError);
    });
  });
});

describe("STOP-Bang measurements (migration 034)", () => {
  it("computes BMI on the server and lets the measurements decide B and N", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildContext(client);
      const patient = await newPatient(client);
      const partial = await RecordClinicalQuestionnaireCommand(ctx, patient.id, "stop_bang", ALL_STOP);

      // The client claims "not over 35" / "not over 40" — the measurements say otherwise and win.
      const done = await CompleteStopBangCommand(ctx, patient.id, partial.id, {
        ...ALL_BANG,
        bmi_over_35: false,
        neck_circumference_over_40cm: false,
        height_cm: 162,
        weight_kg: "94,5",
        neck_cm: 42,
      });
      expect(done).toMatchObject({ height_cm: 162, weight_kg: 94.5, neck_cm: 42, bmi: 36, bmi_over_35: true, neck_circumference_over_40cm: true });
      expect(done.score).toBe(2 + 4); // S, O answered yes + B, A, N, G
    });
  });

  it("keeps plain yes/no when nothing was measured, and stores no measurements", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildContext(client);
      const patient = await newPatient(client);
      const record = await RecordClinicalQuestionnaireCommand(ctx, patient.id, "stop_bang", { ...ALL_STOP, ...ALL_BANG });
      expect(record).toMatchObject({ bmi_over_35: true, height_cm: null, weight_kg: null, neck_cm: null, bmi: null });
    });
  });

  it("rejects implausible values and a height without a weight", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildContext(client);
      const patient = await newPatient(client);
      const partial = await RecordClinicalQuestionnaireCommand(ctx, patient.id, "stop_bang", ALL_STOP);
      await expect(CompleteStopBangCommand(ctx, patient.id, partial.id, { ...ALL_BANG, height_cm: 1620, weight_kg: 94 })).rejects.toThrow(ValidationError);
      await expect(CompleteStopBangCommand(ctx, patient.id, partial.id, { ...ALL_BANG, height_cm: 162 })).rejects.toThrow(ValidationError);
      await expect(CompleteStopBangCommand(ctx, patient.id, partial.id, { ...ALL_BANG, neck_cm: "abc" })).rejects.toThrow(ValidationError);
    });
  });
});
