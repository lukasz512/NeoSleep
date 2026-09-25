import { describe, it, expect, vi, beforeAll } from "vitest";
import bcrypt from "bcrypt";
import { withTenant, insertStaffUser, insertPatient, insertPractitioner, insertSleepStudy, getGlobalTerritoryId } from "../db.js";
import { withPlatform } from "../db/tenant.js";
import { insertDocumentContentVersion } from "../db/documentContent.js";
import type { TenantContext } from "../context/TenantContext.js";
import { ValidationError } from "../errors.js";
import { RecordClinicalQuestionnaireCommand } from "./clinicalRecords.js";
import { PrintChecklistItemCommand, UploadPatientStudyCommand, DeletePatientStudyUploadCommand } from "./patientChecklist.js";
import { GetPatientChecklistQuery } from "../queries/patientChecklist.js";

/**
 * Patient Estudios checklist (ADR-024) — real Postgres, real PDF rendering;
 * only the Supabase Storage boundary is mocked.
 */
const { uploadMock, deleteMock } = vi.hoisted(() => ({
  uploadMock: vi.fn(async (path: string) => ({ path, bucket: "partner-documents" })),
  deleteMock: vi.fn(async (_path: string) => undefined),
}));
vi.mock("../services/partnerDocuments.js", async (importActual) => ({
  ...(await importActual<typeof import("../services/partnerDocuments.js")>()),
  uploadPartnerDocument: uploadMock,
  deletePartnerDocument: deleteMock,
}));

// Still the real renderer — only wrapped, to read back which fields each print sent.
const { renderSpy } = vi.hoisted(() => ({ renderSpy: vi.fn() }));
vi.mock("../services/documentRenderer.js", async (importActual) => {
  const actual = await importActual<typeof import("../services/documentRenderer.js")>();
  return {
    ...actual,
    renderHtmlToPdf: async (...args: Parameters<typeof actual.renderHtmlToPdf>) => {
      renderSpy(...args);
      return actual.renderHtmlToPdf(...args);
    },
  };
});

const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";
type Client = TenantContext["client"];
const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function buildContext(client: Client): Promise<TenantContext> {
  const email = `qa-checklist-${uniqueSuffix()}@neosleepcare.com`;
  const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
  const territory = await getGlobalTerritoryId(client);
  const user = await insertStaffUser(client, email, "QA", "Doctor", "doctor", hash, false, null, null, territory);
  return { slug: TENANT_SLUG, client, user: { id: user!.id, email, role: "doctor", roles: [{ role: "doctor", territory_id: territory }] }, requestId: `test-${uniqueSuffix()}` };
}

const newPatient = (client: Client) => insertPatient(client, { first_name: "Ana", last_name: `Checklist-${uniqueSuffix()}` });
const isPdf = (bytes: Uint8Array) => Buffer.from(bytes.subarray(0, 5)).toString("latin1") === "%PDF-";

beforeAll(async () => {
  for (const templateKey of ["historiaEndo", "informedConsent"]) {
    await withPlatform((client) =>
      insertDocumentContentVersion(client, {
        templateKey,
        locale: "mx",
        contentHtml: "<p>QA consent body.</p>",
        createdByUserId: "00000000-0000-0000-0000-000000000000",
        createdByName: "QA",
        createdByEmail: "qa@neosleepcare.com",
        createdByTenantSlug: TENANT_SLUG,
        changeNote: "seeded by commands/patientChecklist.spec.ts",
      })
    );
  }
}, 15000);

