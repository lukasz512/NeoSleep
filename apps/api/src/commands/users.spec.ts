import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcrypt";
import { randomUUID } from "node:crypto";
import { withTenant, insertStaffUser, getGlobalTerritoryId, getCountryTerritoryId } from "../db.js";
import type { TenantContext } from "../context/TenantContext.js";
import { ForbiddenError, ValidationError } from "../errors.js";
import { CreateUserCommand, UpdateUserCommand, DeleteUserCommand, ResetUserPasswordCommand } from "./users.js";

// mailer.ts is the external boundary (Resend) — mocked here, same pattern as
// commands/invitePractitioner.spec.ts / leadOffer.spec.ts, per CLAUDE.md's
// "No mock-only tests" rule (scoped to Postgres, not third-party APIs).
const { sendPasswordResetEmailMock, sendAccountCreatedEmailMock } = vi.hoisted(() => ({
  sendPasswordResetEmailMock: vi.fn().mockResolvedValue(undefined),
  sendAccountCreatedEmailMock: vi.fn().mockResolvedValue("msg-test-id"),
}));
vi.mock("../mailer.js", () => ({
  sendPasswordResetEmail: sendPasswordResetEmailMock,
  sendAccountCreatedEmail: sendAccountCreatedEmailMock,
}));

const FRONTEND_ORIGIN = "https://pwa.neosleepcare.com";

const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "neosleep";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function buildTestContext(client: Parameters<typeof CreateUserCommand>[0]["client"]): Promise<TenantContext> {
  const email = `qa-admin-reset-cmd-${uniqueSuffix()}@neosleepcare.com`;
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
  sendPasswordResetEmailMock.mockClear();
  sendAccountCreatedEmailMock.mockReset();
  sendAccountCreatedEmailMock.mockImplementation(async () => `msg-${randomUUID()}`);
});

describe("ResetUserPasswordCommand", () => {
  // Regression test for the same bug as auth-frontend-origin.spec.ts and
  // invitePractitioner.spec.ts: this admin-triggered reset command built
  // resetLink by interpolating the raw, possibly comma-separated FRONTEND_URL
  // directly — commands have no req/res, so the caller (routes/users.ts) now
  // resolves and passes a single frontendOrigin explicitly instead.
  it("builds the reset link from the passed frontendOrigin, not a hardcoded/raw value", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const targetEmail = `qa-admin-reset-target-${uniqueSuffix()}@neosleepcare.com`;
      const target = await CreateUserCommand(ctx, {
        first_name: "Target", last_name: "User", email: targetEmail, role: "rep",
      }, FRONTEND_ORIGIN);

      const frontendOrigin = "https://pwa.neosleepcare.com";
      await ResetUserPasswordCommand(ctx, target.id, frontendOrigin);

      expect(sendPasswordResetEmailMock).toHaveBeenCalledTimes(1);
      const [to, resetLink] = sendPasswordResetEmailMock.mock.calls[0]!;
      expect(to).toBe(targetEmail);
      expect(resetLink).toMatch(new RegExp(`^${frontendOrigin}/reset-password\\?token=`));
      expect(resetLink).not.toContain(",");
    });
  });
});

describe("UpdateUserCommand / DeleteUserCommand — country-scope enforcement", () => {
  it("a country-scoped manager can act on a user in their own country but is blocked (ForbiddenError) from one in a different country", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const adminCtx = await buildTestContext(client);

      const plTarget = await CreateUserCommand(adminCtx, {
        first_name: "PL", last_name: `Target-${uniqueSuffix()}`,
        email: `qa-scope-pl-${uniqueSuffix()}@neosleepcare.com`,
        role: "rep", country_code: "PL",
      }, FRONTEND_ORIGIN);
      const mxTarget = await CreateUserCommand(adminCtx, {
        first_name: "MX", last_name: `Target-${uniqueSuffix()}`,
        email: `qa-scope-mx-${uniqueSuffix()}@neosleepcare.com`,
        role: "rep", country_code: "MX",
      }, FRONTEND_ORIGIN);

      const plTerritoryId = await getCountryTerritoryId(client, "PL");
      if (!plTerritoryId) throw new Error("PL territory not seeded — check migrations/002_seed.sql");

      const managerEmail = `qa-scope-manager-${uniqueSuffix()}@neosleepcare.com`;
      const managerHash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
      const manager = await insertStaffUser(
        client, managerEmail, "QA", "Manager", "manager", managerHash, false,
        null, null, plTerritoryId
      );
      const managerCtx: TenantContext = {
        slug: TENANT_SLUG,
        client,
        user: { id: manager!.id, email: managerEmail, role: "manager", roles: [{ role: "manager", territory_id: plTerritoryId }] },
        requestId: `test-${uniqueSuffix()}`,
      };

      // In-scope: same country — allowed.
      const updated = await UpdateUserCommand(managerCtx, plTarget.id, { phone: "+48500600700" });
      expect(updated?.phone).toBe("+48500600700");

      // Out-of-scope: different country — blocked, not silently no-op'd.
      await expect(UpdateUserCommand(managerCtx, mxTarget.id, { phone: "+52555000000" })).rejects.toThrow(ForbiddenError);
      await expect(DeleteUserCommand(managerCtx, mxTarget.id)).rejects.toThrow(ForbiddenError);

      // In-scope delete — allowed (cleans up the PL target this test created).
      await expect(DeleteUserCommand(managerCtx, plTarget.id)).resolves.not.toThrow();
    });
  }, 15000);

  it("a global-scoped role can act on a user in any country", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const adminCtx = await buildTestContext(client);

      const mxTarget = await CreateUserCommand(adminCtx, {
        first_name: "MX", last_name: `Target-${uniqueSuffix()}`,
        email: `qa-scope-global-${uniqueSuffix()}@neosleepcare.com`,
        role: "rep", country_code: "MX",
      }, FRONTEND_ORIGIN);

      const updated = await UpdateUserCommand(adminCtx, mxTarget.id, { phone: "+52555000000" });
      expect(updated?.phone).toBe("+52555000000");
    });
  }, 15000);
});

