import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcrypt";
import { withTenant, insertStaffUser } from "../db.js";
import type { TenantContext } from "../context/TenantContext.js";
import { ValidationError } from "../errors.js";
import { CreateLeadCommand, SendLeadOfferEmailCommand } from "./lead.js";

// mailer.ts is the external boundary (Resend, see ADR-016) — mocked here, per
// CLAUDE.md's "No mock-only tests" rule (that rule is scoped to Postgres, not
// third-party paid APIs — this only covers the mailer call itself, not the DB;
// withTenant() below still hits the real tenant DB, same as lead.spec.ts).
// vi.mock's factory is hoisted above any top-level const, so the mock fn must
// come from vi.hoisted to be referenceable both inside the factory and below.
// localeForRegion is kept real via importActual — it's pure sync logic lead.ts
// also imports from mailer.js, no reason to duplicate it in the mock (and
// omitting it here previously broke every test in this file: lead.ts calls it
// unconditionally, so a mock missing that export throws immediately).
const { sendLeadOfferEmailMock } = vi.hoisted(() => ({
  sendLeadOfferEmailMock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../mailer.js", async (importActual) => ({
  ...(await importActual<typeof import("../mailer.js")>()),
  sendLeadOfferEmail: sendLeadOfferEmailMock,
}));

const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "neosleep";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function buildTestContext(client: Parameters<typeof CreateLeadCommand>[0]["client"]): Promise<TenantContext> {
  const email = `qa-lead-offer-${uniqueSuffix()}@neosleepcare.com`;
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
  sendLeadOfferEmailMock.mockClear();
});

describe("SendLeadOfferEmailCommand", () => {
  it("sends the offer email and stamps metadata.offerSentAt without losing existing metadata", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const leadEmail = `qa-dentist-${uniqueSuffix()}@example.com`;
      const lead = await CreateLeadCommand(ctx, {
        first_name: "Anna",
        last_name: "Dentist",
        type: "doctor",
        email: leadEmail,
        region: "PL",
        metadata: { institution: "Acme Dental" },
      });

      const after = await SendLeadOfferEmailCommand(ctx, lead.id);

      expect(sendLeadOfferEmailMock).toHaveBeenCalledWith(
        leadEmail,
        expect.objectContaining({ offerLink: expect.stringContaining("for-professionals") }),
        expect.objectContaining({ language: "pl" }),
        { name: ctx.user.name ?? "NeoSleep", email: ctx.user.email }
      );
      expect(after?.metadata?.offerSentAt).toEqual(expect.any(String));
      expect(after?.metadata?.institution).toBe("Acme Dental");
    });
  });

  // Regression test: "send offer to the doctor" is meant to look like it came
  // from the rep who made the call (Alfred, Weronika, ...), not a faceless
  // system sender — see mailer.ts's EmailSender doc comment and mailer.spec.ts's
  // "send-as-rep (Reply-To)" tests for the mailer-level behavior this depends on.
  it("passes the calling rep's own identity as the email sender", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const leadEmail = `qa-doctor-${uniqueSuffix()}@example.com`;
      const lead = await CreateLeadCommand(ctx, {
        first_name: "Jan", last_name: "Kowalski", type: "doctor", email: leadEmail,
        metadata: { institution: "Acme Clinic" },
      });

      await SendLeadOfferEmailCommand(ctx, lead.id);

      expect(sendLeadOfferEmailMock).toHaveBeenCalledTimes(1);
      const [, , , sender] = sendLeadOfferEmailMock.mock.calls[0]!;
      // ctx.user has no `name` in this test fixture (buildTestContext doesn't set
      // one) — asserting the "NeoSleep" fallback here doubles as coverage for
      // that no-display-name path, not just the happy path with a real rep name.
      expect(sender).toEqual({ name: "NeoSleep", email: ctx.user.email });
    });
  });

  it("throws ValidationError when the lead has no email", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const lead = await CreateLeadCommand(ctx, { first_name: "No", last_name: "Email", type: "other", metadata: {} });

      await expect(SendLeadOfferEmailCommand(ctx, lead.id)).rejects.toThrow(ValidationError);
      expect(sendLeadOfferEmailMock).not.toHaveBeenCalled();
    });
  });

  it("returns null for a non-existent lead", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const result = await SendLeadOfferEmailCommand(ctx, "00000000-0000-0000-0000-000000000000");
      expect(result).toBeNull();
      expect(sendLeadOfferEmailMock).not.toHaveBeenCalled();
    });
  });
});
