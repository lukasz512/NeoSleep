import { describe, it, expect, vi } from "vitest";
import bcrypt from "bcrypt";
import { withTenant, insertStaffUser, insertPatient, getGlobalTerritoryId } from "../db.js";
import { getAuditLogForEntities } from "../db/audit-log.js";
import type { TenantContext } from "../context/TenantContext.js";
import { ValidationError, NotFoundError } from "../errors.js";
import { RecordStopBangScreeningCommand, GenerateStopBangPdfCommand } from "./stopBangScreening.js";

// Same mocking approach as commands/endoIntake.spec.ts — renderHtmlToPdf
// needs a real headless Chromium, mocked at the boundary.
const { renderHtmlToPdfMock } = vi.hoisted(() => ({
  renderHtmlToPdfMock: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
}));
vi.mock("../services/documentRenderer.js", () => ({ renderHtmlToPdf: renderHtmlToPdfMock }));

const { uploadPartnerDocumentMock } = vi.hoisted(() => ({
  uploadPartnerDocumentMock: vi.fn().mockResolvedValue({ path: "patient/fake/stop-bang.pdf", bucket: "partner-documents" }),
}));
vi.mock("../services/partnerDocuments.js", async (importActual) => ({
  ...(await importActual<typeof import("../services/partnerDocuments.js")>()),
  uploadPartnerDocument: uploadPartnerDocumentMock,
}));

const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "neosleep";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function buildTestContext(client: Parameters<typeof insertStaffUser>[0]): Promise<TenantContext> {
  const email = `qa-stop-bang-cmd-${uniqueSuffix()}@neosleepcare.com`;
  const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
  const user = await insertStaffUser(client, email, "QA", "Pilot", "admin", hash, false);
  return {
    slug: TENANT_SLUG,
    client,
    user: { id: user!.id, email, role: "admin", roles: [{ role: "admin", territory_id: await getGlobalTerritoryId(client) }] },
    requestId: `test-${uniqueSuffix()}`,
  };
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

describe("RecordStopBangScreeningCommand", () => {
  it("throws NotFoundError for a nonexistent patient", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      await expect(RecordStopBangScreeningCommand(ctx, "00000000-0000-0000-0000-000000000000", ALL_NO)).rejects.toThrow(NotFoundError);
    });
  });

  it("rejects a missing required field", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const patient = await insertPatient(client, { first_name: "Missing", last_name: `Field-${uniqueSuffix()}` });
      const { snoring: _omit, ...incomplete } = ALL_NO;
      await expect(RecordStopBangScreeningCommand(ctx, patient.id, incomplete)).rejects.toThrow(ValidationError);
    });
  });

  it("records a screening and writes an audit_log entry", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const patient = await insertPatient(client, { first_name: "Record", last_name: `Screening-${uniqueSuffix()}` });

      const screening = await RecordStopBangScreeningCommand(ctx, patient.id, { ...ALL_NO, snoring: true, is_male: true });
      expect(screening.score).toBe(2);
      expect(screening.recorded_by).toBe(ctx.user.id);

      const auditRows = await getAuditLogForEntities(client, ["StopBangScreening"], [screening.id]);
      expect(auditRows.length).toBeGreaterThan(0);
      expect(auditRows[0].action).toBe("create");
    });
  }, 15000);
});

describe("GenerateStopBangPdfCommand", () => {
  it("throws NotFoundError for a screening that doesn't belong to the given patient", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const patientA = await insertPatient(client, { first_name: "A", last_name: `Patient-${uniqueSuffix()}` });
      const patientB = await insertPatient(client, { first_name: "B", last_name: `Patient-${uniqueSuffix()}` });
      const screening = await RecordStopBangScreeningCommand(ctx, patientA.id, ALL_NO);

      await expect(GenerateStopBangPdfCommand(ctx, patientB.id, screening.id)).rejects.toThrow(NotFoundError);
    });
  }, 15000);

  it("renders, uploads, and writes a file_attachment row with the score in its metadata", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const patient = await insertPatient(client, { first_name: "Pdf", last_name: `StopBang-${uniqueSuffix()}` });
      const screening = await RecordStopBangScreeningCommand(ctx, patient.id, { ...ALL_NO, snoring: true, age_over_50: true, is_male: true });

      renderHtmlToPdfMock.mockClear();
      const result = await GenerateStopBangPdfCommand(ctx, patient.id, screening.id);

      expect(renderHtmlToPdfMock).toHaveBeenCalledTimes(1);
      const [, options] = renderHtmlToPdfMock.mock.calls[0]!;
      expect(options.dataFields.q_snoring).toBe("Sí");
      expect(options.dataFields.q_tiredness).toBe("No");
      expect(options.dataFields.score).toBe("3");

      const { rows } = await client.query(`SELECT entity_type, entity_id, metadata FROM file_attachment WHERE id = $1`, [result.id]);
      expect(rows[0].entity_type).toBe("patient");
      expect(rows[0].entity_id).toBe(patient.id);
      expect(rows[0].metadata.document_type).toBe("stopBang");
      expect(rows[0].metadata.score).toBe(3);
    });
  }, 15000);
});
