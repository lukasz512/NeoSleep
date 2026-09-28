import { describe, it, expect } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { randomUUID } from "node:crypto";
import { app } from "../server.js";
import { withTenant, insertStaffUser } from "../db.js";
import { getNotificationDeliveries } from "../db/notification.js";
import { notify } from "../notifications/notify.js";
import { signAuthToken } from "../utils/jwt.js";
import type { StaffRole } from "../db/users.js";

/**
 * CORE-2: notification preferences through the real Express stack and real
 * Postgres — own matrix + quiet hours, locked categories, admin defaults, and
 * that notify() honours what was saved.
 */
const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";

async function staff(role: StaffRole): Promise<{ id: string; identityId: string; auth: string }> {
  return withTenant(TENANT_SLUG, async (client) => {
    const email = `qa-prefs-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@neosleepcare.com`;
    const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
    const user = await insertStaffUser(client, email, "QA", "Prefs", role, hash, false);
    return {
      id: user!.id,
      identityId: user!.identity_id,
      auth: `Bearer ${signAuthToken({ id: user!.id, email, role, token_version: 0 })}`,
    };
  });
}

describe("notification preferences API", () => {
  it("returns the effective matrix with defaults: everything on, security/legal locked, quiet 21–07", async () => {
    const me = await staff("doctor");
    const res = await request(app).get("/api/v1/notification/preferences").set("Authorization", me.auth);
    expect(res.status).toBe(200);
    expect(res.body.settings).toEqual({ quiet_enabled: true, quiet_from: "21:00", quiet_to: "07:00", digest_enabled: true, digest_time: "07:00" });
    const security = res.body.categories.find((c: { category: string }) => c.category === "security");
    expect(security.locked).toBe(true);
    const operational = res.body.categories.find((c: { category: string }) => c.category === "operational");
    expect(operational).toMatchObject({ locked: false, channels: { push: true, email: true } });
  });

  it("saves a channel switch and quiet hours, and notify() then skips that channel", async () => {
    const me = await staff("doctor");
    const put = await request(app)
      .put("/api/v1/notification/preferences")
      .set("Authorization", me.auth)
      .send({
        preferences: [{ category: "operational", channel: "push", enabled: false }],
        settings: { quiet_from: "22:00", quiet_to: "06:30", digest_enabled: false },
      });
    expect(put.status).toBe(200);
    expect(put.body.settings).toMatchObject({ quiet_from: "22:00", quiet_to: "06:30", digest_enabled: false, quiet_enabled: true });
    expect(put.body.categories.find((c: { category: string }) => c.category === "operational").channels.push).toBe(false);

    await withTenant(TENANT_SLUG, async (client) => {
      const { notifications } = await notify(client, { type: "appointment_booked", recipients: [me.identityId], entityId: randomUUID() });
      const deliveries = await getNotificationDeliveries(client, notifications[0]!.id);
      expect(deliveries.map((d) => d.channel)).toEqual(["in_app"]);
    });
  });

  it("rejects turning off a locked category and malformed input with 400", async () => {
    const me = await staff("manager");
    const locked = await request(app)
      .put("/api/v1/notification/preferences")
      .set("Authorization", me.auth)
      .send({ preferences: [{ category: "security", channel: "email", enabled: false }] });
    expect(locked.status).toBe(400);

    const badTime = await request(app).put("/api/v1/notification/preferences").set("Authorization", me.auth).send({ settings: { quiet_from: "25:00" } });
    const badChannel = await request(app)
      .put("/api/v1/notification/preferences")
      .set("Authorization", me.auth)
      .send({ preferences: [{ category: "operational", channel: "fax", enabled: true }] });
    expect([badTime.status, badChannel.status]).toEqual([400, 400]);
  });

  it("uses the person's country zone when identities.timezone is left at the UTC default", async () => {
    const me = await staff("doctor");
    await withTenant(TENANT_SLUG, (client) =>
      client.query("UPDATE identities SET timezone = 'UTC', country_code = 'MX' WHERE id = $1", [me.identityId])
    );
    const res = await request(app).get("/api/v1/notification/preferences").set("Authorization", me.auth);
    expect(res.body.timezone).toBe("America/Mexico_City");
  });

  it("requires login", async () => {
    expect((await request(app).get("/api/v1/notification/preferences")).status).toBe(401);
  });
});

describe("tenant notification defaults API", () => {
  it("is admin-only, and a default applies to users without their own setting", async () => {
    const admin = await staff("admin");
    const rep = await staff("rep");

    expect((await request(app).put("/api/v1/admin/notification-defaults").set("Authorization", rep.auth).send({ defaults: [] })).status).toBe(403);

    // marketing: no v1 event uses it, so flipping it can't disturb parallel specs
    const before = await request(app).get("/api/v1/admin/notification-defaults").set("Authorization", admin.auth);
    const previous = before.body.categories.find((c: { category: string }) => c.category === "marketing").channels.email as boolean;
    try {
      const put = await request(app)
        .put("/api/v1/admin/notification-defaults")
        .set("Authorization", admin.auth)
        .send({ defaults: [{ category: "marketing", channel: "email", enabled: false }] });
      expect(put.status).toBe(200);

      const repView = await request(app).get("/api/v1/notification/preferences").set("Authorization", rep.auth);
      expect(repView.body.categories.find((c: { category: string }) => c.category === "marketing").channels.email).toBe(false);
    } finally {
      await request(app)
        .put("/api/v1/admin/notification-defaults")
        .set("Authorization", admin.auth)
        .send({ defaults: [{ category: "marketing", channel: "email", enabled: previous }] });
    }
  });
});
