import { describe, it, expect } from "vitest";
import bcrypt from "bcrypt";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { withTenant, insertStaffUser } from "../db.js";
import { insertNotification, insertNotificationDelivery } from "../db/notification.js";
import { NOTIFICATION_TYPES, getEventDefinition } from "../notifications/catalog.js";
import {
  MAX_DELIVERY_ATTEMPTS,
  backoffMinutes,
  createDefaultRegistry,
  type ChannelAdapter,
  type AdapterResult,
} from "../notifications/dispatcher.js";
import { RunNotificationTickForTenant } from "./notificationTick.js";

/**
 * CORE-3 — the notification tick, against the real "test" tenant schema.
 * Dispatcher tests use the sms channel with a stub adapter so they never touch
 * the push/email rows other specs leave pending.
 */

const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";
const MIN = 60_000;
const DAY = 86_400_000;

async function recipient(client: PoolClient): Promise<string> {
  const email = `qa-tick-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@neosleepcare.com`;
  const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
  const user = await insertStaffUser(client, email, "QA", "Tick", "admin", hash, false);
  return user!.identity_id;
}

async function makeNotification(
  client: PoolClient,
  type: string,
  opts: { createdAt?: Date; readAt?: Date | null } = {}
): Promise<string> {
  const who = await recipient(client);
  const n = await insertNotification(client, { identity_id: who, type, title: "t", entity_id: randomUUID() });
  await client.query("UPDATE notification SET created_at = COALESCE($2, created_at), read_at = $3 WHERE id = $1", [
    n.id,
    opts.createdAt ?? null,
    opts.readAt ?? null,
  ]);
  return n.id;
}

async function deliveryRows(client: PoolClient, notificationId: string) {
  const { rows } = await client.query<{ id: string; channel: string; status: string; attempts: number; not_before: Date; failed_reason: string | null; provider_message_id: string | null }>(
    "SELECT id, channel, status, attempts, not_before, failed_reason, provider_message_id FROM notification_delivery WHERE notification_id = $1 ORDER BY channel",
    [notificationId]
  );
  return rows;
}

function smsAdapter(handler: (id: string) => Promise<AdapterResult> | AdapterResult, calls: string[] = []): { registry: Map<string, ChannelAdapter>; calls: string[] } {
  const registry = createDefaultRegistry();
  registry.set("sms", {
    channel: "sms",
    isConfigured: () => true,
    send: async (d) => {
      calls.push(d.id);
      return handler(d.id);
    },
  });
  return { registry, calls };
}

const ESCALATING = NOTIFICATION_TYPES.find((t) => getEventDefinition(t).escalateAfterMin === 30)!;
const NON_ESCALATING = NOTIFICATION_TYPES.find((t) => getEventDefinition(t).escalateAfterMin === null)!;