// Regression coverage for the "role must be one of: ..." bug (a doctor
// user's unrelated fields couldn't be edited because their unchanged role
// round-tripped through VALID_ROLES), plus the new admin-only role-change
// rule. See docs/ADR-014-practitioner-doctor-identity-and-geography.md for
// why 'doctor' is excluded from VALID_ROLES in the first place.
describe("UpdateUserCommand / CreateUserCommand — role-change authorization", () => {
  async function buildManagerContext(client: Parameters<typeof CreateUserCommand>[0]["client"]): Promise<TenantContext> {
    const email = `qa-role-manager-${uniqueSuffix()}@neosleepcare.com`;
    const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
    const globalTerritoryId = await getGlobalTerritoryId(client);
    const manager = await insertStaffUser(client, email, "QA", "Manager", "manager", hash, false, null, null, globalTerritoryId ?? undefined);
    return {
      slug: TENANT_SLUG,
      client,
      user: { id: manager!.id, email, role: "manager", roles: [{ role: "manager", territory_id: globalTerritoryId }] },
      requestId: `test-${uniqueSuffix()}`,
    };
  }

  it("editing an existing doctor user's unrelated fields succeeds when role round-trips unchanged", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const adminCtx = await buildTestContext(client);
      const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
      const doctorEmail = `qa-role-doctor-${uniqueSuffix()}@neosleepcare.com`;
      // Bypasses CreateUserCommand deliberately — 'doctor' is only ever
      // created via InvitePractitionerCommand in real usage; this seeds an
      // equivalent row directly, same technique as the manager fixture above.
      const doctor = await insertStaffUser(client, doctorEmail, "QA", "Doctor", "doctor", hash, false);

      const updated = await UpdateUserCommand(adminCtx, doctor!.id, { role: "doctor", phone: "+48500600701" });
      expect(updated?.phone).toBe("+48500600701");
      expect(updated?.role).toBe("doctor");
    });
  }, 15000);

  it("a manager can set any role except admin/support, and cannot touch admin/support accounts (NEO-266)", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const adminCtx = await buildTestContext(client);
      const managerCtx = await buildManagerContext(client);

      const target = await CreateUserCommand(adminCtx, {
        first_name: "QA", last_name: `RoleTarget-${uniqueSuffix()}`,
        email: `qa-role-target-${uniqueSuffix()}@neosleepcare.com`,
        role: "rep",
      }, FRONTEND_ORIGIN);

      await expect(UpdateUserCommand(managerCtx, target.id, { role: "admin" })).rejects.toThrow(ForbiddenError);
      await expect(UpdateUserCommand(managerCtx, target.id, { role: "support" })).rejects.toThrow(ForbiddenError);
      await expect(UpdateUserCommand(managerCtx, target.id, { role: "manager" })).resolves.not.toThrow();

      const adminTarget = await CreateUserCommand(adminCtx, {
        first_name: "QA", last_name: `AdminTarget-${uniqueSuffix()}`,
        email: `qa-admin-target-${uniqueSuffix()}@neosleepcare.com`,
        role: "admin",
      }, FRONTEND_ORIGIN);
      await expect(UpdateUserCommand(managerCtx, adminTarget.id, { phone: "+48500600703" })).rejects.toThrow(ForbiddenError);
      // Unrelated field, no role change — still allowed for a manager.
      await expect(UpdateUserCommand(managerCtx, target.id, { phone: "+48500600702" })).resolves.not.toThrow();
    });
  }, 15000);

  it("a manager cannot create a user with a non-default role (ForbiddenError), but a default rep is fine", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const managerCtx = await buildManagerContext(client);

      await expect(
        CreateUserCommand(managerCtx, {
          first_name: "QA", last_name: `EscalationAttempt-${uniqueSuffix()}`,
          email: `qa-role-escalate-${uniqueSuffix()}@neosleepcare.com`,
          role: "admin",
        }, FRONTEND_ORIGIN)
      ).rejects.toThrow(ForbiddenError);

      const repUser = await CreateUserCommand(managerCtx, {
        first_name: "QA", last_name: `DefaultRep-${uniqueSuffix()}`,
        email: `qa-role-default-rep-${uniqueSuffix()}@neosleepcare.com`,
      }, FRONTEND_ORIGIN);
      expect(repUser.role).toBe("rep");
    });
  }, 15000);

  it("an admin still cannot set role to 'doctor' via CreateUserCommand/UpdateUserCommand", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const adminCtx = await buildTestContext(client);

      await expect(
        CreateUserCommand(adminCtx, {
          first_name: "QA", last_name: `DoctorAttempt-${uniqueSuffix()}`,
          email: `qa-role-doctor-attempt-${uniqueSuffix()}@neosleepcare.com`,
          role: "doctor",
        }, FRONTEND_ORIGIN)
      ).rejects.toThrow(ValidationError);

      const repTarget = await CreateUserCommand(adminCtx, {
        first_name: "QA", last_name: `DoctorSwitchAttempt-${uniqueSuffix()}`,
        email: `qa-role-doctor-switch-${uniqueSuffix()}@neosleepcare.com`,
        role: "rep",
      }, FRONTEND_ORIGIN);
      await expect(UpdateUserCommand(adminCtx, repTarget.id, { role: "doctor" })).rejects.toThrow(ValidationError);
    });
  }, 15000);
});
