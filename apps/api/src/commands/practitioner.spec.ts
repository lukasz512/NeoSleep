import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcrypt";
import { withTenant, insertStaffUser, getUserIdByEmail, getUserRoleScopes } from "../db.js";
import type { TenantContext } from "../context/TenantContext.js";
import { ConflictError, ValidationError } from "../errors.js";
import { CreatePractitionerCommand, ActivatePractitionerCommand } from "./practitioner.js";

// mailer.ts is the external boundary (Resend, see ADR-016) — mocked here, same
// pattern as commands/leadOffer.spec.ts. Only sendPartnerInviteEmail is used by
// this file's commands, but the mock still spreads the real module so any other
// export practitioner.ts pulls from mailer.js in the future doesn't silently
// break by being missing from an incomplete mock (see leadOffer.spec.ts's
// history for exactly that failure mode).
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
  const email = `qa-practitioner-cmd-${uniqueSuffix()}@neosleepcare.com`;
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
  sendPartnerInviteEmailMock.mockClear();
});

describe("ActivatePractitionerCommand", () => {
  // Regression test companion to leadOffer.spec.ts's — "send offer to the
  // doctor" and "invite this practitioner" are both meant to look like they
  // came from the admin/manager who triggered them, not a faceless system
  // sender (see mailer.ts's EmailSender doc comment).
  // Longer timeout: this does several sequential DB round trips
  // (create practitioner, activate, insert staff user, create invite token)
  // against the shared dev Supabase — the default 5s can be tight over a
  // real network connection, unlike a local Postgres.
  it("passes the activating admin/manager's own identity as the invite email sender", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const practitionerEmail = `qa-hcp-${uniqueSuffix()}@example.com`;
      const practitioner = await CreatePractitionerCommand(ctx, {
        first_name: "Jan",
        last_name: "Nowak",
        email: practitionerEmail,
      });

      const result = await ActivatePractitionerCommand(ctx, practitioner.id);

      expect(result?.status).toBe("active");
      expect(sendPartnerInviteEmailMock).toHaveBeenCalledTimes(1);
      const [to, , , sender] = sendPartnerInviteEmailMock.mock.calls[0]!;
      expect(to).toBe(practitionerEmail);
      expect(sender).toEqual({ name: "NeoSleep", email: ctx.user.email });
    });
  }, 15000);

  it("returns null for a non-existent practitioner and never calls the mailer", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);

      const result = await ActivatePractitionerCommand(ctx, "00000000-0000-0000-0000-000000000000");

      expect(result).toBeNull();
      expect(sendPartnerInviteEmailMock).not.toHaveBeenCalled();
    });
  });

  it("throws ConflictError when the practitioner is already active", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const practitioner = await CreatePractitionerCommand(ctx, {
        first_name: "Already",
        last_name: "Active",
        email: `qa-hcp-${uniqueSuffix()}@example.com`,
      });
      await ActivatePractitionerCommand(ctx, practitioner.id);
      sendPartnerInviteEmailMock.mockClear();

      await expect(ActivatePractitionerCommand(ctx, practitioner.id)).rejects.toThrow(ConflictError);
      expect(sendPartnerInviteEmailMock).not.toHaveBeenCalled();
    });
  }, 15000);

  it("throws ValidationError when the practitioner has no email", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const practitioner = await CreatePractitionerCommand(ctx, {
        first_name: "No",
        last_name: "Email",
      });

      await expect(ActivatePractitionerCommand(ctx, practitioner.id)).rejects.toThrow(ValidationError);
      expect(sendPartnerInviteEmailMock).not.toHaveBeenCalled();
    });
  });

  // Regression test for a real bug this thread's own test-writing caught:
  // insertPractitioner selected identities.country_code but never wrote it,
  // so every activated doctor silently got scope='global' instead of their
  // actual country — see db/practitioner.ts's INSERT and commands/
  // invitePractitioner.ts's insertPractitioner call (both now pass
  // country_code through from the originating lead).
  it("provisions the doctor-role user scoped to the practitioner's own country_code, not global", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const email = `qa-hcp-${uniqueSuffix()}@example.com`;
      const practitioner = await CreatePractitionerCommand(ctx, {
        first_name: "Maria",
        last_name: "Gonzalez",
        email,
        country_code: "MX",
      });
      expect(practitioner.country_code).toBe("MX");

      await ActivatePractitionerCommand(ctx, practitioner.id);

      const userId = await getUserIdByEmail(client, email);
      expect(userId).not.toBeNull();
      const roles = await getUserRoleScopes(client, userId!);
      expect(roles).toContainEqual({ role: "doctor", scope: "MX" });
    });
  }, 15000);

  it("does not re-provision a user or resend the invite when one already exists for this identity", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const email = `qa-hcp-${uniqueSuffix()}@example.com`;

      // Pre-existing account for this email, unrelated to this practitioner
      // record — mirrors a doctor who's already a live platform user before
      // this HCP row's own training is (re-)marked finished.
      const hash = await bcrypt.hash("irrelevant", 4);
      await insertStaffUser(client, email, "Existing", "Doctor", "doctor", hash, false);

      const practitioner = await CreatePractitionerCommand(ctx, {
        first_name: "Existing",
        last_name: "Doctor",
        email,
      });

      await ActivatePractitionerCommand(ctx, practitioner.id);

      expect(sendPartnerInviteEmailMock).not.toHaveBeenCalled();
    });
  }, 15000);
});
