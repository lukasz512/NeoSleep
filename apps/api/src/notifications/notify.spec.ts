import { describe, it, expect } from "vitest";
import bcrypt from "bcrypt";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { withTenant, insertStaffUser } from "../db.js";
import { getNotificationDeliveries } from "../db/notification.js";
import { notify, GROUP_WINDOW_MINUTES } from "./notify.js";

const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "neosleep";

async function recipient(client: PoolClient, language = "en"): Promise<string> {
  const email = `qa-notify-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@neosleepcare.com`;
  const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
  const user = await insertStaffUser(client, email, "QA", "Notify", "admin", hash, false);
  await client.query("UPDATE identities SET language = $2 WHERE id = $1", [user!.identity_id, language]);
  return user!.identity_id;
}

async function rowsFor(client: PoolClient, identityId: string, entityId: string) {
  const { rows } = await client.query(
    "SELECT id, title, body, category, priority, group_count, action_url, entity_type FROM notification WHERE identity_id = $1 AND entity_id = $2 ORDER BY created_at",
    [identityId, entityId]
  );
  return rows;
}

describe("notify()", () => {
  it("writes one inbox row with catalog metadata, plus one delivery per channel", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const who = await recipient(client);
      const entityId = randomUUID();
      await notify(client, { type: "appointment_booked", recipients: [who], entityId });

      const rows = await rowsFor(client, who, entityId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        title: "New appointment booked",
        category: "operational",
        priority: "normal",
        group_count: 1,
        action_url: "/calendar",
        entity_type: "Appointment",
      });

      const deliveries = await getNotificationDeliveries(client, rows[0].id);
      expect(deliveries.map((d) => [d.channel, d.status])).toEqual([
        ["in_app", "delivered"],
        ["push", "pending"],
      ]);
    });
  });

  it("folds an identical event within the window into the same row and queues no second push", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const who = await recipient(client);
      const entityId = randomUUID();
      await notify(client, { type: "appointment_rescheduled", recipients: [who], entityId });
      await notify(client, { type: "appointment_rescheduled", recipients: [who], entityId });

      const rows = await rowsFor(client, who, entityId);
      expect(rows).toHaveLength(1);
      expect(rows[0].group_count).toBe(2);
      expect(rows[0].body).toBe("2 updates — open NeoSleep to see them.");
      expect(await getNotificationDeliveries(client, rows[0].id)).toHaveLength(2);
    });
  });

  it("starts a new row once the window has passed or the old one was read", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const who = await recipient(client);
      const entityId = randomUUID();
      await notify(client, { type: "appointment_cancelled", recipients: [who], entityId });
      await client.query(
        "UPDATE notification SET updated_at = now() - make_interval(mins => $2) WHERE identity_id = $1",
        [who, GROUP_WINDOW_MINUTES + 1]
      );
      await notify(client, { type: "appointment_cancelled", recipients: [who], entityId });
      await client.query("UPDATE notification SET read_at = now() WHERE identity_id = $1", [who]);
      await notify(client, { type: "appointment_cancelled", recipients: [who], entityId });

      const rows = await rowsFor(client, who, entityId);
      expect(rows.map((r) => r.group_count)).toEqual([1, 1, 1]);
    });
  });

  it("writes copy in the recipient's language", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const pl = await recipient(client, "pl");
      const mx = await recipient(client, "mx");
      const entityId = randomUUID();
      await notify(client, { type: "appointment_booked", recipients: [pl, mx], entityId });

      expect((await rowsFor(client, pl, entityId))[0].title).toBe("Nowa wizyta umówiona");
      expect((await rowsFor(client, mx, entityId))[0].title).toBe("Nueva cita agendada");
    });
  });

  it("skips the actor and duplicate recipients", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const actor = await recipient(client);
      const other = await recipient(client);
      const entityId = randomUUID();
      const { notifications } = await notify(client, {
        type: "appointment_booked",
        recipients: [actor, other, other],
        entityId,
        actorIdentityId: actor,
      });

      expect(notifications).toHaveLength(1);
      expect(await rowsFor(client, actor, entityId)).toHaveLength(0);
      expect(await rowsFor(client, other, entityId)).toHaveLength(1);
    });
  });

  it("never puts meta (which may name a patient) into title or body", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const who = await recipient(client);
      const entityId = randomUUID();
      const sentinel = "Sentinel-Patient-Kowalska";
      await notify(client, {
        type: "partner_order_status_changed",
        recipients: [who],
        entityId,
        link: { patientId: randomUUID() },
        meta: { patientName: sentinel, externalStatus: "2" },
      });

      const [row] = await rowsFor(client, who, entityId);
      expect(`${row.title} ${row.body}`).not.toContain(sentinel);
    });
  });
});