describe("notification tick: dispatcher", () => {
  it("sends a due pending delivery once and records provider id; a repeat tick does nothing", async () => {
    const now = new Date();
    const { registry, calls } = smsAdapter(() => ({ kind: "sent", providerMessageId: "prov-1" }));
    const nid = await withTenant(TENANT_SLUG, async (c) => {
      const id = await makeNotification(c, NON_ESCALATING);
      await insertNotificationDelivery(c, id, "sms", new Date(now.getTime() - MIN));
      return id;
    });

    await RunNotificationTickForTenant(TENANT_SLUG, { now, registry });
    await RunNotificationTickForTenant(TENANT_SLUG, { now, registry });

    const rows = await withTenant(TENANT_SLUG, (c) => deliveryRows(c, nid));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "sent", attempts: 1, provider_message_id: "prov-1" });
    expect(calls.filter((id) => id === rows[0]!.id)).toHaveLength(1);
  });

  it("does not claim a delivery whose not_before is in the future (quiet hours)", async () => {
    const now = new Date();
    const { registry, calls } = smsAdapter(() => ({ kind: "sent" }));
    const { nid } = await withTenant(TENANT_SLUG, async (c) => {
      const id = await makeNotification(c, NON_ESCALATING);
      await insertNotificationDelivery(c, id, "sms", new Date(now.getTime() + 60 * MIN));
      return { nid: id };
    });
    await RunNotificationTickForTenant(TENANT_SLUG, { now, registry });
    const rows = await withTenant(TENANT_SLUG, (c) => deliveryRows(c, nid));
    expect(rows[0]!.status).toBe("pending");
    expect(calls).not.toContain(rows[0]!.id);
  });

  it("retries with backoff, then fails after MAX_DELIVERY_ATTEMPTS", async () => {
    let now = new Date();
    const { registry } = smsAdapter(() => ({ kind: "retry", reason: "provider 503" }));
    const nid = await withTenant(TENANT_SLUG, async (c) => {
      const id = await makeNotification(c, NON_ESCALATING);
      await insertNotificationDelivery(c, id, "sms", new Date(now.getTime() - MIN));
      return id;
    });

    await RunNotificationTickForTenant(TENANT_SLUG, { now, registry });
    let [row] = await withTenant(TENANT_SLUG, (c) => deliveryRows(c, nid));
    expect(row).toMatchObject({ status: "pending", attempts: 1, failed_reason: "provider 503" });
    expect(row!.not_before.getTime()).toBe(now.getTime() + backoffMinutes(1) * MIN);

    // Not due yet: an immediate second tick leaves it alone.
    await RunNotificationTickForTenant(TENANT_SLUG, { now, registry });
    [row] = await withTenant(TENANT_SLUG, (c) => deliveryRows(c, nid));
    expect(row!.attempts).toBe(1);

    for (let i = 2; i <= MAX_DELIVERY_ATTEMPTS; i++) {
      now = new Date(now.getTime() + 3 * 60 * MIN);
      await RunNotificationTickForTenant(TENANT_SLUG, { now, registry });
    }
    [row] = await withTenant(TENANT_SLUG, (c) => deliveryRows(c, nid));
    expect(row).toMatchObject({ status: "failed", attempts: MAX_DELIVERY_ATTEMPTS, failed_reason: "provider 503" });
  });

  it("an adapter that fails permanently fails the row at once; a throwing adapter retries", async () => {
    const now = new Date();
    const permanent = new Set<string>();
    const { registry } = smsAdapter((id) => {
      if (permanent.has(id)) return { kind: "failed", reason: "no address" };
      throw new Error("boom");
    });
    const [permNid, throwNid] = await withTenant(TENANT_SLUG, async (c) => {
      const a = await makeNotification(c, NON_ESCALATING);
      const b = await makeNotification(c, NON_ESCALATING);
      await insertNotificationDelivery(c, a, "sms", new Date(now.getTime() - MIN));
      await insertNotificationDelivery(c, b, "sms", new Date(now.getTime() - MIN));
      const [da] = await deliveryRows(c, a);
      permanent.add(da!.id);
      return [a, b];
    });
    await RunNotificationTickForTenant(TENANT_SLUG, { now, registry });
    const [perm] = await withTenant(TENANT_SLUG, (c) => deliveryRows(c, permNid!));
    const [thrown] = await withTenant(TENANT_SLUG, (c) => deliveryRows(c, throwNid!));
    expect(perm).toMatchObject({ status: "failed", failed_reason: "no address" });
    expect(thrown).toMatchObject({ status: "pending", attempts: 1, failed_reason: "boom" });
  });

  it("leaves rows of unconfigured channels pending, untouched (no adapters yet for push/email)", async () => {
    const now = new Date();
    const nid = await withTenant(TENANT_SLUG, async (c) => {
      const id = await makeNotification(c, NON_ESCALATING);
      await insertNotificationDelivery(c, id, "push", new Date(now.getTime() - MIN));
      return id;
    });
    await RunNotificationTickForTenant(TENANT_SLUG, { now });
    const [row] = await withTenant(TENANT_SLUG, (c) => deliveryRows(c, nid));
    expect(row).toMatchObject({ status: "pending", attempts: 0, failed_reason: null });
  });

  it("two concurrent ticks never double-claim a delivery", async () => {
    const now = new Date();
    const calls: string[] = [];
    const { registry } = smsAdapter(async () => {
      await new Promise((r) => setTimeout(r, 150));
      return { kind: "sent" };
    }, calls);
    const nids = await withTenant(TENANT_SLUG, async (c) => {
      const ids: string[] = [];
      for (let i = 0; i < 6; i++) {
        const id = await makeNotification(c, NON_ESCALATING);
        await insertNotificationDelivery(c, id, "sms", new Date(now.getTime() - MIN));
        ids.push(id);
      }
      return ids;
    });

    const [a, b] = await Promise.all([
      RunNotificationTickForTenant(TENANT_SLUG, { now, registry }),
      RunNotificationTickForTenant(TENANT_SLUG, { now, registry }),
    ]);
    expect(a.dispatch.sent + b.dispatch.sent).toBeGreaterThanOrEqual(6);

    const all = await withTenant(TENANT_SLUG, async (c) => {
      const out = [];
      for (const n of nids) out.push(...(await deliveryRows(c, n)));
      return out;
    });
    expect(all).toHaveLength(6);
    for (const d of all) {
      expect(d.status).toBe("sent");
      expect(d.attempts).toBe(1);
      expect(calls.filter((id) => id === d.id)).toHaveLength(1);
    }
  });
});

