import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcrypt";
import {
  withTenant,
  insertStaffUser,
  getGlobalTerritoryId,
  getPractitionerById,
  insertOrganization,
  getOrganizationAffiliations,
  getPractitionerIdByIdentityId,
} from "../db.js";
import type { TenantContext } from "../context/TenantContext.js";
import { CreateLeadCommand } from "./lead.js";
import {
  InvitePractitionerCommand,
  AcceptPractitionerInviteCommand,
  ValidateInviteTokenQuery,
  GetPartnerDocumentPreviewQuery,
  type AcceptInviteInput,
} from "./invitePractitioner.js";
import { CreatePractitionerCommand, ActivatePractitionerCommand } from "./practitioner.js";
import { ApprovePartnerDocumentVersionCommand } from "./partnerDocuments.js";
import { getPartnerSignatoryConfig, approvalKey } from "../db/partnerSignatories.js";
import { ensurePartnerDocumentsReady, QA_CC_EMAIL, QA_SIGNATURE_PATH } from "../testing/partnerDocumentsFixture.js";
import { ForbiddenError, StaleDocumentVersionError, ValidationError } from "../errors.js";

// mailer.ts is the external boundary (Resend) — mocked here, same as
// commands/leadOffer.spec.ts's approach, per CLAUDE.md's "No mock-only tests"
// rule (scoped to Postgres, not third-party APIs — see ADR-016). vi.mock's
// factory is hoisted above any top-level const, so the mock fn itself must be
// created via vi.hoisted to be referenceable both inside the factory and below.
const { sendPartnerJoinThankYouEmailMock, sendPartnerInviteEmailMock } = vi.hoisted(() => ({
  sendPartnerJoinThankYouEmailMock: vi.fn().mockResolvedValue(undefined),
  sendPartnerInviteEmailMock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../mailer.js", () => ({
  sendPartnerJoinThankYouEmail: sendPartnerJoinThankYouEmailMock,
  sendPartnerInviteEmail: sendPartnerInviteEmailMock,
}));

// Supabase Storage (upload + the signatory PNG download) and headless
// Chrome (renderHtmlToPdf) are the other external boundaries — mocked; the
// rendered-HTML contract itself is covered in packages/documents' specs and
// applyDocumentFields' own spec.
// A 1x1 transparent PNG.
const PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const FAKE_SIGNATURE_DATA_URL = `data:image/png;base64,${PNG_BASE64}`;

const { uploadPartnerDocumentMock, downloadPartnerDocumentMock, renderHtmlToPdfMock } = vi.hoisted(() => ({
  uploadPartnerDocumentMock: vi.fn().mockImplementation(async (path: string) => ({ path, bucket: "qa-bucket" })),
  downloadPartnerDocumentMock: vi.fn(),
  renderHtmlToPdfMock: vi.fn(),
}));
vi.mock("../services/partnerDocuments.js", () => ({
  uploadPartnerDocument: uploadPartnerDocumentMock,
  downloadPartnerDocument: downloadPartnerDocumentMock,
}));
vi.mock("../services/documentRenderer.js", () => ({
  renderHtmlToPdf: renderHtmlToPdfMock,
}));

const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "neosleep";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function buildTestContext(client: Parameters<typeof CreateLeadCommand>[0]["client"]): Promise<TenantContext> {
  const email = `qa-invite-cmd-${uniqueSuffix()}@neosleepcare.com`;
  const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
  const user = await insertStaffUser(client, email, "QA", "Pilot", "admin", hash, false);
  await ensurePartnerDocumentsReady(client, user!.id);
  return {
    slug: TENANT_SLUG,
    client,
    user: { id: user!.id, email, role: "admin", roles: [{ role: "admin", territory_id: await getGlobalTerritoryId(client) }] },
    requestId: `test-${uniqueSuffix()}`,
  };
}

const META = () => ({ requestId: `test-${uniqueSuffix()}`, ip: "203.0.113.7", userAgent: "vitest" });

beforeEach(() => {
  sendPartnerJoinThankYouEmailMock.mockClear();
  sendPartnerInviteEmailMock.mockClear();
  uploadPartnerDocumentMock.mockClear();
  downloadPartnerDocumentMock.mockReset();
  downloadPartnerDocumentMock.mockResolvedValue(Buffer.from(PNG_BASE64, "base64"));
  renderHtmlToPdfMock.mockReset();
  renderHtmlToPdfMock.mockImplementation(async (html: string) => new TextEncoder().encode(`%PDF ${html.length}`));
});

