import { describe, it, expect } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import type { PoolClient } from "pg";
import { app } from "../server.js";
import { withTenant, insertStaffUser, getGlobalTerritoryId } from "../db.js";
import { getCountryTerritoryId } from "../db/territory.js";
import { signAuthToken } from "../utils/jwt.js";

/**
 * Route-level test — real Postgres per CLAUDE.md's "no mock-only tests" rule;
 * the auth token is signed directly for a real inserted user (same pattern as
 * routes/territory.spec.ts), so buildContext() loads that user's live role
 * scope the way a login-issued token would.
 *
 * CORE-249: the lead routes dropped `territory_id` from the body, so every
 * lead was created without a territory and the CORE-226 write guard in the
 * lead commands could never fire through the API.
 */
const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function insertScopedUser(client: PoolClient, role: "admin" | "rep", territoryId: string): Promise<string> {
  const email = `qa-lead-route-${role}-${uniqueSuffix()}@neosleepcare.com`;
  const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
  const user = await insertStaffUser(client, email, "QA", "Pilot", role, hash, false, null, null, territoryId);
  return signAuthToken({ id: user!.id, email, role, token_version: 0 });
}

async function setup(): Promise<{ adminToken: string; mxRepToken: string; mxId: string; plId: string }> {
  return withTenant(TENANT_SLUG, async (client) => {
    const plId = await getCountryTerritoryId(client, "PL");
    const mxId = await getCountryTerritoryId(client, "MX");
    if (!plId || !mxId) throw new Error("PL/MX country territory not seeded");
    return {
      adminToken: await insertScopedUser(client, "admin", await getGlobalTerritoryId(client)),
      mxRepToken: await insertScopedUser(client, "rep", mxId),
      mxId,
      plId,
    };
  });
}

function leadBody(territoryId?: string | null): Record<string, unknown> {
  return {
    first_name: "QA",
    last_name: `Lead-${uniqueSuffix()}`,
    type: "patient",
    metadata: {},
    ...(territoryId !== undefined ? { territory_id: territoryId } : {}),
  };
}

describe("POST /api/v1/lead — territory (CORE-249)", () => {
  it("stores the territory the caller sends when it is inside their scope", async () => {
    const { mxRepToken, mxId } = await setup();
    const res = await request(app).post("/api/v1/lead").set("Authorization", `Bearer ${mxRepToken}`).send(leadBody(mxId));
    expect(res.status).toBe(201);
    expect(res.body.territory_id).toBe(mxId);
  }, 20000);

  it("refuses a territory outside the caller's scope, naming the reason", async () => {
    const { mxRepToken, plId } = await setup();
    const res = await request(app).post("/api/v1/lead").set("Authorization", `Bearer ${mxRepToken}`).send(leadBody(plId));
    expect(res.status).toBe(403);
    expect(res.body.reason).toBe("OUTSIDE_TERRITORY");
  }, 20000);

  it("still creates a lead with no territory when none is sent", async () => {
    const { mxRepToken } = await setup();
    const res = await request(app).post("/api/v1/lead").set("Authorization", `Bearer ${mxRepToken}`).send(leadBody());
    expect(res.status).toBe(201);
    expect(res.body.territory_id).toBeNull();
  }, 20000);
});

describe("PATCH /api/v1/lead/:id — territory (CORE-249)", () => {
  it("sets, keeps and clears the territory inside the caller's scope", async () => {
    const { mxRepToken, mxId } = await setup();
    const auth = `Bearer ${mxRepToken}`;
    const created = await request(app).post("/api/v1/lead").set("Authorization", auth).send(leadBody());
    const url = `/api/v1/lead/${created.body.id}`;

    const set = await request(app).patch(url).set("Authorization", auth).send({ territory_id: mxId });
    expect(set.status).toBe(200);
    expect(set.body.territory_id).toBe(mxId);

    // A save that does not mention the territory leaves it alone.
    const untouched = await request(app).patch(url).set("Authorization", auth).send({ first_name: "Renamed" });
    expect(untouched.status).toBe(200);
    expect(untouched.body.territory_id).toBe(mxId);

    const cleared = await request(app).patch(url).set("Authorization", auth).send({ territory_id: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.territory_id).toBeNull();
  }, 20000);

  it("refuses moving a lead to a territory outside the caller's scope", async () => {
    const { mxRepToken, mxId, plId } = await setup();
    const auth = `Bearer ${mxRepToken}`;
    const created = await request(app).post("/api/v1/lead").set("Authorization", auth).send(leadBody(mxId));

    const res = await request(app).patch(`/api/v1/lead/${created.body.id}`).set("Authorization", auth).send({ territory_id: plId });
    expect(res.status).toBe(403);
    expect(res.body.reason).toBe("OUTSIDE_TERRITORY");
  }, 20000);

  it("refuses any edit of a lead that sits outside the caller's scope", async () => {
    const { adminToken, mxRepToken, plId } = await setup();
    const created = await request(app).post("/api/v1/lead").set("Authorization", `Bearer ${adminToken}`).send(leadBody(plId));
    expect(created.status).toBe(201);

    const res = await request(app)
      .patch(`/api/v1/lead/${created.body.id}`)
      .set("Authorization", `Bearer ${mxRepToken}`)
      .send({ first_name: "Renamed" });
    expect(res.status).toBe(403);
    expect(res.body.reason).toBe("OUTSIDE_TERRITORY");
  }, 20000);
});
