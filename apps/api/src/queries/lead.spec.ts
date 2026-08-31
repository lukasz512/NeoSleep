import { describe, it, expect } from "vitest";
import bcrypt from "bcrypt";
import { withTenant, insertStaffUser } from "../db.js";
import type { TenantContext } from "../context/TenantContext.js";
import type { StaffRole } from "../db/users.js";
import { CreateLeadCommand, UpdateLeadCommand } from "../commands/lead.js";
import { GetLeadListQuery, GetLeadByIdQuery } from "./lead.js";

// Integration test — hits the real tenant DB via withTenant(), per CLAUDE.md's
// "No mock-only tests for the API server" rule.
const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "neosleep";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function buildTestContext(
  client: Parameters<typeof CreateLeadCommand>[0]["client"],
  role: StaffRole
): Promise<TenantContext> {
  const email = `qa-lead-query-${role}-${uniqueSuffix()}@neosleepcare.com`;
  const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
  const user = await insertStaffUser(client, email, "QA", "Pilot", role, hash, false);
  return {
    slug: TENANT_SLUG,
    client,
    user: { id: user!.id, email, role, roles: [{ role, scope: "global" }] },
    requestId: `test-${uniqueSuffix()}`,
  };
}

describe("GetLeadListQuery / GetLeadByIdQuery — 'declined' admin-only visibility", () => {
  it("admin sees a declined lead in the list and by id; a rep sees neither, even with an explicit status filter", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const adminCtx = await buildTestContext(client, "admin");
      const repCtx = await buildTestContext(client, "rep");

      const lead = await CreateLeadCommand(adminCtx, {
        first_name: "Declined", last_name: `Lead-${uniqueSuffix()}`, type: "doctor",
        metadata: { institution: "Acme Clinic" },
      });
      await UpdateLeadCommand(adminCtx, lead.id, { status: "declined" });

      const adminList = await GetLeadListQuery(adminCtx, { status: "declined" });
      expect(adminList.items.some((i) => i.id === lead.id)).toBe(true);

      const repList = await GetLeadListQuery(repCtx, { status: "declined" });
      expect(repList.items.some((i) => i.id === lead.id)).toBe(false);

      const adminGet = await GetLeadByIdQuery(adminCtx, lead.id);
      expect(adminGet?.id).toBe(lead.id);

      const repGet = await GetLeadByIdQuery(repCtx, lead.id);
      expect(repGet).toBeNull();
    });
  }, 15000);

  it("a non-declined lead is visible to both admin and rep", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const adminCtx = await buildTestContext(client, "admin");
      const repCtx = await buildTestContext(client, "rep");

      const lead = await CreateLeadCommand(adminCtx, {
        first_name: "Active", last_name: `Lead-${uniqueSuffix()}`, type: "doctor",
        metadata: { institution: "Acme Clinic" },
      });

      expect((await GetLeadByIdQuery(adminCtx, lead.id))?.id).toBe(lead.id);
      expect((await GetLeadByIdQuery(repCtx, lead.id))?.id).toBe(lead.id);
    });
  }, 15000);
});
