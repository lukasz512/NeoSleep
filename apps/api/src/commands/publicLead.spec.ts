import { describe, it, expect } from "vitest";
import { withTenant } from "../db.js";
import { UpsertPublicLeadCommand } from "./lead.js";
import { GetPublicLeadInfoQuery } from "../queries/lead.js";
import { ValidationError } from "../errors.js";

// Command/query-level integration test — hits the real tenant DB via
// withTenant(), per CLAUDE.md's "No mock-only tests for the API server"
// rule. Needs a running Postgres with this tenant's migrations applied
// (pnpm start / docker compose). No session/staff user involved — these are
// the public, unauthenticated write/read paths for the booking widget.
const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "neosleep";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

describe("UpsertPublicLeadCommand", () => {
  it("creates a new doctor lead with metadata.demoBookedAt when leadId is absent", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const email = `qa-public-lead-${uniqueSuffix()}@example.com`;
      const lead = await UpsertPublicLeadCommand(
        client,
        {
          first_name: "Anna",
          last_name: "Dentist",
          email,
          phone: "+48123456789",
          institution: "Acme Dental",
          city: "Warsaw",
          country_code: "PL",
        },
        { requestId: `test-${uniqueSuffix()}` }
      );

      expect(lead.type).toBe("doctor");
      expect(lead.source).toBe("website");
      expect(lead.status).toBe("new");
      expect(lead.metadata?.demoBookedAt).toEqual(expect.any(String));
      expect(lead.metadata?.city).toBe("Warsaw");
      expect(lead.metadata?.country_code).toBe("PL");
    });
  });

  it("throws ValidationError when institution is missing", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      await expect(
        UpsertPublicLeadCommand(
          client,
          { first_name: "No", last_name: "Clinic", email: `qa-${uniqueSuffix()}@example.com`, institution: "" },
          { requestId: `test-${uniqueSuffix()}` }
        )
      ).rejects.toThrow(ValidationError);
    });
  });

  it("fills in missing fields on an existing lead without clobbering what's already set", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const email = `qa-public-lead-existing-${uniqueSuffix()}@example.com`;
      const requestId = `test-${uniqueSuffix()}`;

      const created = await UpsertPublicLeadCommand(
        client,
        { first_name: "Piotr", last_name: "Existing", email, phone: "+48000000000", institution: "Original Clinic" },
        { requestId }
      );

      const updated = await UpsertPublicLeadCommand(
        client,
        {
          leadId: created.id,
          first_name: "Piotr",
          last_name: "Existing",
          email,
          phone: "+48999999999", // should NOT overwrite the phone already on file
          institution: "Attempted Overwrite Clinic",
          city: "Mexico City",
        },
        { requestId }
      );

      expect(updated.id).toBe(created.id);
      expect(updated.phone).toBe("+48000000000");
      expect(updated.metadata?.institution).toBe("Original Clinic");
      expect(updated.metadata?.city).toBe("Mexico City"); // was empty before — fine to fill in
      expect(updated.metadata?.demoBookedAt).toEqual(expect.any(String));
    });
  });
});

describe("GetPublicLeadInfoQuery", () => {
  it("returns only the narrow prefill fields", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const email = `qa-public-lead-query-${uniqueSuffix()}@example.com`;
      const lead = await UpsertPublicLeadCommand(
        client,
        { first_name: "Query", last_name: "Test", email, institution: "Query Clinic", city: "Gdansk", country_code: "PL" },
        { requestId: `test-${uniqueSuffix()}` }
      );

      const info = await GetPublicLeadInfoQuery(client, lead.id);

      expect(info).toEqual({
        id: lead.id,
        first_name: "Query",
        last_name: "Test",
        email,
        phone: "",
        institution: "Query Clinic",
        country_code: "PL",
        city: "Gdansk",
      });
    });
  });

  it("returns null for a non-existent lead", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const info = await GetPublicLeadInfoQuery(client, "00000000-0000-0000-0000-000000000000");
      expect(info).toBeNull();
    });
  });
});
