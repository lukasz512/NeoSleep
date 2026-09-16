import { describe, it, expect } from "vitest";
import bcrypt from "bcrypt";
import { withTenant, insertStaffUser } from "../db.js";
import { insertNotification, getNotificationsPaginated } from "./notification.js";

const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "neosleep";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

describe("getNotificationsPaginated", () => {
  it("returns rows and a matching total, and filters by unread", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const email = `qa-notification-${uniqueSuffix()}@neosleepcare.com`;
      const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
      const user = await insertStaffUser(client, email, "QA", "Pilot", "admin", hash, false);
      const identityId = user!.identity_id;

      const first = await insertNotification(client, { identity_id: identityId, type: "system", title: "First" });
      await insertNotification(client, { identity_id: identityId, type: "system", title: "Second" });

      const all = await getNotificationsPaginated(client, identityId, "all", 1, 10);
      expect(all.total).toBe(2);
      expect(all.rows.map((r) => r.title).sort()).toEqual(["First", "Second"]);

      await client.query("UPDATE notification SET read_at = NOW() WHERE id = $1", [first.id]);

      const unread = await getNotificationsPaginated(client, identityId, "unread", 1, 10);
      expect(unread.total).toBe(1);
      expect(unread.rows[0]!.title).toBe("Second");
    });
  });
});
