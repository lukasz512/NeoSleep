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

  // CORE-4 D1: the in-app row names the patient, but the name is joined when
  // the list is read — never written into notification (push/email stay PHI-free).
  it("joins the patient's name, phone and visit time at read time without storing them", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const email = `qa-notification-${uniqueSuffix()}@neosleepcare.com`;
      const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
      const user = await insertStaffUser(client, email, "QA", "Pilot", "admin", hash, false);
      const identityId = user!.identity_id;

      const one = async <T>(sql: string, params: unknown[]): Promise<T> => (await client.query(sql, params)).rows[0] as T;
      const docIdentity = await one<{ id: string }>(`INSERT INTO identities (first_name, last_name, title) VALUES ('Ana', 'Torres', 'Dra.') RETURNING id`, []);
      const doc = await one<{ id: string }>(`INSERT INTO practitioner (identity_id) VALUES ($1) RETURNING id`, [docIdentity.id]);
      const patIdentity = await one<{ id: string }>(`INSERT INTO identities (first_name, last_name, phone) VALUES ('Mariana', 'Ruiz', '+52 55 1234 5678') RETURNING id`, []);
      const patient = await one<{ id: string }>(`INSERT INTO patient (identity_id, practitioner_id) VALUES ($1, $2) RETURNING id`, [patIdentity.id, doc.id]);
      const appt = await one<{ id: string; start_at: Date }>(
        `INSERT INTO appointment (patient_id, practitioner_id, created_by_user_id, start_at, end_at)
         VALUES ($1, $2, $3, now() + interval '1 day', now() + interval '1 day 30 min') RETURNING id, start_at`,
        [patient.id, doc.id, user!.id],
      );
      const plan = await one<{ id: string }>(`INSERT INTO treatment_plan (patient_id, type) VALUES ($1, 'dental_appliance') RETURNING id`, [patient.id]);

      await insertNotification(client, { identity_id: identityId, type: "appointment_patient_cannot_attend", title: "Can't attend", entity_type: "Appointment", entity_id: appt.id });
      await insertNotification(client, { identity_id: identityId, type: "device_order_placed", title: "Order", entity_type: "TreatmentPlan", entity_id: plan.id });
      await insertNotification(client, { identity_id: identityId, type: "practitioner_invite_accepted", title: "Joined", entity_type: "Practitioner", entity_id: doc.id });
      await insertNotification(client, { identity_id: identityId, type: "system", title: "Plain" });

      const { rows } = await getNotificationsPaginated(client, identityId, "all", 1, 10);
      const byTitle = Object.fromEntries(rows.map((r) => [r.title, r]));
      expect(byTitle["Can't attend"]).toMatchObject({ subject_name: "Mariana Ruiz", subject_phone: "+52 55 1234 5678" });
      expect(new Date(byTitle["Can't attend"]!.subject_at!).toISOString()).toBe(new Date(appt.start_at).toISOString());
      expect(byTitle["Order"]).toMatchObject({ subject_name: "Mariana Ruiz", subject_at: null });
      expect(byTitle["Joined"]).toMatchObject({ subject_name: "Dra. Ana Torres", subject_phone: null });
      expect(byTitle["Plain"]).toMatchObject({ subject_name: null, subject_phone: null, subject_at: null });

      // Nothing about the patient is written into the stored row.
      const stored = await client.query(`SELECT title, body, metadata::text AS metadata FROM notification WHERE identity_id = $1`, [identityId]);
      expect(JSON.stringify(stored.rows)).not.toContain("Mariana");
    });
  });
});
