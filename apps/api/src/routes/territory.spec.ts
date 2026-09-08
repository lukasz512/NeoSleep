import { describe, it, expect } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { app } from "../server.js";
import { withTenant, insertStaffUser } from "../db.js";
import type { TenantContext } from "../context/TenantContext.js";
import { CreateTerritoryCommand } from "../commands/territory.js";
import { signAuthToken } from "../utils/jwt.js";

/**
 * Route-level auth boundary test — real Postgres per CLAUDE.md's "no
 * mock-only tests" rule; the auth token is signed directly rather than
 * going through a full login POST (same pattern as
 * routes/partners/orthoapnea-treatments.spec.ts) — requireRole()/requireAuth
 * only check the JWT's own claims, no DB lookup, so a directly-signed token
 * exercises the exact same code path a real login-issued one would.
 */
const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Routes here call buildContext() (TenantContext.ts), which re-checks the
 * token's user id against the LIVE users.token_version in the DB — unlike
 * requireAuth/requireRole, which only verify the JWT's own signature/expiry.
 * So a token for a nonexistent user id 401s with "Session has been
 * invalidated" the moment a route handler actually reaches buildContext,
 * even though requireAuth/requireRole let it through. A token has to be
 * signed for a real, inserted user to exercise the success path — 401/403
 * tests never reach buildContext, so a throwaway id is fine there.
 */
async function insertTestUser(
  client: Parameters<typeof CreateTerritoryCommand>[0]["client"],
  role: "admin" | "rep"
): Promise<{ id: string; email: string }> {
  const email = `qa-territory-route-${role}-${uniqueSuffix()}@neosleepcare.com`;
  const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
  const user = await insertStaffUser(client, email, "QA", "Pilot", role, hash, false);
  return { id: user!.id, email };
}

function tokenFor(user: { id: string; email: string }, role: "admin" | "rep"): string {
  return signAuthToken({ id: user.id, email: user.email, role, token_version: 0 }, { rememberMe: false });
}

function tokenForNonexistentUser(role: "admin" | "rep"): string {
  return signAuthToken(
    { id: crypto.randomUUID(), email: `qa-territory-route-${uniqueSuffix()}@neosleepcare.com`, role, token_version: 0 },
    { rememberMe: false }
  );
}

async function buildTestContext(client: Parameters<typeof CreateTerritoryCommand>[0]["client"]): Promise<TenantContext> {
  const user = await insertTestUser(client, "admin");
  return {
    slug: TENANT_SLUG,
    client,
    user: { id: user.id, email: user.email, role: "admin", roles: [{ role: "admin", scope: "global" }] },
    requestId: `test-${uniqueSuffix()}`,
  };
}

describe("GET /api/v1/territory", () => {
  it("401s with no token", async () => {
    const res = await request(app).get("/api/v1/territory");
    expect(res.status).toBe(401);
  });

  it("200s for a non-admin role — the patient form's territory picker needs to read this list too", async () => {
    const rep = await withTenant(TENANT_SLUG, (client) => insertTestUser(client, "rep"));
    const res = await request(app).get("/api/v1/territory").set("Authorization", `Bearer ${tokenFor(rep, "rep")}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("items");
  });
});

describe("POST /api/v1/territory (admin-only)", () => {
  it("401s with no token", async () => {
    const res = await request(app).post("/api/v1/territory").send({ name: "X", country_code: "MX", kind: "region" });
    expect(res.status).toBe(401);
  });

  it("403s for a non-admin role", async () => {
    const res = await request(app)
      .post("/api/v1/territory")
      .set("Authorization", `Bearer ${tokenForNonexistentUser("rep")}`)
      .send({ name: "X", country_code: "MX", kind: "region" });
    expect(res.status).toBe(403);
  });

  it("201s for an admin with valid input", async () => {
    const admin = await withTenant(TENANT_SLUG, (client) => insertTestUser(client, "admin"));
    const res = await request(app)
      .post("/api/v1/territory")
      .set("Authorization", `Bearer ${tokenFor(admin, "admin")}`)
      .send({ name: `Route-${uniqueSuffix()}`, country_code: "MX", kind: "region" });
    expect(res.status).toBe(201);
    expect(res.body.kind).toBe("region");
  });

  it("400s for an invalid kind, not a raw DB error", async () => {
    const admin = await withTenant(TENANT_SLUG, (client) => insertTestUser(client, "admin"));
    const res = await request(app)
      .post("/api/v1/territory")
      .set("Authorization", `Bearer ${tokenFor(admin, "admin")}`)
      .send({ name: `Route-${uniqueSuffix()}`, country_code: "MX", kind: "planet" });
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/v1/territory/:id and DELETE /api/v1/territory/:id (admin-only)", () => {
  it("403s a PATCH from a non-admin role", async () => {
    const territory = await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      return CreateTerritoryCommand(ctx, { name: `PatchGuard-${uniqueSuffix()}`, country_code: "MX", kind: "region" });
    });

    const res = await request(app)
      .patch(`/api/v1/territory/${territory.id}`)
      .set("Authorization", `Bearer ${tokenForNonexistentUser("rep")}`)
      .send({ name: "Renamed" });
    expect(res.status).toBe(403);
  });

  it("403s a DELETE from a non-admin role", async () => {
    const territory = await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      return CreateTerritoryCommand(ctx, { name: `DeleteGuard-${uniqueSuffix()}`, country_code: "MX", kind: "region" });
    });

    const res = await request(app)
      .delete(`/api/v1/territory/${territory.id}`)
      .set("Authorization", `Bearer ${tokenForNonexistentUser("rep")}`);
    expect(res.status).toBe(403);
  });
});
