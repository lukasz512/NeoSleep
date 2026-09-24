import { describe, it, expect, vi, beforeAll } from "vitest";
import bcrypt from "bcrypt";
import { withTenant, insertStaffUser, insertPatient, getGlobalTerritoryId, getCountryTerritoryId } from "../db.js";
import { getAuditLogForEntities } from "../db/audit-log.js";
import { withPlatform } from "../db/tenant.js";
import { insertDocumentContentVersion } from "../db/documentContent.js";
import type { TenantContext } from "../context/TenantContext.js";
import type { StaffRole } from "../db/users.js";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors.js";
import { RecordClinicalQuestionnaireCommand, CompleteStopBangCommand, GenerateClinicalRecordPdfCommand, type TenantRunner } from "./clinicalRecords.js";
import { ListClinicalRecordsQuery } from "../queries/clinicalRecords.js";

// Supabase Storage is the one external boundary mocked here. PDF rendering
// is REAL (headless Chromium, real templates) — NEO-36 shipped a renderer
// that had never once run because every spec mocked it.
const { uploadMock } = vi.hoisted(() => ({
  uploadMock: vi.fn(async (path: string, bytes: Uint8Array) => {
    uploads.push(bytes);
    return { path, bucket: "partner-documents" };
  }),
}));
const { deleteMock } = vi.hoisted(() => ({ deleteMock: vi.fn(async (_path: string) => undefined) }));
const uploads: Uint8Array[] = [];
vi.mock("../services/partnerDocuments.js", async (importActual) => ({
  ...(await importActual<typeof import("../services/partnerDocuments.js")>()),
  uploadPartnerDocument: uploadMock,
  deletePartnerDocument: deleteMock,
  getPartnerDocumentSignedUrl: vi.fn(async (path: string) => `https://storage.test/${path}?signed`),
}));

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

/** Tests run every phase inside the one test transaction — same ctx, so the phases see each other's writes. */
const inSameTransaction = (ctx: TenantContext): TenantRunner => (fn) => fn(ctx);

const ALL_STOP ={ snoring: true, tiredness: false, observed_apnea: true, pressure: false };
const ALL_BANG = { bmi_over_35: true, age_over_50: true, neck_circumference_over_40cm: false, is_male: true };

// historiaEndo needs a current consent-text version (fail-loud by design).
beforeAll(async () => {
  await withPlatform((client) =>
    insertDocumentContentVersion(client, {
      templateKey: "historiaEndo",
      locale: "mx",
      contentHtml: "<p>QA test consent body.</p>",
      createdByUserId: "00000000-0000-0000-0000-000000000000",
      createdByName: "QA",
      createdByEmail: "qa@neosleepcare.com",
      createdByTenantSlug: TENANT_SLUG,
      changeNote: "seeded by commands/clinicalRecords.spec.ts",
    })
  );
}, 15000);

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

describe("GenerateClinicalRecordPdfCommand (real rendering)", () => {
  it("renders a real Historia Endo PDF from a medical-history record, stores it and returns a signed URL", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildContext(client);
      const patient = await newPatient(client);
      const history = await RecordClinicalQuestionnaireCommand(ctx, patient.id, "medical_history", { has_diabetes: true });
      await RecordClinicalQuestionnaireCommand(ctx, patient.id, "oral_exam", { has_bruxism: true });

      const before = uploads.length;
      const pdf = await GenerateClinicalRecordPdfCommand(inSameTransaction(ctx), patient.id, "medical_history", history.id);

      expect(pdf.filename).toMatch(/^historia-endo-\d{4}-\d{2}-\d{2}\.pdf$/);
      expect(pdf.url).toContain("https://storage.test/patient/");
      const bytes = uploads[before]!;
      expect(Buffer.from(bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
    });
  }, 60000);

  it("renders a STOP-Bang PDF even while B-A-N-G is still pending", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildContext(client);
      const patient = await newPatient(client);
      const partial = await RecordClinicalQuestionnaireCommand(ctx, patient.id, "stop_bang", ALL_STOP);

      const pdf = await GenerateClinicalRecordPdfCommand(inSameTransaction(ctx), patient.id, "stop_bang", partial.id);
      expect(pdf.filename).toMatch(/^stop-bang-/);
    });
  }, 60000);

  it("404s for a record that belongs to a different patient", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildContext(client);
      const patient = await newPatient(client);
      const other = await newPatient(client);
      const exam = await RecordClinicalQuestionnaireCommand(ctx, other.id, "oral_exam", { has_bruxism: true });
      await expect(GenerateClinicalRecordPdfCommand(inSameTransaction(ctx), patient.id, "oral_exam", exam.id)).rejects.toThrow(NotFoundError);
    });
  });

  it("deletes the uploaded PDF again when its attachment row can't be written — no orphaned health data in the bucket", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildContext(client);
      const patient = await newPatient(client);
      const partial = await RecordClinicalQuestionnaireCommand(ctx, patient.id, "stop_bang", ALL_STOP);

      let phase = 0;
      const failingRecordPhase: TenantRunner = (fn) => (++phase === 2 ? Promise.reject(new Error("record phase failed")) : fn(ctx));
      deleteMock.mockClear();
      await expect(GenerateClinicalRecordPdfCommand(failingRecordPhase, patient.id, "stop_bang", partial.id)).rejects.toThrow("record phase failed");
      expect(deleteMock).toHaveBeenCalledTimes(1);
      expect(deleteMock.mock.calls[0]![0]).toMatch(new RegExp(`^patient/${patient.id}/stop_bang-`));
    });
  }, 60000);
});
