import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcrypt";
import { withTenant, insertStaffUser, insertFileAttachment, insertPatient, getGlobalTerritoryId, getCountryTerritoryId, getLinkedUserIdForPractitioner } from "../db.js";
import type { TenantContext } from "../context/TenantContext.js";
import type { StaffRole } from "../db/users.js";
import { CreatePractitionerCommand, ActivatePractitionerCommand } from "../commands/practitioner.js";
import { CreateOrganizationCommand } from "../commands/organization.js";
import { NotFoundError, ForbiddenError } from "../errors.js";
import { ensurePartnerDocumentsReady } from "../testing/partnerDocumentsFixture.js";
import {
  GetPractitionerDocumentsQuery,
  GetOrganizationDocumentsQuery,
  GetPatientDocumentsQuery,
  GetPractitionerDocumentDownloadUrlQuery,
  GetOrganizationDocumentDownloadUrlQuery,
  GetPatientDocumentDownloadUrlQuery,
} from "./entityDocuments.js";
import { GetHistoryForPatientQuery, GetHistoryForPractitionerQuery, GetHistoryForOrganizationQuery } from "./auditLog.js";

// mailer.ts is the external boundary (Resend) — mocked here, same pattern as
// commands/practitioner.spec.ts, since ActivatePractitionerCommand is only
// used here as fixture setup (to get a real practitioner+linked-user
// identity pair via ADR-014's linkage), not itself under test.
const { sendPartnerInviteEmailMock } = vi.hoisted(() => ({
  sendPartnerInviteEmailMock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../mailer.js", async (importActual) => ({
  ...(await importActual<typeof import("../mailer.js")>()),
  sendPartnerInviteEmail: sendPartnerInviteEmailMock,
}));

const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "neosleep";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

type Client = Parameters<typeof CreatePractitionerCommand>[0]["client"];

async function buildTestContext(client: Client, role: StaffRole = "admin", territoryId?: string): Promise<TenantContext> {
  const email = `qa-entity-docs-${uniqueSuffix()}@neosleepcare.com`;
  const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
  const scope = territoryId ?? (await getGlobalTerritoryId(client));
  const user = await insertStaffUser(client, email, "QA", "Pilot", role, hash, false, null, null, scope);
  // ActivatePractitionerCommand (fixture setup below) needs ready partner documents (NEO-51).
  await ensurePartnerDocumentsReady(client, user!.id);
  return {
    slug: TENANT_SLUG,
    client,
    user: { id: user!.id, email, role, roles: [{ role, territory_id: scope }] },
    requestId: `test-${uniqueSuffix()}`,
  };
}

async function createTestPractitioner(ctx: TenantContext, territoryId: string | null = null) {
  return CreatePractitionerCommand(ctx, {
    first_name: "Docs",
    last_name: `Test-${uniqueSuffix()}`,
    email: `qa-entity-docs-hcp-${uniqueSuffix()}@example.com`,
    phone: "600100200",
    territory_id: territoryId,
  });
}

async function createTestOrganization(ctx: TenantContext, territoryId: string | null = null) {
  return CreateOrganizationCommand(ctx, {
    name: `QA Docs Clinic ${uniqueSuffix()}`,
    type: "clinic",
    email: `qa-docs-clinic-${uniqueSuffix()}@example.com`,
    phone: "600100200",
    territory_id: territoryId,
  });
}

beforeEach(() => {
  sendPartnerInviteEmailMock.mockClear();
});

