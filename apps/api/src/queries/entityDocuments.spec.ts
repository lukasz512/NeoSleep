import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcrypt";
import { withTenant, insertStaffUser, insertFileAttachment, getGlobalTerritoryId, getLinkedUserIdForPractitioner } from "../db.js";
import type { TenantContext } from "../context/TenantContext.js";
import { CreatePractitionerCommand, ActivatePractitionerCommand } from "../commands/practitioner.js";
import { NotFoundError } from "../errors.js";
import { ensurePartnerDocumentsReady } from "../testing/partnerDocumentsFixture.js";
import {
  GetPractitionerDocumentsQuery,
  GetOrganizationDocumentsQuery,
  GetPatientDocumentsQuery,
  GetPractitionerDocumentDownloadUrlQuery,
  GetOrganizationDocumentDownloadUrlQuery,
} from "./entityDocuments.js";

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

async function buildTestContext(client: Parameters<typeof CreatePractitionerCommand>[0]["client"]): Promise<TenantContext> {
  const email = `qa-entity-docs-${uniqueSuffix()}@neosleepcare.com`;
  const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
  const user = await insertStaffUser(client, email, "QA", "Pilot", "admin", hash, false);
  // ActivatePractitionerCommand (fixture setup below) needs ready partner documents (NEO-51).
  await ensurePartnerDocumentsReady(client, user!.id);
  return {
    slug: TENANT_SLUG,
    client,
    user: { id: user!.id, email, role: "admin", roles: [{ role: "admin", territory_id: await getGlobalTerritoryId(client) }] },
    requestId: `test-${uniqueSuffix()}`,
  };
}

beforeEach(() => {
  sendPartnerInviteEmailMock.mockClear();
});

describe("GetPractitionerDocumentsQuery", () => {
  it("returns only the practitioner's own rows when there is no linked user account yet", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      // A random id with no real practitioner row: getLinkedUserIdForPractitioner's
      // JOIN simply finds nothing, same as a real practitioner never activated.
      const practitionerId = crypto.randomUUID();
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
      const organizationId = crypto.randomUUID();
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
      const patientId = crypto.randomUUID();
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

      await expect(
        GetPractitionerDocumentDownloadUrlQuery(ctx, crypto.randomUUID(), attachment.id)
      ).rejects.toThrow(NotFoundError);
    });
  });

  it("GetOrganizationDocumentDownloadUrlQuery throws NotFoundError for a nonexistent document id", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      await expect(
        GetOrganizationDocumentDownloadUrlQuery(ctx, crypto.randomUUID(), "00000000-0000-0000-0000-000000000000")
      ).rejects.toThrow(NotFoundError);
    });
  });
});
