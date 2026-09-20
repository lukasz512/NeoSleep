import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcrypt";
import {
  withTenant,
  insertStaffUser,
  getGlobalTerritoryId,
  getCountryTerritoryId,
  insertPractitioner,
  getUserIdByEmail,
  getUserRoleScopes,
  getInviteTokenByHash,
  updatePractitionerStatus,
  getPractitionerById,
} from "../db.js";
import { hashToken } from "../utils/hashToken.js";
import type { TenantContext } from "../context/TenantContext.js";
import { ConflictError, ValidationError } from "../errors.js";
import { CreatePractitionerCommand, ActivatePractitionerCommand, UpdatePractitionerCommand } from "./practitioner.js";

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
    user: { id: user!.id, email, role: "admin", roles: [{ role: "admin", territory_id: await getGlobalTerritoryId(client) }] },
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
        phone: "600100200",
      });

      const result = await ActivatePractitionerCommand(ctx, practitioner.id);

      // Not "active" — that now only happens once the doctor actually
      // completes registration via AcceptPractitionerInviteCommand (see
      // docs/stories/practitioner-invite-resend.md). Activate/Resend only
      // ever gets the practitioner as far as "invited".
      expect(result?.status).toBe("invited");
      expect(sendPartnerInviteEmailMock).toHaveBeenCalledTimes(1);
      const [to, , , sender] = sendPartnerInviteEmailMock.mock.calls[0]!;
      expect(to).toBe(practitionerEmail);
      expect(sender).toEqual({ name: "NeoSleep", email: ctx.user.email });
    });
  }, 15000);

  it("resend (calling Activate again while still 'invited') mints a fresh token, invalidates the previous one, and sends another email", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const practitionerEmail = `qa-hcp-${uniqueSuffix()}@example.com`;
      const practitioner = await CreatePractitionerCommand(ctx, {
        first_name: "Resend",
        last_name: "Case",
        email: practitionerEmail,
        phone: "600100200",
      });

      const first = await ActivatePractitionerCommand(ctx, practitioner.id);
      expect(first?.status).toBe("invited");
      const second = await ActivatePractitionerCommand(ctx, practitioner.id);
      expect(second?.status).toBe("invited");

      expect(sendPartnerInviteEmailMock).toHaveBeenCalledTimes(2);
      const firstToken = new URL(sendPartnerInviteEmailMock.mock.calls[0]![1] as string).searchParams.get("token")!;
      const secondToken = new URL(sendPartnerInviteEmailMock.mock.calls[1]![1] as string).searchParams.get("token")!;
      expect(secondToken).not.toBe(firstToken);

      // The first email's link must no longer work — resend invalidates it,
      // not just leaves it to expire 7 days later alongside a second valid one.
      expect(await getInviteTokenByHash(client, hashToken(firstToken))).toBeNull();
      expect(await getInviteTokenByHash(client, hashToken(secondToken))).not.toBeNull();
    });
  }, 20000);

  it("returns null for a non-existent practitioner and never calls the mailer", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);

      const result = await ActivatePractitionerCommand(ctx, "00000000-0000-0000-0000-000000000000");

      expect(result).toBeNull();
      expect(sendPartnerInviteEmailMock).not.toHaveBeenCalled();
    });
  });

  it("throws ConflictError when the practitioner is already active (doctor actually completed registration)", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const practitioner = await CreatePractitionerCommand(ctx, {
        first_name: "Already",
        last_name: "Active",
        email: `qa-hcp-${uniqueSuffix()}@example.com`,
        phone: "600100200",
      });
      // Simulate the doctor having actually finished registration (the real
      // trigger is AcceptPractitionerInviteCommand, exercised end-to-end in
      // invitePractitioner.spec.ts — forcing the status directly here keeps
      // this test focused on ActivatePractitionerCommand's own guard, same
      // "insert directly to reach a state the command flow itself can't
      // produce" precedent as the no-email test below).
      await updatePractitionerStatus(client, practitioner.id, "active");
      sendPartnerInviteEmailMock.mockClear();

      await expect(ActivatePractitionerCommand(ctx, practitioner.id)).rejects.toThrow(ConflictError);
      expect(sendPartnerInviteEmailMock).not.toHaveBeenCalled();
    });
  }, 15000);

  it("throws ConflictError when the practitioner has been manually deactivated", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const practitioner = await CreatePractitionerCommand(ctx, {
        first_name: "Manually",
        last_name: "Deactivated",
        email: `qa-hcp-${uniqueSuffix()}@example.com`,
        phone: "600100200",
      });
      await updatePractitionerStatus(client, practitioner.id, "inactive");

      await expect(ActivatePractitionerCommand(ctx, practitioner.id)).rejects.toThrow(ConflictError);
      expect(sendPartnerInviteEmailMock).not.toHaveBeenCalled();
    });
  }, 15000);

  it("throws ValidationError when the practitioner has no email", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      // CreatePractitionerCommand now requires email/phone (HCO/HCP/Patient
      // data-quality refactor), so a no-email row can no longer be produced
      // through the command — insert directly to simulate legacy data that
      // predates that requirement, which ActivatePractitionerCommand's own
      // defensive check still has to guard against.
      const practitioner = await insertPractitioner(client, {
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
        phone: "600100200",
        country_code: "MX",
      });
      expect(practitioner.country_code).toBe("MX");

      await ActivatePractitionerCommand(ctx, practitioner.id);

      const userId = await getUserIdByEmail(client, email);
      expect(userId).not.toBeNull();
      const roles = await getUserRoleScopes(client, userId!);
      const mxTerritoryId = await getCountryTerritoryId(client, "MX");
      expect(roles).toContainEqual({ role: "doctor", territory_id: mxTerritoryId });
    });
  }, 15000);

  it("reuses an existing users account (does not re-provision a duplicate) but still sends the invite, since the practitioner itself isn't active/inactive yet", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const email = `qa-hcp-${uniqueSuffix()}@example.com`;

      // Pre-existing account for this email, unrelated to this practitioner
      // record — mirrors a doctor who already has a login (e.g. from a
      // different practitioner record sharing the same email) before this
      // HCP row is activated. insertStaffUser would throw a unique-email
      // conflict if the command incorrectly tried to create a second one —
      // that's the real regression this test guards against now, not
      // whether an email gets sent (it should: this practitioner's own
      // status is still "pending_approval", so nothing blocks it).
      const hash = await bcrypt.hash("irrelevant", 4);
      const existingUser = await insertStaffUser(client, email, "Existing", "Doctor", "doctor", hash, false);

      const practitioner = await CreatePractitionerCommand(ctx, {
        first_name: "Existing",
        last_name: "Doctor",
        email,
        phone: "600100200",
      });

      const result = await ActivatePractitionerCommand(ctx, practitioner.id);

      expect(result?.status).toBe("invited");
      expect(sendPartnerInviteEmailMock).toHaveBeenCalledTimes(1);
      expect(await getUserIdByEmail(client, email)).toBe(existingUser!.id);
    });
  }, 15000);
});

