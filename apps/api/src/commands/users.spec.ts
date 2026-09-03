import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcrypt";
import { withTenant, insertStaffUser } from "../db.js";
import type { TenantContext } from "../context/TenantContext.js";
import { ForbiddenError } from "../errors.js";
import { CreateUserCommand, UpdateUserCommand, DeleteUserCommand, ResetUserPasswordCommand } from "./users.js";

// mailer.ts is the external boundary (Resend) — mocked here, same pattern as
// commands/invitePractitioner.spec.ts / leadOffer.spec.ts, per CLAUDE.md's
// "No mock-only tests" rule (scoped to Postgres, not third-party APIs).
const { sendPasswordResetEmailMock } = vi.hoisted(() => ({
  sendPasswordResetEmailMock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../mailer.js", () => ({ sendPasswordResetEmail: sendPasswordResetEmailMock }));

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
    user: { id: user!.id, email, role: "admin", roles: [{ role: "admin", scope: "global" }] },
    requestId: `test-${uniqueSuffix()}`,
  };
}

beforeEach(() => {
  sendPasswordResetEmailMock.mockClear();
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
      });

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
      });
      const mxTarget = await CreateUserCommand(adminCtx, {
        first_name: "MX", last_name: `Target-${uniqueSuffix()}`,
        email: `qa-scope-mx-${uniqueSuffix()}@neosleepcare.com`,
        role: "rep", country_code: "MX",
      });

      const managerEmail = `qa-scope-manager-${uniqueSuffix()}@neosleepcare.com`;
      const managerHash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
      const manager = await insertStaffUser(
        client, managerEmail, "QA", "Manager", "manager", managerHash, false,
        null, null, "PL"
      );
      const managerCtx: TenantContext = {
        slug: TENANT_SLUG,
        client,
        user: { id: manager!.id, email: managerEmail, role: "manager", roles: [{ role: "manager", scope: "PL" }] },
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
      });

      const updated = await UpdateUserCommand(adminCtx, mxTarget.id, { phone: "+52555000000" });
      expect(updated?.phone).toBe("+52555000000");
    });
  }, 15000);
});
