import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcrypt";
import { withTenant, insertStaffUser } from "../db.js";
import type { TenantContext } from "../context/TenantContext.js";
import { CreateLeadCommand } from "./lead.js";
import { InvitePractitionerCommand } from "./invitePractitioner.js";

// mailer.ts is the external boundary (Resend) — mocked here, same as
// commands/leadOffer.spec.ts's approach, per CLAUDE.md's "No mock-only tests"
// rule (scoped to Postgres, not third-party APIs — see ADR-016). vi.mock's
// factory is hoisted above any top-level const, so the mock fn itself must be
// created via vi.hoisted to be referenceable both inside the factory and below.
const { sendPartnerJoinThankYouEmailMock } = vi.hoisted(() => ({
  sendPartnerJoinThankYouEmailMock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../mailer.js", () => ({ sendPartnerJoinThankYouEmail: sendPartnerJoinThankYouEmailMock }));

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
    user: { id: user!.id, email, role: "admin", roles: [{ role: "admin", scope: "global" }] },
    requestId: `test-${uniqueSuffix()}`,
  };
}

beforeEach(() => {
  sendPartnerJoinThankYouEmailMock.mockClear();
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