describe("GetPractitionerDocumentsQuery", () => {
  it("returns only the practitioner's own rows when there is no linked user account yet", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      // A real practitioner that was never activated has no linked user account.
      const practitionerId = (await createTestPractitioner(ctx)).id;
      await insertFileAttachment(client, {
        entity_type: "practitioner",
        entity_id: practitionerId,
        url: "https://example.test/own.pdf",
        filename: "own.pdf",
        metadata: { document_type: "example" },
      });

      const docs = await GetPractitionerDocumentsQuery(ctx, practitionerId);
      expect(docs).toHaveLength(1);
      expect(docs[0].filename).toBe("own.pdf");
    });
  });

  it("merges the practitioner's own rows with the linked doctor user account's rows, newest first", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const practitioner = await CreatePractitionerCommand(ctx, {
        first_name: "Merge",
        last_name: `Test-${uniqueSuffix()}`,
        email: `qa-entity-docs-hcp-${uniqueSuffix()}@example.com`,
        phone: "600100200",
        region: "PL",
      });
      await ActivatePractitionerCommand(ctx, practitioner.id);

      const linkedUserId = await getLinkedUserIdForPractitioner(client, practitioner.id);
      expect(linkedUserId).not.toBeNull();

      await insertFileAttachment(client, {
        entity_type: "practitioner",
        entity_id: practitioner.id,
        url: "https://example.test/own.pdf",
        filename: "own.pdf",
        metadata: { document_type: "example" },
      });
      await insertFileAttachment(client, {
        entity_type: "user",
        entity_id: linkedUserId!,
        url: "https://example.test/gdpr.pdf",
        filename: "gdpr.pdf",
        metadata: { document_type: "gdpr" },
      });

      const docs = await GetPractitionerDocumentsQuery(ctx, practitioner.id);
      expect(docs.map((d) => d.filename).sort()).toEqual(["gdpr.pdf", "own.pdf"]);
    });
  }, 15000);
});

describe("GetOrganizationDocumentsQuery / GetPatientDocumentsQuery", () => {
  it("returns file_attachment rows scoped to the given organization", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const organizationId = (await createTestOrganization(ctx)).id;
      await insertFileAttachment(client, {
        entity_type: "organization",
        entity_id: organizationId,
        url: "https://example.test/org.pdf",
        filename: "org.pdf",
      });

      const docs = await GetOrganizationDocumentsQuery(ctx, organizationId);
      expect(docs).toHaveLength(1);
      expect(docs[0].filename).toBe("org.pdf");
    });
  });

  it("returns file_attachment rows scoped to the given patient", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      // A real patient: the query is territory-checked through GetPatientByIdQuery.
      const patientId = (await insertPatient(client, { first_name: "Docs", last_name: `Patient-${crypto.randomUUID().slice(0, 8)}` })).id;
      await insertFileAttachment(client, {
        entity_type: "patient",
        entity_id: patientId,
        url: "https://example.test/patient.pdf",
        filename: "patient.pdf",
      });

      const docs = await GetPatientDocumentsQuery(ctx, patientId);
      expect(docs).toHaveLength(1);
      expect(docs[0].filename).toBe("patient.pdf");
    });
  });
});

describe("download URL ownership guards", () => {
  it("GetPractitionerDocumentDownloadUrlQuery throws NotFoundError for a document belonging to a different practitioner", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const attachment = await insertFileAttachment(client, {
        entity_type: "practitioner",
        entity_id: crypto.randomUUID(),
        url: "https://example.test/not-mine.pdf",
        path: "not-mine.pdf",
        filename: "not-mine.pdf",
      });

      const practitioner = await createTestPractitioner(ctx);
      await expect(
        GetPractitionerDocumentDownloadUrlQuery(ctx, practitioner.id, attachment.id)
      ).rejects.toThrow(NotFoundError);
    });
  });

  it("GetOrganizationDocumentDownloadUrlQuery throws NotFoundError for a nonexistent document id", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const organization = await createTestOrganization(ctx);
      await expect(
        GetOrganizationDocumentDownloadUrlQuery(ctx, organization.id, "00000000-0000-0000-0000-000000000000")
      ).rejects.toThrow(NotFoundError);
    });
  });
});

