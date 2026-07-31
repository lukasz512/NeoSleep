import { describe, it, expect, beforeAll } from "vitest";
import bcrypt from "bcrypt";
import { withTenant, insertStaffUser } from "../db.js";
import type { TenantContext } from "../context/TenantContext.js";
import { CreateLeadCommand } from "./lead.js";
import { ValidationError } from "../errors.js";

// Command-level integration test — hits the real tenant DB via withTenant(),
// per CLAUDE.md's "No mock-only tests for the API server" rule. Needs a running
// Postgres with this tenant's migrations applied (pnpm start / docker compose).
const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "neosleep";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function buildTestContext(client: Parameters<typeof CreateLeadCommand>[0]["client"]): Promise<TenantContext> {
  const email = `qa-lead-cmd-${uniqueSuffix()}@neosleepcare.com`;
  const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
  const user = await insertStaffUser(client, email, "QA", "Pilot", "admin", hash, false);
  return {
    slug: TENANT_SLUG,
    client,
    user: { id: user!.id, email, role: "admin" },
    requestId: `test-${uniqueSuffix()}`,
  };
}

describe("CreateLeadCommand", () => {
  it("requires institution only for a doctor lead", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);

      await expect(
        CreateLeadCommand(ctx, {
          first_name: "Anna", last_name: "Doctor", type: "doctor", metadata: {},
        }),
      ).rejects.toThrow(ValidationError);

      const doctor = await CreateLeadCommand(ctx, {
        first_name: "Anna", last_name: "Doctor", type: "doctor",
        metadata: { institution: "Acme Clinic" },
      });
      expect(doctor.type).toBe("doctor");
    });
  });

  it("does not require institution for a patient lead", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);

      const patient = await CreateLeadCommand(ctx, {
        first_name: "Piotr", last_name: "Patient", type: "patient",
        metadata: { diagnosis: "Suspected sleep apnea" },
      });
      expect(patient.type).toBe("patient");
    });
  });

  it("does not require institution for hospital/pharmacy/other leads", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);

      for (const type of ["hospital", "pharmacy", "other"] as const) {
        const lead = await CreateLeadCommand(ctx, {
          first_name: "Test", last_name: type, type, metadata: {},
        });
        expect(lead.type).toBe(type);
      }
    });
  });
});
