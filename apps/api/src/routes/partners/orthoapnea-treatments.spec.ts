import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect, vi, afterEach } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { app } from "../../server.js";
import { withTenant, insertStaffUser } from "../../db.js";
import { getPartnerLink } from "../../db/partnerLink.js";
import type { TenantContext } from "../../context/TenantContext.js";
import { CreatePatientCommand } from "../../commands/patient.js";
import { CreateSleepStudyCommand } from "../../commands/sleepStudy.js";
import { CreateTreatmentPlanCommand } from "../../commands/treatmentPlan.js";
import { createOrthoApneaTreatment } from "../../services/partners/orthoapnea.js";
import { signAuthToken } from "../../utils/jwt.js";

// Loaded via fs rather than a static JSON import — see orthoapnea-order.spec.ts's own comment.
const treatmentDtoFixture = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../services/partners/__fixtures__/orthoapnea/treatmentDto.json", import.meta.url)), "utf-8")
) as Record<string, unknown>;

/**
 * GET /partners/orthoapnea/treatments/:id/transactions — admin-only route
 * exposing full request/response JSON exchanged with OrthoApnea (see that
 * route's own doc comment / ADR-017). Real Postgres per CLAUDE.md's "no
 * mock-only tests" rule; only the OrthoApnea HTTP boundary (global fetch) and
 * the auth token are stubbed/signed directly rather than going through a full
 * login POST — requireRole() only checks the JWT's own role claim, no DB
 * lookup, so a directly-signed token exercises the exact same code path a
 * real login-issued one would.
 */
vi.setConfig({ testTimeout: 30_000 });

const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function fakeJwt(expiresInSeconds: number): string {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expiresInSeconds })).toString(
    "base64url"
  );
  return `header.${payload}.signature`;
}

function tokenFor(role: "admin" | "rep"): string {
  return signAuthToken(
    { id: crypto.randomUUID(), email: `qa-txn-log-${uniqueSuffix()}@neosleepcare.com`, role, token_version: 0 },
    { rememberMe: false }
  );
}

async function buildTestContext(client: Parameters<typeof CreatePatientCommand>[0]["client"]): Promise<TenantContext> {
  const email = `qa-txn-log-setup-${uniqueSuffix()}@neosleepcare.com`;
  const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
  const user = await insertStaffUser(client, email, "QA", "Pilot", "admin", hash, false);
  return {
    slug: TENANT_SLUG,
    client,
    user: { id: user!.id, email, role: "admin", roles: [{ role: "admin", scope: "global" }] },
    requestId: `test-${uniqueSuffix()}`,
  };
}

const createdPartnerLinkIds: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  if (createdPartnerLinkIds.length > 0) {
    const ids = createdPartnerLinkIds.splice(0, createdPartnerLinkIds.length);
    await withTenant(TENANT_SLUG, (client) => client.query("DELETE FROM partner_link WHERE id = ANY($1)", [ids]));
  }
});

describe("GET /api/v1/partners/orthoapnea/treatments/:treatmentPlanId/transactions", () => {
  it("401s with no token at all", async () => {
    const res = await request(app).get("/api/v1/partners/orthoapnea/treatments/some-id/transactions");
    expect(res.status).toBe(401);
  });

  it("403s for a non-admin role", async () => {
    const res = await request(app)
      .get("/api/v1/partners/orthoapnea/treatments/some-id/transactions")
      .set("Authorization", `Bearer ${tokenFor("rep")}`);
    expect(res.status).toBe(403);
  });

  it("200s with an empty history for a treatment_plan never submitted to OrthoApnea", async () => {
    const plan = await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const patient = await CreatePatientCommand(ctx, { first_name: "Test", last_name: `Patient-${uniqueSuffix()}` });
      const study = await CreateSleepStudyCommand(ctx, { patient_id: patient.id });
      return CreateTreatmentPlanCommand(ctx, { patient_id: patient.id, sleep_study_id: study.id, type: "dental_appliance" });
    });

    const res = await request(app)
      .get(`/api/v1/partners/orthoapnea/treatments/${plan.id}/transactions`)
      .set("Authorization", `Bearer ${tokenFor("admin")}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ link: null, transactions: [] });
  });

  it("200s with the link and every partner_transaction row, newest first, for a submitted order", async () => {
    const plan = await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const patient = await CreatePatientCommand(ctx, { first_name: "Test", last_name: `Patient-${uniqueSuffix()}` });
      const study = await CreateSleepStudyCommand(ctx, { patient_id: patient.id });
      return CreateTreatmentPlanCommand(ctx, { patient_id: patient.id, sleep_study_id: study.id, type: "dental_appliance" });
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/login")) return { ok: true, status: 200, json: async () => ({ token: fakeJwt(1800) }) } as Response;
        if (url.includes("/api/treatments")) return { ok: true, status: 200, json: async () => treatmentDtoFixture } as Response;
        throw new Error(`Unmocked fetch call in test: ${url}`);
      })
    );

    const wizardPayload = { product: { id: 3 }, retrusionMax: -5, protrusionMax: 5 };
    await createOrthoApneaTreatment(TENANT_SLUG, plan.id, wizardPayload);
    const link = await withTenant(TENANT_SLUG, (client) => getPartnerLink(client, "orthoapnea", "treatment_plan", plan.id));
    createdPartnerLinkIds.push(link!.id);

    const res = await request(app)
      .get(`/api/v1/partners/orthoapnea/treatments/${plan.id}/transactions`)
      .set("Authorization", `Bearer ${tokenFor("admin")}`);

    expect(res.status).toBe(200);
    expect(res.body.link).toMatchObject({ id: link!.id, sync_status: "synced", external_status: "1" });
    expect(res.body.transactions).toHaveLength(1);
    expect(res.body.transactions[0]).toMatchObject({
      action: "create_treatment",
      success: true,
      request_payload: wizardPayload,
    });

    // The "identical JSON" invariant (see ADR-017 / orthoapnea.spec.ts): the
    // exact object built for the HTTP request body is what's stored and
    // returned here — not a re-serialized or partially-dropped copy.
    expect(res.body.transactions[0].request_payload).toEqual(wizardPayload);
  });
});