describe("InvitePractitionerCommand", () => {
  // InvitePractitionerCommand only sends a holding "thank you" email — no
  // registration link/token yet. The actual set-password invite is deferred
  // to ActivatePractitionerCommand (see practitioner.ts / practitioner.spec.ts),
  // once training/capacitation is finished.
  it("sends a thank-you email from the inviting admin/manager's own identity", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const doctorEmail = `qa-invite-doctor-${uniqueSuffix()}@neosleepcare.com`;
      const lead = await CreateLeadCommand(ctx, {
        first_name: "Anna",
        last_name: "Doctor",
        type: "doctor",
        email: doctorEmail,
        phone: "600100200",
        metadata: { institution: "Acme Clinic" },
      });

      const frontendOrigin = "https://pwa-dev.neosleepcare.com";
      await InvitePractitionerCommand(ctx, lead.id, frontendOrigin, {});

      expect(sendPartnerJoinThankYouEmailMock).toHaveBeenCalledTimes(1);
      const [to, , sender] = sendPartnerJoinThankYouEmailMock.mock.calls[0]!;
      expect(to).toBe(doctorEmail);
      expect(sender).toEqual({ name: "NeoSleep", email: ctx.user.email });
    });
  }, 15000);

  it("carries the lead's licence number over to the new practitioner (NEO-51)", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const doctorEmail = `qa-invite-pwz-${uniqueSuffix()}@neosleepcare.com`;
      const lead = await CreateLeadCommand(ctx, {
        first_name: "Anna",
        last_name: "Pwz",
        type: "doctor",
        email: doctorEmail,
        phone: "600100200",
        region: "PL",
        metadata: { institution: "Acme Clinic", pwz: "3123456" },
      });

      await InvitePractitionerCommand(ctx, lead.id, "https://pwa-dev.neosleepcare.com", {});

      const { rows } = await client.query<{ national_ids: Record<string, string> | null }>(
        `SELECT p.national_ids FROM practitioner p JOIN identities i ON i.id = p.identity_id WHERE i.email = $1`,
        [doctorEmail],
      );
      expect(rows[0]?.national_ids).toEqual({ pwz: "3123456" });
    });
  }, 15000);
});

/**
 * Mints a real invite token via CreatePractitionerCommand +
 * ActivatePractitionerCommand (both already exercised in practitioner.spec.ts)
 * rather than inserting an invite_tokens row by hand.
 */
async function activateAndCaptureToken(
  ctx: TenantContext,
  email: string,
  options: { region: "PL" | "MX"; organizationId?: string },
): Promise<{ practitionerId: string; token: string }> {
  const practitioner = await CreatePractitionerCommand(ctx, {
    first_name: "Accept",
    last_name: "Flow",
    email,
    phone: "600100200",
    region: options.region,
    organization_id: options.organizationId,
  });
  await ActivatePractitionerCommand(ctx, practitioner.id);
  const registerLink = sendPartnerInviteEmailMock.mock.calls.at(-1)![1] as string;
  const token = new URL(registerLink).searchParams.get("token")!;
  return { practitionerId: practitioner.id, token };
}

async function acceptInput(
  client: Parameters<typeof ValidateInviteTokenQuery>[0],
  token: string,
  overrides: Partial<AcceptInviteInput> = {},
): Promise<AcceptInviteInput> {
  const preview = await ValidateInviteTokenQuery(client, token);
  const docs = preview!.documents!;
  return {
    token,
    password: "correct-horse-battery-staple",
    clinicName: "Accept Flow Clinic",
    clinicEmail: "clinic@example.com",
    clinicPhone: "600100200",
    taxId: "1234567890",
    billingAddress: "Some street 1, 00-000 City",
    licenseNumber: "3123456",
    practiceRole: "owner",
    agreementSignatureDataUrl: FAKE_SIGNATURE_DATA_URL,
    agreementVersionId: docs.agreementVersionId,
    dpaVersionId: docs.dpaVersionId,
    noticeVersionId: docs.noticeVersionId,
    noticeAcknowledged: true,
    ...overrides,
  };
}

