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
const { sendPartnerInviteEmailMock } = vi.hoisted(() => ({
  sendPartnerInviteEmailMock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../mailer.js", () => ({ sendPartnerInviteEmail: sendPartnerInviteEmailMock }));

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
    user: { id: user!.id, email, role: "admin" },
    requestId: `test-${uniqueSuffix()}`,
  };
}

beforeEach(() => {
  sendPartnerInviteEmailMock.mockClear();
});

describe("InvitePractitionerCommand", () => {
  // Regression test for the same bug as auth-frontend-origin.spec.ts (see
  // apps/api/src/auth.ts / utils/frontendOrigin.ts): this command used to build
  // registerLink by interpolating the raw, possibly comma-separated FRONTEND_URL
  // directly — commands have no req/res, so the caller (routes/leads.ts) now
  // resolves and passes a single frontendOrigin explicitly instead.
  it("builds the register link from the passed frontendOrigin, not a hardcoded/raw value", async () => {
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

      expect(sendPartnerInviteEmailMock).toHaveBeenCalledTimes(1);
      const [to, registerLink] = sendPartnerInviteEmailMock.mock.calls[0]!;
      expect(to).toBe(doctorEmail);
      expect(registerLink).toMatch(new RegExp(`^${frontendOrigin}/partner-register\\?token=`));
      expect(registerLink).not.toContain(",");
    });
  });
});
