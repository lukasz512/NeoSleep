import { describe, it, expect } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { app } from "../server.js";
import { withTenant, insertStaffUser } from "../db.js";
import { signAuthToken } from "../utils/jwt.js";
import type { StaffRole } from "../db/users.js";

/**
 * CORE-69: push subscription routes had no requireAuth / withTenant — anyone
 * could call them and writes weren't tenant-scoped. These cover the fix
 * through the real Express stack and real Postgres (CLAUDE.md: "No mock-only
 * tests for the API server").
 */
const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";

async function staff(role: StaffRole): Promise<{ id: string; auth: string }> {
  return withTenant(TENANT_SLUG, async (client) => {
    const email = `qa-push-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@neosleepcare.com`;
    const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
    const user = await insertStaffUser(client, email, "QA", "Push", role, hash, false);
    return {
      id: user!.id,
      auth: `Bearer ${signAuthToken({ id: user!.id, email, role, token_version: 0 })}`,
    };
  });
}

function endpointFor(label: string): string {
  return `https://fcm.googleapis.com/fcm/send/qa-push-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function rowCount(endpoint: string): Promise<number> {
  return withTenant(TENANT_SLUG, async (client) => {
    const { rowCount } = await client.query("SELECT 1 FROM push_subscription WHERE endpoint = $1", [endpoint]);
    return rowCount ?? 0;
  });
}

describe("push subscription routes", () => {
  it("rejects an unauthenticated subscribe with 401 and writes no row", async () => {
    const endpoint = endpointFor("anon-sub");
    const res = await request(app)
      .post("/api/v1/push/subscribe")
      .send({ endpoint, keys: { p256dh: "p256dh-value", auth: "auth-value" } });

    expect(res.status).toBe(401);
    expect(await rowCount(endpoint)).toBe(0);
  });

  it("rejects an unauthenticated unsubscribe with 401", async () => {
    const res = await request(app).delete("/api/v1/push/subscribe").send({ endpoint: endpointFor("anon-del") });
    expect(res.status).toBe(401);
  });

  it("lets an authenticated user subscribe, scoped to their own tenant schema row", async () => {
    const me = await staff("rep");
    const endpoint = endpointFor("own-sub");

    const res = await request(app)
      .post("/api/v1/push/subscribe")
      .set("Authorization", me.auth)
      .send({ endpoint, keys: { p256dh: "p256dh-value", auth: "auth-value" } });

    expect(res.status).toBe(204);

    const row = await withTenant(TENANT_SLUG, async (client) => {
      const { rows } = await client.query<{ user_id: string }>(
        "SELECT user_id FROM push_subscription WHERE endpoint = $1",
        [endpoint]
      );
      return rows[0];
    });
    expect(row?.user_id).toBe(me.id);
  });

  it("lets a user delete their own subscription", async () => {
    const me = await staff("rep");
    const endpoint = endpointFor("own-del");

    await request(app)
      .post("/api/v1/push/subscribe")
      .set("Authorization", me.auth)
      .send({ endpoint, keys: { p256dh: "p256dh-value", auth: "auth-value" } });

    const del = await request(app).delete("/api/v1/push/subscribe").set("Authorization", me.auth).send({ endpoint });
    expect(del.status).toBe(204);
    expect(await rowCount(endpoint)).toBe(0);
  });

  it("returns 404 when a user tries to delete someone else's subscription, and leaves it in place", async () => {
    const owner = await staff("rep");
    const intruder = await staff("rep");
    const endpoint = endpointFor("other-del");

    await request(app)
      .post("/api/v1/push/subscribe")
      .set("Authorization", owner.auth)
      .send({ endpoint, keys: { p256dh: "p256dh-value", auth: "auth-value" } });

    const del = await request(app)
      .delete("/api/v1/push/subscribe")
      .set("Authorization", intruder.auth)
      .send({ endpoint });
    expect(del.status).toBe(404);
    expect(await rowCount(endpoint)).toBe(1);
  });

  it("returns 404 deleting an endpoint that was never subscribed", async () => {
    const me = await staff("rep");
    const del = await request(app)
      .delete("/api/v1/push/subscribe")
      .set("Authorization", me.auth)
      .send({ endpoint: endpointFor("never-subscribed") });
    expect(del.status).toBe(404);
  });
});
