import { describe, it, expect, vi, beforeAll } from "vitest";
import bcrypt from "bcrypt";
import { withTenant, insertStaffUser, insertPatient, getGlobalTerritoryId } from "../db.js";
import { getAuditLogForEntities } from "../db/audit-log.js";
import { withPlatform } from "../db/tenant.js";
import { insertDocumentContentVersion } from "../db/documentContent.js";
import type { TenantContext } from "../context/TenantContext.js";
import { ValidationError, NotFoundError } from "../errors.js";
import { SaveEndoIntakeCommand, GenerateEndoIntakePdfCommand } from "./endoIntake.js";

// renderHtmlToPdf needs a real headless Chromium — mocked at the boundary
// here, same pattern invitePractitioner.spec.ts uses for mailer.js (this
// command's own logic — data assembly, file_attachment/audit_log writes —
// is what's under test, not Puppeteer/PDF rendering itself, which is a
// visual/manual-verification concern per the story's own testing plan).
const { renderHtmlToPdfMock } = vi.hoisted(() => ({
  renderHtmlToPdfMock: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
}));
vi.mock("../services/documentRenderer.js", () => ({ renderHtmlToPdf: renderHtmlToPdfMock }));

const { uploadPartnerDocumentMock } = vi.hoisted(() => ({
  uploadPartnerDocumentMock: vi.fn().mockResolvedValue({ path: "patient/fake/historia-endo.pdf", bucket: "partner-documents" }),
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
  const email = `qa-endo-intake-cmd-${uniqueSuffix()}@neosleepcare.com`;
  const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
  const user = await insertStaffUser(client, email, "QA", "Pilot", "admin", hash, false);
  return {
    slug: TENANT_SLUG,
    client,
    user: { id: user!.id, email, role: "admin", roles: [{ role: "admin", territory_id: await getGlobalTerritoryId(client) }] },
    requestId: `test-${uniqueSuffix()}`,
  };
}

// historiaEndo/mx needs a real document_content_version row, or
// GetCurrentDocumentContentQuery throws NotFoundError (by design — a
// missing consent paragraph is a compliance risk, not a cosmetic 404).
// Seeded once for the whole file, same "shared, non-tenant-isolated
// platform schema" reasoning as commands/documentContent.spec.ts's own
// "__test" fixture — this row is real production content, not a test
// fixture, so it's seeded only if genuinely missing (idempotent-ish: a
// re-run just adds another version, is_current still ends up correct).
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
      changeNote: "seeded by commands/endoIntake.spec.ts",
    })
  );
}, 15000);

describe("SaveEndoIntakeCommand", () => {
  it("throws NotFoundError for a nonexistent patient", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      await expect(
        SaveEndoIntakeCommand(ctx, "00000000-0000-0000-0000-000000000000", { has_diabetes: true })
      ).rejects.toThrow(NotFoundError);
    });
  });

  it("rejects a non-boolean value for a boolean checklist column", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const patient = await insertPatient(client, { first_name: "Bad", last_name: `Input-${uniqueSuffix()}` });
      await expect(SaveEndoIntakeCommand(ctx, patient.id, { has_diabetes: "yes" })).rejects.toThrow(ValidationError);
    });
  });

  it("rejects an invalid skeletal_class value", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const patient = await insertPatient(client, { first_name: "Bad", last_name: `Skeletal-${uniqueSuffix()}` });
      await expect(SaveEndoIntakeCommand(ctx, patient.id, { skeletal_class: "IV" })).rejects.toThrow(ValidationError);
    });
  });

  it("saves and writes an audit_log entry with a real patient UUID as entity_id", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const patient = await insertPatient(client, { first_name: "Save", last_name: `Test-${uniqueSuffix()}` });

      const intake = await SaveEndoIntakeCommand(ctx, patient.id, { has_diabetes: true, skeletal_class: "I" });
      expect(intake.has_diabetes).toBe(true);
      expect(intake.skeletal_class).toBe("I");
      expect(intake.recorded_by).toBe(ctx.user.id);

      const auditRows = await getAuditLogForEntities(client, ["EndoIntake"], [patient.id]);
      expect(auditRows.length).toBeGreaterThan(0);
      expect(auditRows[0].action).toBe("update");
    });
  }, 15000);
});

describe("GenerateEndoIntakePdfCommand", () => {
  it("throws NotFoundError for a nonexistent patient", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      await expect(GenerateEndoIntakePdfCommand(ctx, "00000000-0000-0000-0000-000000000000")).rejects.toThrow(NotFoundError);
    });
  });

  it("renders, uploads, and writes a file_attachment + audit_log row discoverable via entity_type=patient", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const patient = await insertPatient(client, { first_name: "Pdf", last_name: `Gen-${uniqueSuffix()}` });
      await SaveEndoIntakeCommand(ctx, patient.id, { has_diabetes: true });

      renderHtmlToPdfMock.mockClear();
      uploadPartnerDocumentMock.mockClear();

      const result = await GenerateEndoIntakePdfCommand(ctx, patient.id);
      expect(result.id).toBeTruthy();

      expect(renderHtmlToPdfMock).toHaveBeenCalledTimes(1);
      const [html, options] = renderHtmlToPdfMock.mock.calls[0]!;
      expect(html).toContain("QA test consent body");
      expect(options.dataFields.q_has_diabetes).toBe("Sí");
      expect(options.dataFields.q_has_anemia).toBe(""); // not yet answered

      expect(uploadPartnerDocumentMock).toHaveBeenCalledTimes(1);

      const { rows } = await client.query(`SELECT entity_type, entity_id, metadata FROM file_attachment WHERE id = $1`, [result.id]);
      expect(rows[0].entity_type).toBe("patient");
      expect(rows[0].entity_id).toBe(patient.id);
      expect(rows[0].metadata.document_type).toBe("historiaEndo");

      const auditRows = await getAuditLogForEntities(client, ["FileAttachment"], [result.id]);
      expect(auditRows.length).toBeGreaterThan(0);
    });
  }, 15000);
});
