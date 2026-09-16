import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcrypt";
import { withTenant, insertStaffUser, getGlobalTerritoryId, getPractitionerById } from "../db.js";
import type { TenantContext } from "../context/TenantContext.js";
import { CreateLeadCommand } from "./lead.js";
import { InvitePractitionerCommand } from "./invitePractitioner.js";
import { AcceptPractitionerInviteCommand } from "./invitePractitioner.js";
import { CreatePractitionerCommand, ActivatePractitionerCommand } from "./practitioner.js";

// mailer.ts is the external boundary (Resend) — mocked here, same as
// commands/leadOffer.spec.ts's approach, per CLAUDE.md's "No mock-only tests"
// rule (scoped to Postgres, not third-party APIs — see ADR-016). vi.mock's
// factory is hoisted above any top-level const, so the mock fn itself must be
// created via vi.hoisted to be referenceable both inside the factory and below.
// Both mailer functions are mocked here (not just the one InvitePractitionerCommand
// uses): ActivatePractitionerCommand — needed below to mint a real invite
// token for the AcceptPractitionerInviteCommand tests — also imports from
// this same mocked module, and an incomplete mock factory would leave its
// import undefined.
const { sendPartnerJoinThankYouEmailMock, sendPartnerInviteEmailMock } = vi.hoisted(() => ({
  sendPartnerJoinThankYouEmailMock: vi.fn().mockResolvedValue(undefined),
  sendPartnerInviteEmailMock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../mailer.js", () => ({
  sendPartnerJoinThankYouEmail: sendPartnerJoinThankYouEmailMock,
  sendPartnerInviteEmail: sendPartnerInviteEmailMock,
}));

// services/partnerDocuments.ts is the other external boundary AcceptPractitionerInviteCommand
// crosses (Supabase Storage) — real PDF-render + cloud upload has no place
// in a test asserting DB-layer behavior; mocked the same way mailer.ts is.
const { renderSignedDocumentPdfMock, uploadPartnerDocumentMock } = vi.hoisted(() => ({
  renderSignedDocumentPdfMock: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
  uploadPartnerDocumentMock: vi.fn().mockResolvedValue({ path: "qa/fake.pdf", bucket: "qa-bucket" }),
}));
vi.mock("../services/partnerDocuments.js", () => ({
  renderSignedDocumentPdf: renderSignedDocumentPdfMock,
  uploadPartnerDocument: uploadPartnerDocumentMock,
}));

const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "neosleep";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function buildTestContext(client: Parameters<typeof CreateLeadCommand>[0]["client"]): Promise<TenantContext> {
  const email = `qa-invite-cmd-${uniqueSuffix()}@neosleepcare.com`;
  const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
  const user = await insertStaffUser(client, email, "QA", "Pilot", "admin", hash, false);
  return {
    slug: TENANT_SLUG,
    client,
    user: { id: user!.id, email, role: "admin", roles: [{ role: "admin", territory_id: await getGlobalTerritoryId(client) }] },
    requestId: `test-${uniqueSuffix()}`,
  };
}

// A 1x1 transparent PNG data URL — satisfies AcceptPractitionerInviteCommand's
// SIGNATURE_DATA_URL_RE without needing a real captured signature.
const FAKE_SIGNATURE_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

beforeEach(() => {
  sendPartnerJoinThankYouEmailMock.mockClear();
  sendPartnerInviteEmailMock.mockClear();
  renderSignedDocumentPdfMock.mockClear();
  uploadPartnerDocumentMock.mockClear();
});

describe("InvitePractitionerCommand", () => {
  // InvitePractitionerCommand only sends a holding "thank you" email — no
  // registration link/token yet. The actual set-password invite is deferred
  // to ActivatePractitionerCommand (see practitioner.ts / practitioner.spec.ts),
  // once training/capacitation is finished.
  // Longer timeout: several sequential DB round trips (create lead, insert
  // staff user, insert practitioner, audit log) against the shared dev
  // Supabase — the default 5s can be tight over a real network connection,
  // same reasoning as practitioner.spec.ts's ActivatePractitionerCommand test.
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
});

describe("AcceptPractitionerInviteCommand", () => {
  // Mints a real invite token by going through CreatePractitionerCommand +
  // ActivatePractitionerCommand (both already exercised in
  // practitioner.spec.ts) rather than inserting an invite_tokens row by
  // hand — the point of this test is specifically the effect of *accepting*
  // that real token, not a hand-crafted fixture.
  async function activateAndCaptureToken(
    ctx: TenantContext,
    email: string
  ): Promise<{ practitionerId: string; token: string }> {
    const practitioner = await CreatePractitionerCommand(ctx, {
      first_name: "Accept",
      last_name: "Flow",
      email,
      phone: "600100200",
    });
    await ActivatePractitionerCommand(ctx, practitioner.id);
    const registerLink = sendPartnerInviteEmailMock.mock.calls.at(-1)![1] as string;
    const token = new URL(registerLink).searchParams.get("token")!;
    return { practitionerId: practitioner.id, token };
  }

  // Regression test for the bug this whole feature started from (see
  // docs/stories/practitioner-invite-resend.md): completing registration is
  // the ONLY moment practitioner.status should become "active" — Activate/
  // Resend itself only ever gets it to "invited" (see practitioner.spec.ts).
  it("flips practitioner.status to 'active' once the doctor actually completes registration", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const email = `qa-accept-${uniqueSuffix()}@example.com`;
      const { practitionerId, token } = await activateAndCaptureToken(ctx, email);

      const before = await getPractitionerById(client, practitionerId);
      expect(before?.status).toBe("invited");

      await AcceptPractitionerInviteCommand(
        client,
        {
          token,
          password: "correct-horse-battery-staple",
          clinicName: "Accept Flow Clinic",
          taxId: "1234567890",
          billingAddress: "Some street 1, 00-000 City",
          gdprAccepted: true,
          agreementAccepted: true,
          signatureDataUrl: FAKE_SIGNATURE_DATA_URL,
        },
        { requestId: `test-${uniqueSuffix()}`, ip: null, userAgent: null }
      );

      const after = await getPractitionerById(client, practitionerId);
      expect(after?.status).toBe("active");
    });
  }, 20000);
});
