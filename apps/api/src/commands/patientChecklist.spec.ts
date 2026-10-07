import { describe, it, expect, vi, beforeAll } from "vitest";
import bcrypt from "bcrypt";
import { withTenant, insertStaffUser, insertPatient, insertPractitioner, insertSleepStudy, getGlobalTerritoryId } from "../db.js";
import { ensureDocumentContent } from "../testing/documentContentFixture.js";
import type { TenantContext } from "../context/TenantContext.js";
import { ForbiddenError, ValidationError } from "../errors.js";
import { RecordClinicalQuestionnaireCommand } from "./clinicalRecords.js";
import { PrintChecklistItemCommand, UploadPatientStudyCommand, DeletePatientStudyUploadCommand } from "./patientChecklist.js";
import { GetPatientChecklistQuery } from "../queries/patientChecklist.js";
import { GetCurrentDocumentContentQuery } from "../queries/documentContent.js";
import { insertConsent } from "../db/consent.js";

/**
 * Patient Estudios checklist (ADR-024) — real Postgres, real PDF rendering;
 * only the Supabase Storage boundary is mocked.
 */
const ONE_PIXEL_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const { uploadMock, deleteMock, downloadMock } = vi.hoisted(() => ({
  uploadMock: vi.fn(async (path: string) => ({ path, bucket: "partner-documents" })),
  deleteMock: vi.fn(async (_path: string) => undefined),
  downloadMock: vi.fn(async (_path: string): Promise<Uint8Array> => {
    throw new Error("not stored");
  }),
}));
vi.mock("../services/partnerDocuments.js", async (importActual) => ({
  ...(await importActual<typeof import("../services/partnerDocuments.js")>()),
  uploadPartnerDocument: uploadMock,
  deletePartnerDocument: deleteMock,
  downloadPartnerDocument: downloadMock,
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

/** A global admin: these patients have no assigned doctor, and a doctor only reaches their own (CORE-104). */
async function buildContext(client: Client): Promise<TenantContext> {
  const email = `qa-checklist-${uniqueSuffix()}@neosleepcare.com`;
  const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
  const territory = await getGlobalTerritoryId(client);
  const user = await insertStaffUser(client, email, "QA", "Doctor", "admin", hash, false, null, null, territory);
  return { slug: TENANT_SLUG, client, user: { id: user!.id, email, role: "admin", roles: [{ role: "admin", territory_id: territory }] }, requestId: `test-${uniqueSuffix()}` };
}

/** A doctor login sharing its identity with a practitioner (ADR-014), plus one patient of theirs (CORE-104). */
async function doctorWithPatient(client: Client): Promise<{ ctx: TenantContext; patientId: string }> {
  const email = `qa-checklist-doc-${uniqueSuffix()}@neosleepcare.com`;
  const practitioner = await insertPractitioner(client, { first_name: "Lorena", last_name: `Firma-${uniqueSuffix()}`, email });
  const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
  const territory = await getGlobalTerritoryId(client);
  const user = await insertStaffUser(client, email, "Lorena", "Firma", "doctor", hash, false, null, null, territory);
  const patient = await insertPatient(client, { first_name: "Ana", last_name: `Signed-${uniqueSuffix()}`, practitioner_id: practitioner.id });
  const ctx: TenantContext = {
    slug: TENANT_SLUG,
    client,
    user: { id: user!.id, email, name: "Dra. Lorena Firma", role: "doctor", roles: [{ role: "doctor", territory_id: territory }] },
    requestId: `test-${uniqueSuffix()}`,
  };
  return { ctx, patientId: patient.id };
}

const newPatient = (client: Client) => insertPatient(client, { first_name: "Ana", last_name: `Checklist-${uniqueSuffix()}` });
const isPdf = (bytes: Uint8Array) => Buffer.from(bytes.subarray(0, 5)).toString("latin1") === "%PDF-";

// Real template keys in the shared platform schema — reuse the current text, seed only on an empty DB (NEO-184).
beforeAll(async () => {
  for (const templateKey of ["historiaEndo", "informedConsent"]) {
    await ensureDocumentContent(templateKey, "mx", { contentHtml: "<p>QA consent body.</p>", changeNote: "seeded by commands/patientChecklist.spec.ts" });
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
        ["tmjExam", "doctor"],
        ["historiaEndo", "doctor"],
        ["polysomnography", "results"],
      ]);
      expect(checklist.items.every((i) => i.status === "missing")).toBe(true);
      expect(checklist.summary).toEqual({ done: 0, total: 7 });
      expect(checklist.items.find((i) => i.key === "tmjExam")!.actions).toMatchObject({ qr: false, fill: "questionnaire", form: "tmj_exam", print: true });
      expect(checklist.items.find((i) => i.key === "oralExam")!.actions).toMatchObject({ qr: false, fill: "questionnaire", print: true });
      expect(checklist.items.find((i) => i.key === "informedConsent")!.actions).toMatchObject({ qr: true, fill: null, print: true });
    });
  }, 20000);

  // NEO-193 (Dra. Lorena + legal, NOM-004): consent and the Historia Clínica parts are Documentos; lab/device results are Estudios.
  it("puts every item in one tab: consent, questionnaires, exploration and Historia Clínica are documents, results are studies", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildContext(client);
      const patient = await newPatient(client);
      const checklist = await GetPatientChecklistQuery(ctx, patient.id);

      expect(Object.fromEntries(checklist.items.map((i) => [i.key, i.category]))).toEqual({
        informedConsent: "document",
        medicalHistory: "document",
        stopBang: "document",
        oralExam: "document",
        tmjExam: "document",
        historiaEndo: "document",
        polysomnography: "study",
      });
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
      for (const key of ["historiaEndo", "oralExam", "tmjExam", "informedConsent", "stopBang"]) {
        const result = await PrintChecklistItemCommand(ctx, patient.id, key);
        expect(result.kind === "pdf" && isPdf(result.bytes)).toBe(true);
      }
      await expect(PrintChecklistItemCommand(ctx, patient.id, "polysomnography")).rejects.toThrow(ValidationError);
    });
  }, 90000);

  it("the Historia clínica prints the patient's phone + email and the current informed consent as its last page, for any patient (NEO-249)", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildContext(client);
      const patient = await insertPatient(client, { first_name: "Ana", last_name: `Contact-${uniqueSuffix()}`, phone: "+52 55 1234 5678", email: `ana-${uniqueSuffix()}@example.mx` });
      const consent = (await GetCurrentDocumentContentQuery("informedConsent", "mx")).content_html;

      renderSpy.mockClear();
      await PrintChecklistItemCommand(ctx, patient.id, "historiaEndo");
      const [html, options] = renderSpy.mock.calls[0] as [string, { dataFields: Record<string, string> }];
      expect(options.dataFields.telefono).toBe("+52 55 1234 5678");
      expect(options.dataFields.email).toMatch(/^ana-.*@example\.mx$/);
      expect(html.slice(html.indexOf('<div class="hc-p3" data-state-field="consent_page">'))).toContain(consent);
      expect(options.dataFields.consent_stamp).toBe(""); // not signed yet → the empty line to sign on paper

      // NEO-249 D2: signed electronically → a dated stamp instead of the line.
      await insertConsent(client, { entity_type: "patient", entity_id: patient.id, legal_basis: "consent", jurisdiction: "MX", purpose: "informedConsent" });
      renderSpy.mockClear();
      await PrintChecklistItemCommand(ctx, patient.id, "historiaEndo");
      const [, signed] = renderSpy.mock.calls[0] as [string, { dataFields: Record<string, string>; dataImages: Record<string, string> }];
      expect(signed.dataFields.consent_stamp).toMatch(/^Firmado electrónicamente por el paciente · \d{2}\/\d{2}\/\d{4}$/);
      expect(signed.dataImages).toEqual({}); // signed before NEO-252: no stored signature, the stamp alone

      // NEO-252: the drawn signature stored with the consent prints above the stamp; storage failing never fails the print.
      await client.query(`UPDATE consent SET withdrawn_at = now() WHERE entity_id = $1`, [patient.id]);
      await insertConsent(client, {
        entity_type: "patient", entity_id: patient.id, legal_basis: "consent", jurisdiction: "MX", purpose: "informedConsent",
        metadata: { signature_path: `patient/${patient.id}/consent-informedConsent-1-signature.png` },
      });
      downloadMock.mockResolvedValueOnce(new Uint8Array(Buffer.from(ONE_PIXEL_PNG, "base64")));
      renderSpy.mockClear();
      await PrintChecklistItemCommand(ctx, patient.id, "historiaEndo");
      const [, drawn] = renderSpy.mock.calls[0] as [string, { dataFields: Record<string, string>; dataImages: Record<string, string> }];
      expect(downloadMock).toHaveBeenLastCalledWith(`patient/${patient.id}/consent-informedConsent-1-signature.png`);
      expect(drawn.dataImages).toEqual({ firma_paciente: `data:image/png;base64,${ONE_PIXEL_PNG}` });
      expect(drawn.dataFields.consent_stamp).not.toBe("");

      renderSpy.mockClear();
      await PrintChecklistItemCommand(ctx, patient.id, "historiaEndo"); // download rejects (the default mock)
      expect((renderSpy.mock.calls[0] as [string, { dataImages: Record<string, string> }])[1].dataImages).toEqual({});
    });
  }, 60000);

  it("the consent page prints only when picked; a consent already signed prints marked as a copy (NEO-260)", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildContext(client);
      const patient = await insertPatient(client, { first_name: "Ana", last_name: `Pick-${uniqueSuffix()}` });
      type Call = [string, { stateFields: Record<string, string> }];
      const consentState = async (include?: { consent?: boolean }) => {
        renderSpy.mockClear();
        await PrintChecklistItemCommand(ctx, patient.id, "historiaEndo", include ? { include } : {});
        const [html, options] = renderSpy.mock.calls[0] as Call;
        expect(html).toContain('<div class="hc-p3" data-state-field="consent_page">');
        return options.stateFields.consent_page;
      };

      expect(await consentState()).toBeUndefined(); // one copy of the consent: not in the HC unless asked
      expect(await consentState({ consent: false })).toBeUndefined();
      expect(await consentState({ consent: true })).toBe("on"); // unsigned → the page to sign on paper

      await insertConsent(client, { entity_type: "patient", entity_id: patient.id, legal_basis: "consent", jurisdiction: "MX", purpose: "informedConsent" });
      expect(await consentState({ consent: true })).toBe("copy"); // signed → the original stays in storage, this is a COPIA
      expect(await consentState()).toBeUndefined();

      const { rows } = await client.query<{ entity_after: { include?: { consent: boolean } } }>(
        `SELECT entity_after FROM audit_log WHERE entity_type = 'ChecklistItemPrint' AND entity_id = $1 ORDER BY created_at`,
        [patient.id]
      );
      expect(rows.map((r) => r.entity_after.include?.consent)).toEqual([false, false, true, true, false]);
    });
  }, 60000);

  it("the patient signs the consent page, the doctor the Historia's page 2; a doctor's drawn signature signs that panel (NEO-255)", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const { ctx, patientId } = await doctorWithPatient(client);
      const signature = `data:image/png;base64,${ONE_PIXEL_PNG}`;

      // Unsigned: the doctor panel keeps the patient's doctor and the blank line to sign on paper.
      renderSpy.mockClear();
      await PrintChecklistItemCommand(ctx, patientId, "historiaEndo");
      const [html, unsigned] = renderSpy.mock.calls[0] as [string, { dataFields: Record<string, string>; dataImages: Record<string, string> }];
      const consentPage = html.slice(html.indexOf('<div class="hc-p3" data-state-field="consent_page">'));
      expect(consentPage).toContain('data-field="firma_paciente"');
      expect(consentPage).not.toContain('data-field="firma_doctor"'); // the consent is the patient's alone
      expect(html.match(/data-field="firma_doctor"/g)).toHaveLength(1); // page 2
      expect(unsigned.dataFields.doctor_stamp).toBe("");
      expect(unsigned.dataFields.nombre_medico_firma).toMatch(/Lorena Firma-/);
      expect(unsigned.dataImages.firma_doctor).toBeUndefined();

      // Signed in the print dialog: the image, the signer's name and a dated stamp; the signing is audit-logged.
      renderSpy.mockClear();
      await PrintChecklistItemCommand(ctx, patientId, "historiaEndo", { doctorSignature: signature });
      const [, signed] = renderSpy.mock.calls[0] as [string, { dataFields: Record<string, string>; dataImages: Record<string, string> }];
      expect(signed.dataImages.firma_doctor).toBe(signature);
      expect(signed.dataFields.nombre_medico_firma).toBe("Dra. Lorena Firma");
      expect(signed.dataFields.doctor_stamp).toMatch(/^Firmado electrónicamente por Dra\. Lorena Firma · \d{2}\/\d{2}\/\d{4}$/);
      const { rows } = await client.query<{ entity_after: Record<string, unknown> }>(
        `SELECT entity_after FROM audit_log WHERE entity_type = 'ChecklistItemPrint' AND entity_id = $1 AND user_id = $2`,
        [patientId, ctx.user.id]
      );
      expect(rows.map((r) => r.entity_after.doctor_signed ?? false).sort()).toEqual([false, true]); // the unsigned print, then the signed one
    });
  }, 60000);

  it("only a doctor signs, only the Historia clínica, only with a drawn PNG (NEO-255)", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const signature = `data:image/png;base64,${ONE_PIXEL_PNG}`;
      const admin = await buildContext(client);
      const patient = await newPatient(client);
      await expect(PrintChecklistItemCommand(admin, patient.id, "historiaEndo", { doctorSignature: signature })).rejects.toThrow(ForbiddenError);

      const { ctx, patientId } = await doctorWithPatient(client);
      await expect(PrintChecklistItemCommand(ctx, patientId, "medicalHistory", { doctorSignature: signature })).rejects.toThrow(ValidationError);
      await expect(PrintChecklistItemCommand(ctx, patientId, "historiaEndo", { doctorSignature: "data:image/svg+xml;base64,PHN2Zz4=" })).rejects.toThrow(ValidationError);
    });
  }, 60000);

  const PATIENT_FORMS = ["medicalHistory", "oralExam", "tmjExam", "historiaEndo", "informedConsent", "stopBang"];

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

  it("a patient without a linked doctor prints the practitioner who prints it; someone with no practitioner leaves the line blank", async () => {
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

// NEO-231 (docs/stories/lorena-clinical-forms-r1.md): the ATM evaluation is its own item, and the Historia clínica prints every section.
describe("ATM evaluation + Historia clínica print (NEO-231)", () => {
  const lastRender = () => renderSpy.mock.calls.at(-1) as [string, { dataFields: Record<string, string>; choiceFields: Record<string, unknown> }];

  it("an ATM record completes the tmjExam item and prints per side with the opening", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildContext(client);
      const patient = await newPatient(client);
      await RecordClinicalQuestionnaireCommand(ctx, patient.id, "tmj_exam", { pain_palpation_right: true, muscle_pain_left: true, max_opening_mm: 38 });

      const item = (await GetPatientChecklistQuery(ctx, patient.id)).items.find((i) => i.key === "tmjExam")!;
      expect(item.status).toBe("done");
      expect(item.history[0]!.record).toMatchObject({ kind: "tmj_exam", pain_palpation_right: true, max_opening_mm: 38 });

      renderSpy.mockClear();
      await PrintChecklistItemCommand(ctx, patient.id, "tmjExam");
      const [html, options] = lastRender();
      expect(html).toContain('data-field="tmj_pain_palpation_right"');
      expect(options.choiceFields.tmj_pain_palpation_right).toEqual({ options: ["Derecho"], selected: "Derecho" });
      expect(options.choiceFields.tmj_pain_palpation_left).toEqual({ options: ["Izquierdo"], selected: null });
      expect(options.choiceFields.tmj_muscle_pain_left).toEqual({ options: ["Izquierdo"], selected: "Izquierdo" });
      expect(options.dataFields.tmj_max_opening).toBe("38 mm");
    });
  }, 60000);

  it("the Historia clínica PDF prints the ATM table and the STOP-Bang score next to the history and the exam", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildContext(client);
      const patient = await newPatient(client);
      await RecordClinicalQuestionnaireCommand(ctx, patient.id, "tmj_exam", { joint_sounds_left: true, max_opening_mm: 45 });
      await RecordClinicalQuestionnaireCommand(ctx, patient.id, "stop_bang", {
        snoring: true, tiredness: true, observed_apnea: true, pressure: false,
        bmi_over_35: false, age_over_50: true, neck_circumference_over_40cm: false, is_male: false,
      });

      renderSpy.mockClear();
      await PrintChecklistItemCommand(ctx, patient.id, "historiaEndo");
      const [html, options] = lastRender();
      for (const field of ["q_has_bruxism", "q_has_diabetes", "tmj_joint_sounds_left", "tmj_max_opening", "score"]) expect(html).toContain(`data-field="${field}"`);
      expect(html).not.toContain('data-field="q_has_tmj_finding"');
      expect(options.choiceFields.tmj_joint_sounds_left).toEqual({ options: ["Izquierdo"], selected: "Izquierdo" });
      expect(options.dataFields.tmj_max_opening).toBe("45 mm");
      expect(options.dataFields.score).toBe("4");
    });
  }, 60000);
});