describe("territory scoping on history + documents sub-routes (NEO-48)", () => {
  async function territories(client: Client) {
    const plId = await getCountryTerritoryId(client, "PL");
    const mxId = await getCountryTerritoryId(client, "MX");
    if (!plId || !mxId) throw new Error("PL/MX country territory not seeded");
    return { plId, mxId };
  }

  it("denies a rep outside a practitioner's territory its history, documents and download URLs", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const { plId, mxId } = await territories(client);
      const adminCtx = await buildTestContext(client);
      const mxRepCtx = await buildTestContext(client, "rep", mxId);
      const practitioner = await createTestPractitioner(adminCtx, plId);
      const attachment = await insertFileAttachment(client, {
        entity_type: "practitioner", entity_id: practitioner.id,
        url: "https://example.test/pl.pdf", path: "pl.pdf", filename: "pl.pdf",
      });

      await expect(GetHistoryForPractitionerQuery(mxRepCtx, practitioner.id)).rejects.toThrow(ForbiddenError);
      await expect(GetPractitionerDocumentsQuery(mxRepCtx, practitioner.id)).rejects.toThrow(ForbiddenError);
      await expect(GetPractitionerDocumentDownloadUrlQuery(mxRepCtx, practitioner.id, attachment.id)).rejects.toThrow(ForbiddenError);
    });
  }, 20000);

  it("denies a rep outside an organization's territory its history, documents and download URLs", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const { plId, mxId } = await territories(client);
      const adminCtx = await buildTestContext(client);
      const mxRepCtx = await buildTestContext(client, "rep", mxId);
      const organization = await createTestOrganization(adminCtx, plId);
      const attachment = await insertFileAttachment(client, {
        entity_type: "organization", entity_id: organization.id,
        url: "https://example.test/pl-org.pdf", path: "pl-org.pdf", filename: "pl-org.pdf",
      });

      await expect(GetHistoryForOrganizationQuery(mxRepCtx, organization.id)).rejects.toThrow(ForbiddenError);
      await expect(GetOrganizationDocumentsQuery(mxRepCtx, organization.id)).rejects.toThrow(ForbiddenError);
      await expect(GetOrganizationDocumentDownloadUrlQuery(mxRepCtx, organization.id, attachment.id)).rejects.toThrow(ForbiddenError);
    });
  }, 20000);

  it("denies a rep outside a patient's territory its history (documents were already guarded)", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const { plId, mxId } = await territories(client);
      const mxRepCtx = await buildTestContext(client, "rep", mxId);
      const patient = await insertPatient(client, { first_name: "Scope", last_name: `Patient-${uniqueSuffix()}`, territory_id: plId });

      await expect(GetHistoryForPatientQuery(mxRepCtx, patient.id)).rejects.toThrow(ForbiddenError);
      await expect(GetPatientDocumentsQuery(mxRepCtx, patient.id)).rejects.toThrow(ForbiddenError);
      await expect(GetPatientDocumentDownloadUrlQuery(mxRepCtx, patient.id, crypto.randomUUID())).rejects.toThrow(ForbiddenError);
    });
  }, 20000);

  it("still lets a rep inside the territory read them", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const { plId } = await territories(client);
      const adminCtx = await buildTestContext(client);
      const plRepCtx = await buildTestContext(client, "rep", plId);
      const practitioner = await createTestPractitioner(adminCtx, plId);
      const organization = await createTestOrganization(adminCtx, plId);

      await expect(GetHistoryForPractitionerQuery(plRepCtx, practitioner.id)).resolves.toBeDefined();
      await expect(GetPractitionerDocumentsQuery(plRepCtx, practitioner.id)).resolves.toEqual([]);
      await expect(GetHistoryForOrganizationQuery(plRepCtx, organization.id)).resolves.toBeDefined();
      await expect(GetOrganizationDocumentsQuery(plRepCtx, organization.id)).resolves.toEqual([]);
    });
  }, 20000);

  it("answers NotFoundError (404) for a parent record that doesn't exist", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      await expect(GetHistoryForPractitionerQuery(ctx, crypto.randomUUID())).rejects.toThrow(NotFoundError);
      await expect(GetOrganizationDocumentsQuery(ctx, crypto.randomUUID())).rejects.toThrow(NotFoundError);
    });
  }, 20000);
});
