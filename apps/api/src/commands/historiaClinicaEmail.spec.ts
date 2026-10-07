import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import bcrypt from "bcrypt";
import { withTenant, insertStaffUser, insertPatient, insertPractitioner, getGlobalTerritoryId } from "../db.js";
import { ensureDocumentContent } from "../testing/documentContentFixture.js";
import type { TenantContext } from "../context/TenantContext.js";
import { ForbiddenError, ValidationError } from "../errors.js";
import { RecordClinicalQuestionnaireCommand } from "./clinicalRecords.js";
import { PatientHasNoEmailError } from "./questionnaireRequest.js";
import { SendHistoriaClinicaEmailCommand, DownloadPublicDocumentCommand, DocumentLinkInvalidError } from "./historiaClinicaEmail.js";

/**
 * NEO-258: the signed Historia clínica, emailed as a 7-day link — real Postgres
 * and real PDF rendering; only Resend (mailer.ts) and Supabase Storage are mocked.
 */
const ONE_PIXEL_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const SIGNATURE = `data:image/png;base64,${ONE_PIXEL_PNG}`;

const { sendMock, stored, uploadMock, deleteMock } = vi.hoisted(() => {
  const stored = new Map<string, Uint8Array>();
  return {
    stored,
    sendMock: vi.fn(async (..._args: unknown[]): Promise<string | null> => "re_test"),
    uploadMock: vi.fn(async (path: string, bytes: Uint8Array) => {
      stored.set(path, bytes);
      return { path, bucket: "partner-documents" };
    }),
    deleteMock: vi.fn(async (path: string) => {
      stored.delete(path);
    }),
  };
});
vi.mock("../mailer.js", async (importActual) => ({
  ...(await importActual<typeof import("../mailer.js")>()),
  sendDocumentLinkEmail: sendMock,
}));
vi.mock("../services/partnerDocuments.js", async (importActual) => ({
  ...(await importActual<typeof import("../services/partnerDocuments.js")>()),
  uploadPartnerDocument: uploadMock,
  deletePartnerDocument: deleteMock,
  downloadPartnerDocument: async (path: string) => {
    const bytes = stored.get(path);
    if (!bytes) throw new Error("not stored");
    return bytes;
  },
}));

const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";
const ORIGIN = "https://pwa-dev.example.test";
type Client = TenantContext["client"];

const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const isPdf = (bytes: Uint8Array) => Buffer.from(bytes.subarray(0, 5)).toString("latin1") === "%PDF-";

async function staff(client: Client, role: "doctor" | "admin", practitionerEmail?: string): Promise<TenantContext> {
  const email = practitionerEmail ?? `qa-hc-email-${role}-${unique()}@neosleepcare.com`;
  const territory = await getGlobalTerritoryId(client);
  const user = await insertStaffUser(client, email, "Lorena", "Envía", role, await bcrypt.hash("x", 4), false, null, null, territory);
  return {
    slug: TENANT_SLUG,
    client,
    user: { id: user!.id, email, name: "Dra. Lorena Envía", role, roles: [{ role, territory_id: territory }] },
    requestId: `test-${unique()}`,
  };
}

/** A doctor (identity shared with a practitioner, CORE-104) and one patient of theirs. */
async function doctorWithPatient(client: Client, patientEmail: string | null = `paciente.${unique()}@example.mx`) {
  const email = `qa-hc-email-doc-${unique()}@neosleepcare.com`;
  const practitioner = await insertPractitioner(client, { first_name: "Lorena", last_name: `Envía-${unique()}`, email });
  const ctx = await staff(client, "doctor", email);
  const patient = await insertPatient(client, {
    first_name: "Lucía",
    last_name: `Historia-${unique()}`,
    region: "MX",
    practitioner_id: practitioner.id,
    ...(patientEmail ? { email: patientEmail } : {}),
  });
  return { ctx, patientId: patient.id, patientEmail };
}

async function completeHistoria(ctx: TenantContext, patientId: string): Promise<void> {
  await RecordClinicalQuestionnaireCommand(ctx, patientId, "medical_history", { has_diabetes: false });
  await RecordClinicalQuestionnaireCommand(ctx, patientId, "stop_bang", {
    snoring: true, tiredness: false, observed_apnea: true, pressure: false,
    bmi_over_35: false, age_over_50: true, neck_circumference_over_40cm: false, is_male: false,
  });
  await RecordClinicalQuestionnaireCommand(ctx, patientId, "oral_exam", { has_bruxism: false, skeletal_class: "I" });
  await RecordClinicalQuestionnaireCommand(ctx, patientId, "tmj_exam", { max_opening_mm: 45 });
}

beforeAll(async () => {
  for (const templateKey of ["historiaEndo", "informedConsent"]) {
    await ensureDocumentContent(templateKey, "mx", { contentHtml: "<p>QA consent body.</p>", changeNote: "seeded by commands/historiaClinicaEmail.spec.ts" });
  }
}, 15000);

beforeEach(() => {
  sendMock.mockReset();
  sendMock.mockResolvedValue(`re_${unique()}`);
  uploadMock.mockClear();
  deleteMock.mockClear();
});