describe("AcceptPractitionerInviteCommand", () => {
  // Regression test for the bug this whole feature started from (see
  // docs/stories/practitioner-invite-resend.md): completing registration is
  // the ONLY moment practitioner.status should become "active".
  it("activates the practitioner, stores the licence number and the owner role, and records the evidence bundle", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const org = await insertOrganization(client, { name: `QA Accept Clinic ${uniqueSuffix()}`, region: "PL" });
      const email = `qa-accept-${uniqueSuffix()}@example.com`;
      const { practitionerId, token } = await activateAndCaptureToken(ctx, email, { region: "PL", organizationId: org.id });

      expect((await getPractitionerById(client, practitionerId))?.status).toBe("invited");

      const result = await AcceptPractitionerInviteCommand(client, await acceptInput(client, token), META());

      const after = await getPractitionerById(client, practitionerId);
      expect(after?.status).toBe("active");
      expect(after?.national_ids).toEqual({ pwz: "3123456" });
      const affiliation = (await getOrganizationAffiliations(client, practitionerId)).find((a) => a.organization_id === org.id);
      expect(affiliation?.role).toBe("owner");

      // Two PDFs: agreement (+ annex) with both signatures and the owner clause, then the notice.
      expect(renderHtmlToPdfMock).toHaveBeenCalledTimes(2);
      const [agreementHtml, agreementOptions] = renderHtmlToPdfMock.mock.calls[0]!;
      expect(agreementHtml).toContain('data-image="counterparty_signature"');
      expect(agreementOptions.variant).toBe("owner");
      expect(agreementOptions.imageFields.signer_signature).toBe(FAKE_SIGNATURE_DATA_URL);
      expect(agreementOptions.imageFields.counterparty_signature).toMatch(/^data:image\/png;base64,/);
      expect(agreementOptions.dataFields.license_number).toBe("3123456");
      expect(agreementOptions.dataFields.counterparty_name).toBe("QA Signatory PL / NeoSleep");
      expect(downloadPartnerDocumentMock).toHaveBeenCalledWith(QA_SIGNATURE_PATH);

      expect(result.ccEmail).toBe(QA_CC_EMAIL);
      expect(result.locale).toBe("pl");
      expect(result.documents.map((d) => d.type)).toEqual(["partner_agreement", "privacy_notice"]);

      // Contract, not consent — and only the agreement gets a consent row.
      const consents = await client.query<{ legal_basis: string; purpose: string; jurisdiction: string; metadata: Record<string, unknown> }>(
        `SELECT legal_basis, purpose, jurisdiction, metadata FROM consent WHERE entity_type = 'user' AND entity_id = $1`,
        [result.userId],
      );
      expect(consents.rows).toHaveLength(1);
      expect(consents.rows[0]).toMatchObject({ legal_basis: "contract", purpose: "partner_agreement_dpa", jurisdiction: "PL" });
      expect(consents.rows[0]!.metadata).toMatchObject({ practice_role: "owner", signatory: "QA Signatory PL / NeoSleep" });
      expect(typeof consents.rows[0]!.metadata.sha256).toBe("string");
      expect(consents.rows[0]!.metadata.content_version_ids).toBeTruthy();

      const attachments = await client.query<{ metadata: Record<string, unknown> }>(
        `SELECT metadata FROM file_attachment WHERE entity_type = 'user' AND entity_id = $1 ORDER BY created_at`,
        [result.userId],
      );
      expect(attachments.rows.map((r) => r.metadata.document_type).sort()).toEqual(["partner_agreement", "privacy_notice"]);

      const audit = await client.query<{ action: string; user_ip: string | null }>(
        `SELECT action, user_ip FROM audit_log WHERE user_id = $1 AND action IN ('sign', 'acknowledge_privacy_notice')`,
        [result.userId],
      );
      expect(audit.rows.map((r) => r.action).sort()).toEqual(["acknowledge_privacy_notice", "sign"]);
      expect(audit.rows.every((r) => r.user_ip === "203.0.113.7")).toBe(true);
    });
  }, 30000);

  it("renders the staff party clause for a doctor who works at the facility (MX, no tax ID needed)", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const { token } = await activateAndCaptureToken(ctx, `qa-accept-mx-${uniqueSuffix()}@example.com`, { region: "MX" });

      const result = await AcceptPractitionerInviteCommand(
        client,
        await acceptInput(client, token, { practiceRole: "staff", taxId: "", licenseNumber: "AE-1234567" }),
        META(),
      );

      const [, agreementOptions] = renderHtmlToPdfMock.mock.calls[0]!;
      expect(agreementOptions.variant).toBe("staff");
      expect(agreementOptions.dataFields.license_number).toBe("1234567");
      expect(result.locale).toBe("mx");
    });
  }, 30000);

  it("rejects a document version that is no longer current + approved — the doctor must re-read", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const { practitionerId, token } = await activateAndCaptureToken(ctx, `qa-accept-stale-${uniqueSuffix()}@example.com`, { region: "PL" });

      await expect(
        AcceptPractitionerInviteCommand(
          client,
          await acceptInput(client, token, { agreementVersionId: "00000000-0000-0000-0000-000000000000" }),
          META(),
        ),
      ).rejects.toBeInstanceOf(StaleDocumentVersionError);
      expect((await getPractitionerById(client, practitionerId))?.status).toBe("invited");
      expect(renderHtmlToPdfMock).not.toHaveBeenCalled();
    });
  }, 30000);

  it("requires the privacy-notice acknowledgement and a valid licence number for the jurisdiction", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const { token } = await activateAndCaptureToken(ctx, `qa-accept-invalid-${uniqueSuffix()}@example.com`, { region: "PL" });

      await expect(
        AcceptPractitionerInviteCommand(client, await acceptInput(client, token, { noticeAcknowledged: false }), META()),
      ).rejects.toBeInstanceOf(ValidationError);
      await expect(
        AcceptPractitionerInviteCommand(client, await acceptInput(client, token, { licenseNumber: "4123456" }), META()),
      ).rejects.toBeInstanceOf(ValidationError);
      await expect(
        AcceptPractitionerInviteCommand(client, await acceptInput(client, token, { practiceRole: "boss" }), META()),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  }, 30000);

  // NEO-109: each rejection names the request-body key the registration page
  // sends, so the page marks that field instead of showing a generic alert.
  it("names the rejected field by the key the registration page submits", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const { token } = await activateAndCaptureToken(ctx, `qa-accept-fields-${uniqueSuffix()}@example.com`, { region: "PL" });

      const cases: [Partial<AcceptInviteInput>, string][] = [
        [{ password: "short" }, "password"],
        [{ clinicName: " " }, "clinicName"],
        [{ clinicEmail: "" }, "clinicEmail"],
        [{ clinicPhone: "" }, "clinicPhone"],
        [{ billingAddress: "" }, "billingAddress"],
        [{ practiceRole: "boss" }, "practiceRole"],
        [{ practiceRole: "owner", taxId: "" }, "taxId"],
        [{ licenseNumber: "4123456" }, "licenseNumber"],
        [{ token: "not-a-real-token" }, "token"],
      ];
      for (const [override, field] of cases) {
        await expect(
          AcceptPractitionerInviteCommand(client, await acceptInput(client, token, override), META()),
        ).rejects.toMatchObject({ code: "VALIDATION_ERROR", field });
      }
    });
  }, 30000);
});