describe("UpdatePractitionerCommand", () => {
  // Regression test: editing a practitioner's email to one already used by
  // another identity used to bubble up as an opaque DatabaseError/503
  // ("duplicate key value violates unique constraint identities_email_key")
  // instead of a clean, user-facing conflict — see errors.ts's DatabaseError.
  it("throws ConflictError, not a raw DatabaseError, when the new email is already taken by another identity", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const takenEmail = `qa-hcp-${uniqueSuffix()}@example.com`;
      await CreatePractitionerCommand(ctx, {
        first_name: "Existing",
        last_name: "Owner",
        email: takenEmail,
        phone: "600100200",
      });
      const practitioner = await CreatePractitionerCommand(ctx, {
        first_name: "Being",
        last_name: "Edited",
        email: `qa-hcp-${uniqueSuffix()}@example.com`,
        phone: "600100200",
      });

      await expect(
        UpdatePractitionerCommand(ctx, practitioner.id, { email: takenEmail })
      ).rejects.toThrow(ConflictError);
    });
  }, 15000);

  // Admin-only manual status override — the recovery tool for a
  // practitioner stuck in a state the normal Activate/Resend/Accept flow
  // can't get them out of (see docs/stories/practitioner-invite-resend.md
  // and apps/pwa/src/config/forms/hcpForm.ts's STATUS_OPTIONS).
  it("lets an admin directly override status (e.g. resetting a stuck 'active' test record back to pending_approval)", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const practitioner = await CreatePractitionerCommand(ctx, {
        first_name: "Stuck",
        last_name: "Active",
        email: `qa-hcp-${uniqueSuffix()}@example.com`,
        phone: "600100200",
      });
      await updatePractitionerStatus(client, practitioner.id, "active");

      const after = await UpdatePractitionerCommand(ctx, practitioner.id, { status: "pending_approval" });

      expect(after?.status).toBe("pending_approval");
    });
  }, 15000);

  it("rejects a status override attempt from a non-admin (manager) role", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const adminCtx = await buildTestContext(client);
      const practitioner = await CreatePractitionerCommand(adminCtx, {
        first_name: "Guarded",
        last_name: "ByRole",
        email: `qa-hcp-${uniqueSuffix()}@example.com`,
        phone: "600100200",
      });

      const managerEmail = `qa-practitioner-cmd-mgr-${uniqueSuffix()}@neosleepcare.com`;
      const managerHash = await bcrypt.hash("irrelevant", 4);
      const managerUser = await insertStaffUser(client, managerEmail, "QA", "Manager", "manager", managerHash, false);
      const managerCtx: TenantContext = {
        slug: TENANT_SLUG,
        client,
        user: {
          id: managerUser!.id,
          email: managerEmail,
          role: "manager",
          roles: [{ role: "manager", territory_id: await getGlobalTerritoryId(client) }],
        },
        requestId: `test-${uniqueSuffix()}`,
      };

      await expect(
        UpdatePractitionerCommand(managerCtx, practitioner.id, { status: "active" })
      ).rejects.toThrow(ValidationError);

      // Not silently ignored either — the whole request must be rejected,
      // not "succeed but drop the status field".
      const unchanged = await getPractitionerById(client, practitioner.id);
      expect(unchanged?.status).toBe("pending_approval");
    });
  }, 15000);
});