describe("GetPatientChecklistQuery", () => {
  it("lists the configured documents in order (consent → patient → doctor) with polysomnography last, all missing for a new patient", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildContext(client);
      const patient = await newPatient(client);
      const checklist = await GetPatientChecklistQuery(ctx, patient.id);

      expect(checklist.items.map((i) => [i.key, i.group])).toEqual([
        ["informedConsent", "consent"],
        ["medicalHistory", "patient"],
        ["stopBang", "patient"],
        ["oralExam", "doctor"],
        ["historiaEndo", "doctor"],
        ["polysomnography", "results"],
      ]);
      expect(checklist.items.every((i) => i.status === "missing")).toBe(true);
      expect(checklist.summary).toEqual({ done: 0, total: 6 });
      expect(checklist.items.find((i) => i.key === "oralExam")!.actions).toMatchObject({ qr: false, fill: "questionnaire", print: true });
      expect(checklist.items.find((i) => i.key === "informedConsent")!.actions).toMatchObject({ qr: true, fill: null, print: true });
    });
  }, 20000);

  it("statuses follow the records: done, STOP-Bang partial until B-A-N-G, PSG partial until the study completes; history newest first", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildContext(client);
      const patient = await newPatient(client);
      await RecordClinicalQuestionnaireCommand(ctx, patient.id, "oral_exam", { has_bruxism: true });
      await RecordClinicalQuestionnaireCommand(ctx, patient.id, "oral_exam", { has_bruxism: false });
      await RecordClinicalQuestionnaireCommand(ctx, patient.id, "stop_bang", { snoring: true, tiredness: true, observed_apnea: false, pressure: false });
      await insertSleepStudy(client, { patient_id: patient.id, status: "device_shipped" } as Parameters<typeof insertSleepStudy>[1]);

      const checklist = await GetPatientChecklistQuery(ctx, patient.id);
      const byKey = Object.fromEntries(checklist.items.map((i) => [i.key, i]));
      expect(byKey.oralExam!.status).toBe("done");
      expect(byKey.oralExam!.history).toHaveLength(2);
      expect(byKey.stopBang!.status).toBe("partial");
      expect(byKey.polysomnography!.status).toBe("partial");
      expect(checklist.summary.done).toBe(1);
    });
  }, 20000);
});

describe("UploadPatientStudyCommand", () => {
  it("attaching a file completes its item (a PSG report, a signed paper consent); an unattached file is its own 'other' study", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildContext(client);
      const patient = await newPatient(client);
      await UploadPatientStudyCommand(ctx, patient.id, { bytes: PDF_BYTES, mimeType: "application/pdf", filename: "psg.pdf", title: "Polisomnografía laboratorio", notes: "IAH 18", checklistItem: "polysomnography" });
      await UploadPatientStudyCommand(ctx, patient.id, { bytes: PDF_BYTES, mimeType: "application/pdf", filename: "consentimiento.pdf", title: "Consentimiento firmado", notes: "", checklistItem: "historiaEndo" });
      const other = await UploadPatientStudyCommand(ctx, patient.id, { bytes: PDF_BYTES, mimeType: "image/png", filename: "rx.png", title: "Radiografía panorámica", notes: "Sin hallazgos", checklistItem: "" });

      const checklist = await GetPatientChecklistQuery(ctx, patient.id);
      const byKey = Object.fromEntries(checklist.items.map((i) => [i.key, i]));
      expect(byKey.polysomnography!.status).toBe("done");
      expect(byKey.historiaEndo!.status).toBe("done");
      expect(byKey.polysomnography!.history[0]).toMatchObject({ type: "upload", title: "Polisomnografía laboratorio", notes: "IAH 18" });
      expect(checklist.other_uploads.map((u) => u.id)).toEqual([other.id]);
    });
  }, 20000);

  it("rejects other file types, a missing title and an unknown item", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildContext(client);
      const patient = await newPatient(client);
      const base = { bytes: PDF_BYTES, mimeType: "application/pdf", filename: "x.pdf", title: "X", notes: "", checklistItem: "" };
      await expect(UploadPatientStudyCommand(ctx, patient.id, { ...base, mimeType: "text/html" })).rejects.toThrow(ValidationError);
      await expect(UploadPatientStudyCommand(ctx, patient.id, { ...base, title: "  " })).rejects.toThrow(ValidationError);
      await expect(UploadPatientStudyCommand(ctx, patient.id, { ...base, checklistItem: "nope" })).rejects.toThrow(ValidationError);
    });
  });

  it("deleting an upload removes the row and the stored file", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildContext(client);
      const patient = await newPatient(client);
      const upload = await UploadPatientStudyCommand(ctx, patient.id, { bytes: PDF_BYTES, mimeType: "application/pdf", filename: "psg.pdf", title: "PSG", notes: "", checklistItem: "polysomnography" });
      deleteMock.mockClear();
      await DeletePatientStudyUploadCommand(ctx, patient.id, upload.id);
      expect(deleteMock).toHaveBeenCalledTimes(1);
      expect((await GetPatientChecklistQuery(ctx, patient.id)).items.at(-1)!.status).toBe("missing");
    });
  });
});