describe("GetPartnerDocumentPreviewQuery", () => {
  it("returns the agreement with NeoSleep's signature and name, and leaves party fields for the client to fill", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const { token } = await activateAndCaptureToken(ctx, `qa-preview-${uniqueSuffix()}@example.com`, { region: "PL" });

      const agreement = await GetPartnerDocumentPreviewQuery(client, token, "agreement");
      expect(agreement?.html).toContain('data-variant="owner"');
      expect(agreement?.imageFields.counterparty_signature).toMatch(/^data:image\/png;base64,/);
      expect(agreement?.dataFields.counterparty_name).toBe("QA Signatory PL / NeoSleep");
      expect(agreement?.dataFields.doctor_name).toBeUndefined();
      expect(agreement?.versionIds).toHaveLength(2);

      const notice = await GetPartnerDocumentPreviewQuery(client, token, "notice");
      expect(notice?.imageFields).toEqual({});
      expect(notice?.versionIds).toHaveLength(1);

      expect(await GetPartnerDocumentPreviewQuery(client, "not-a-real-token", "agreement")).toBeNull();
    });
  }, 30000);
});

describe("ValidateInviteTokenQuery", () => {
  it("returns null clinic-detail fields when the practitioner has no linked organization, plus the jurisdiction and document versions", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const email = `qa-prefill-none-${uniqueSuffix()}@example.com`;
      const { token } = await activateAndCaptureToken(ctx, email, { region: "PL" });

      const preview = await ValidateInviteTokenQuery(client, token);

      expect(preview?.email).toBe(email);
      expect(preview?.clinicName).toBeNull();
      expect(preview?.clinicEmail).toBeNull();
      expect(preview?.clinicPhone).toBeNull();
      expect(preview?.clinicAddress).toBeNull();
      expect(preview?.taxId).toBeNull();
      expect(preview?.jurisdiction).toBe("PL");
      expect(preview?.practiceRole).toBe("staff");
      expect(preview?.documents?.agreementVersionId).toBeTruthy();
    });
  }, 20000);

  it("pre-fills clinic-detail fields from a linked organization, and defaults a private practice to 'owner'", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const org = await insertOrganization(client, {
        name: `QA Prefill Clinic ${uniqueSuffix()}`,
        type: "practice",
        email: "clinic@example.com",
        phone: "600999888",
        address_line1: "Some street 1",
        city: "Warsaw",
        state: "Mazowieckie",
        postal_code: "00-000",
        region: "PL",
      });
      // No writer exists yet for organization.identifiers anywhere in the app —
      // set directly so extractTaxId() has real data to read.
      await client.query(`UPDATE organization SET identifiers = $1 WHERE id = $2`, [
        JSON.stringify({ nip: "1234567890" }),
        org.id,
      ]);

      const { token } = await activateAndCaptureToken(ctx, `qa-prefill-org-${uniqueSuffix()}@example.com`, {
        region: "PL",
        organizationId: org.id,
      });

      const preview = await ValidateInviteTokenQuery(client, token);

      expect(preview?.clinicName).toBe(org.name);
      expect(preview?.clinicEmail).toBe("clinic@example.com");
      expect(preview?.clinicPhone).toBe("600999888");
      expect(preview?.clinicAddress).toBe("Some street 1, Warsaw, Mazowieckie, 00-000");
      expect(preview?.taxId).toBe("1234567890");
      expect(preview?.practiceRole).toBe("owner");
    });
  }, 20000);
});