describe("notification tick: escalation", () => {
  it("creates one email delivery once a notification has been unread for 30 minutes, and not before", async () => {
    const now = new Date();
    const [young, old] = await withTenant(TENANT_SLUG, async (c) => [
      await makeNotification(c, ESCALATING, { createdAt: new Date(now.getTime() - 29 * MIN) }),
      await makeNotification(c, ESCALATING, { createdAt: new Date(now.getTime() - 31 * MIN) }),
    ]);

    await RunNotificationTickForTenant(TENANT_SLUG, { now });
    await RunNotificationTickForTenant(TENANT_SLUG, { now });
    await RunNotificationTickForTenant(TENANT_SLUG, { now: new Date(now.getTime() + 10 * MIN) });

    const youngRows = await withTenant(TENANT_SLUG, (c) => deliveryRows(c, young!));
    const oldRows = await withTenant(TENANT_SLUG, (c) => deliveryRows(c, old!));
    // The young one crossed 30 min only on the third tick (now + 10 min): still exactly one row.
    expect(youngRows.filter((r) => r.channel === "email")).toHaveLength(1);
    expect(oldRows.filter((r) => r.channel === "email")).toHaveLength(1);
    expect(oldRows.find((r) => r.channel === "email")!.status).toBe("pending");
  });

  it("does not escalate a notification that was already read, or a type that never escalates", async () => {
    const now = new Date();
    const old = new Date(now.getTime() - 45 * MIN);
    const [read, never] = await withTenant(TENANT_SLUG, async (c) => [
      await makeNotification(c, ESCALATING, { createdAt: old, readAt: new Date(now.getTime() - 40 * MIN) }),
      await makeNotification(c, NON_ESCALATING, { createdAt: old }),
    ]);
    await RunNotificationTickForTenant(TENANT_SLUG, { now });
    expect((await withTenant(TENANT_SLUG, (c) => deliveryRows(c, read!))).filter((r) => r.channel === "email")).toHaveLength(0);
    expect((await withTenant(TENANT_SLUG, (c) => deliveryRows(c, never!))).filter((r) => r.channel === "email")).toHaveLength(0);
  });

  it("does not duplicate an email delivery that already exists", async () => {
    const now = new Date();
    const nid = await withTenant(TENANT_SLUG, async (c) => {
      const id = await makeNotification(c, ESCALATING, { createdAt: new Date(now.getTime() - 60 * MIN) });
      await insertNotificationDelivery(c, id, "email", new Date(now.getTime() - 50 * MIN));
      return id;
    });
    await RunNotificationTickForTenant(TENANT_SLUG, { now });
    expect((await withTenant(TENANT_SLUG, (c) => deliveryRows(c, nid))).filter((r) => r.channel === "email")).toHaveLength(1);
  });
});

describe("notification tick: purge", () => {
  it("honours the 90-day read, 180-day unread and 1-year delivery-log windows", async () => {
    const now = new Date();
    const ids = await withTenant(TENANT_SLUG, async (c) => {
      const t = NON_ESCALATING;
      return {
        readOld: await makeNotification(c, t, { createdAt: new Date(now.getTime() - 200 * DAY), readAt: new Date(now.getTime() - 91 * DAY) }),
        readFresh: await makeNotification(c, t, { createdAt: new Date(now.getTime() - 200 * DAY), readAt: new Date(now.getTime() - 89 * DAY) }),
        unreadOld: await makeNotification(c, t, { createdAt: new Date(now.getTime() - 181 * DAY) }),
        unreadFresh: await makeNotification(c, t, { createdAt: new Date(now.getTime() - 179 * DAY) }),
        logOld: await makeNotification(c, t, { createdAt: new Date(now.getTime() - 2 * DAY) }),
        logFresh: await makeNotification(c, t, { createdAt: new Date(now.getTime() - 2 * DAY) }),
      };
    });
    await withTenant(TENANT_SLUG, async (c) => {
      await c.query(
        "INSERT INTO notification_delivery (notification_id, channel, status, created_at) VALUES ($1,'sms','sent',$3), ($2,'sms','sent',$4)",
        [ids.logOld, ids.logFresh, new Date(now.getTime() - 366 * DAY), new Date(now.getTime() - 364 * DAY)]
      );
    });

    await RunNotificationTickForTenant(TENANT_SLUG, { now });

    const exists = (id: string) => withTenant(TENANT_SLUG, async (c) => (await c.query("SELECT 1 FROM notification WHERE id = $1", [id])).rowCount === 1);
    const logged = (id: string) => withTenant(TENANT_SLUG, async (c) => (await deliveryRows(c, id)).some((r) => r.channel === "sms"));
    expect(await exists(ids.readOld)).toBe(false);
    expect(await exists(ids.readFresh)).toBe(true);
    expect(await exists(ids.unreadOld)).toBe(false);
    expect(await exists(ids.unreadFresh)).toBe(true);
    expect(await exists(ids.logOld)).toBe(true);
    expect(await logged(ids.logOld)).toBe(false);
    expect(await logged(ids.logFresh)).toBe(true);
  });
});