describe("SendHistoriaClinicaEmailCommand", () => {
  it("emails the patient's own address a 7-day link to the signed PDF, logs the send and audits it without the address", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const { ctx, patientId, patientEmail } = await doctorWithPatient(client);
      await completeHistoria(ctx, patientId);

      const before = Date.now();
      const { link, sent_to } = await SendHistoriaClinicaEmailCommand(ctx, patientId, ORIGIN, { doctorSignature: SIGNATURE });

      expect(sent_to).toMatch(/^p\*\*\*@example\.mx$/);
      const days = (link.expires_at.getTime() - before) / 86_400_000;
      expect(days).toBeGreaterThan(6.99);
      expect(days).toBeLessThan(7.01);

      expect(sendMock).toHaveBeenCalledTimes(1);
      const [to, url, recipient, , validDays, tags] = sendMock.mock.calls[0]!;
      expect(to).toBe(patientEmail);
      expect(url).toMatch(new RegExp(`^${ORIGIN}/d#[A-Za-z0-9_-]{43}$`));
      expect(recipient).toMatchObject({ firstName: "Lucía", language: "mx" });
      expect(validDays).toBe(7);
      expect(tags).toEqual({ tenant: TENANT_SLUG, kind: "document_link" });

      // The stored copy is the signed PDF, and the link serves exactly it.
      const [path, bytes] = uploadMock.mock.calls[0]!;
      expect(path).toMatch(new RegExp(`^patient/${patientId}/historia-clinica-\\d+\\.pdf$`));
      expect(isPdf(bytes)).toBe(true);
      const download = await DownloadPublicDocumentCommand(client, String(url).split("#")[1]);
      expect(download.bytes).toBe(bytes);
      expect(download.filename).toMatch(/^historiaEndo-\d{4}-\d{2}-\d{2}\.pdf$/);

      const { rows: sends } = await client.query("SELECT kind, sent_to_masked, sent_by FROM patient_email_send WHERE patient_id = $1", [patientId]);
      expect(sends).toEqual([{ kind: "document_link", sent_to_masked: sent_to, sent_by: ctx.user.id }]);

      const { rows: audit } = await client.query<{ action: string; entity_after: Record<string, unknown>; metadata: Record<string, unknown> | null }>(
        "SELECT action, entity_after, metadata FROM audit_log WHERE entity_type = 'DocumentLink' AND entity_id = $1 ORDER BY created_at",
        [link.id]
      );
      expect(audit.map((r) => r.action)).toEqual(["notify", "read"]);
      expect(audit[0]!.entity_after).toMatchObject({ patient_id: patientId, document: "historiaEndo", channel: "email", sent_to });
      expect(JSON.stringify(audit)).not.toContain(patientEmail);
      expect(audit[1]!.metadata).toMatchObject({ actor: "patient" });

      const { rows: opened } = await client.query("SELECT open_count, opened_at IS NOT NULL AS opened FROM document_link WHERE id = $1", [link.id]);
      expect(opened).toEqual([{ open_count: 1, opened: true }]);
    });
  }, 60000);

  it("only a doctor sends it, and only signed (D3)", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const { ctx, patientId } = await doctorWithPatient(client);
      await completeHistoria(ctx, patientId);
      const admin = await staff(client, "admin");

      await expect(SendHistoriaClinicaEmailCommand(admin, patientId, ORIGIN, { doctorSignature: SIGNATURE })).rejects.toThrow(ForbiddenError);
      await expect(SendHistoriaClinicaEmailCommand(ctx, patientId, ORIGIN, {})).rejects.toThrow(ValidationError);
      expect(sendMock).not.toHaveBeenCalled();
    });
  }, 60000);

  it("refuses until every Historia clínica section is done (D2)", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const { ctx, patientId } = await doctorWithPatient(client);
      await RecordClinicalQuestionnaireCommand(ctx, patientId, "medical_history", { has_diabetes: false });

      await expect(SendHistoriaClinicaEmailCommand(ctx, patientId, ORIGIN, { doctorSignature: SIGNATURE })).rejects.toThrow(/not complete/);
      expect(uploadMock).not.toHaveBeenCalled();
    });
  }, 60000);

  it("refuses without an email on file and leaves nothing stored", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const { ctx, patientId } = await doctorWithPatient(client, null);
      await completeHistoria(ctx, patientId);

      await expect(SendHistoriaClinicaEmailCommand(ctx, patientId, ORIGIN, { doctorSignature: SIGNATURE })).rejects.toThrow(PatientHasNoEmailError);
      expect(uploadMock).not.toHaveBeenCalled();
    });
  }, 60000);

  it("removes the stored PDF when the email can't be sent", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const { ctx, patientId } = await doctorWithPatient(client);
      await completeHistoria(ctx, patientId);
      sendMock.mockResolvedValue(null);

      await expect(SendHistoriaClinicaEmailCommand(ctx, patientId, ORIGIN, { doctorSignature: SIGNATURE })).rejects.toThrow(/could not be sent/);
      expect(deleteMock).toHaveBeenCalledWith(uploadMock.mock.calls[0]![0]);
    });
  }, 60000);
});

describe("DownloadPublicDocumentCommand", () => {
  it("treats a malformed, unknown or expired token the same", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const { ctx, patientId } = await doctorWithPatient(client);
      await completeHistoria(ctx, patientId);
      await SendHistoriaClinicaEmailCommand(ctx, patientId, ORIGIN, { doctorSignature: SIGNATURE });
      const token = String(sendMock.mock.calls[0]![1]).split("#")[1]!;

      await expect(DownloadPublicDocumentCommand(client, "short")).rejects.toThrow(DocumentLinkInvalidError);
      await expect(DownloadPublicDocumentCommand(client, "A".repeat(43))).rejects.toThrow(DocumentLinkInvalidError);
      await client.query("UPDATE document_link SET expires_at = now() - interval '1 minute' WHERE patient_id = $1", [patientId]);
      await expect(DownloadPublicDocumentCommand(client, token)).rejects.toThrow(DocumentLinkInvalidError);
    });
  }, 60000);
});