describe("PrintChecklistItemCommand (real rendering)", () => {
  it("prints a blank medical-history form (tick boxes) and a filled one; nothing is stored", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildContext(client);
      const patient = await newPatient(client);
      const uploadsBefore = uploadMock.mock.calls.length;

      const blank = await PrintChecklistItemCommand(ctx, patient.id, "medicalHistory");
      expect(blank.kind === "pdf" && isPdf(blank.bytes)).toBe(true);

      await RecordClinicalQuestionnaireCommand(ctx, patient.id, "medical_history", { has_diabetes: true });
      const filled = await PrintChecklistItemCommand(ctx, patient.id, "medicalHistory");
      expect(filled.kind === "pdf" && filled.filename).toMatch(/^medicalHistory-\d{4}-\d{2}-\d{2}\.pdf$/);
      expect(uploadMock.mock.calls.length).toBe(uploadsBefore);
    });
  }, 60000);

  it("prints Historia Endo, the oral exam and the (unsigned) consent; polysomnography has nothing to print", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildContext(client);
      const patient = await newPatient(client);
      for (const key of ["historiaEndo", "oralExam", "informedConsent", "stopBang"]) {
        const result = await PrintChecklistItemCommand(ctx, patient.id, key);
        expect(result.kind === "pdf" && isPdf(result.bytes)).toBe(true);
      }
      await expect(PrintChecklistItemCommand(ctx, patient.id, "polysomnography")).rejects.toThrow(ValidationError);
    });
  }, 90000);

  const PATIENT_FORMS = ["medicalHistory", "oralExam", "historiaEndo", "informedConsent", "stopBang"];

  /** Prints every patient form and returns the header fields each one was filled with. */
  async function printHeaders(ctx: TenantContext, patientId: string) {
    const headers = [];
    for (const key of PATIENT_FORMS) {
      renderSpy.mockClear();
      await PrintChecklistItemCommand(ctx, patientId, key);
      const [html, options] = renderSpy.mock.calls[0] as [string, { dataFields: Record<string, string> }];
      for (const field of ["nombre_paciente", "fecha_nacimiento", "nombre_medico"]) expect(html, `${key} has ${field}`).toContain(`data-field="${field}"`);
      const { nombre_paciente, fecha_nacimiento, nombre_medico } = options.dataFields;
      headers.push({ key, nombre_paciente, fecha_nacimiento, nombre_medico });
    }
    return headers;
  }

  it("every patient form prints the patient (name + date of birth) and the patient's own doctor", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildContext(client);
      const doctor = await insertPractitioner(client, { first_name: "Elena", last_name: `Linked-${uniqueSuffix()}` });
      const patient = await insertPatient(client, { first_name: "Ana", last_name: "Headers", date_of_birth: "1980-03-07", practitioner_id: doctor.id });

      for (const header of await printHeaders(ctx, patient.id)) {
        expect(header.nombre_paciente, header.key).toContain("Ana Headers");
        expect(header.fecha_nacimiento, header.key).toBe("07/03/1980");
        expect(header.nombre_medico, header.key).toContain("Elena Linked-");
      }
    });
  }, 120000);

  it("a patient without a linked doctor prints the doctor who prints it; a non-doctor leaves the line blank", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildContext(client);
      await insertPractitioner(client, { first_name: "QA", last_name: "Doctor", email: ctx.user.email }); // same identity as the printing user (ADR-014)
      const patient = await newPatient(client);

      for (const header of await printHeaders(ctx, patient.id)) {
        expect(header.nombre_medico, header.key).toContain("QA Doctor");
        expect(header.fecha_nacimiento, header.key).toBe(""); // unknown → blank line to fill by hand
      }

      const staff = await buildContext(client); // a users row with no practitioner behind it
      renderSpy.mockClear();
      await PrintChecklistItemCommand(staff, patient.id, "oralExam");
      expect((renderSpy.mock.calls[0] as [string, { dataFields: Record<string, string> }])[1].dataFields.nombre_medico).toBe("");
    });
  }, 120000);
});