describe("ApprovePartnerDocumentVersionCommand", () => {
  it("only lets the jurisdiction's signatory approve, and records the approved version", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const signatoryCtx = await buildTestContext(client);
      const preview = await (async () => {
        const { token } = await activateAndCaptureToken(signatoryCtx, `qa-approve-${uniqueSuffix()}@example.com`, { region: "PL" });
        return ValidateInviteTokenQuery(client, token);
      })();
      const versionId = preview!.documents!.agreementVersionId;

      // Another admin — not the configured signatory.
      const hash = await bcrypt.hash("x", 4);
      const other = await insertStaffUser(client, `qa-approve-other-${uniqueSuffix()}@neosleepcare.com`, "Other", "Admin", "admin", hash, false);
      const otherCtx: TenantContext = { ...signatoryCtx, user: { ...signatoryCtx.user, id: other!.id } };
      await expect(
        ApprovePartnerDocumentVersionCommand(otherCtx, "partnerAgreement", "pl", versionId),
      ).rejects.toBeInstanceOf(ForbiddenError);

      await expect(
        ApprovePartnerDocumentVersionCommand(signatoryCtx, "partnerPrivacyNotice", "pl", versionId),
      ).rejects.toBeInstanceOf(ValidationError);

      const approved = await ApprovePartnerDocumentVersionCommand(signatoryCtx, "partnerAgreement", "pl", versionId);
      expect(approved.versionId).toBe(versionId);
      const config = await getPartnerSignatoryConfig(client);
      expect(config.approvedVersions[approvalKey("partnerAgreement", "pl")]).toBe(versionId);

      // Sanity: the practitioner created above still resolves by identity.
      expect(await getPractitionerIdByIdentityId(client, "00000000-0000-0000-0000-000000000000")).toBeNull();
    });
  }, 30000);
});
