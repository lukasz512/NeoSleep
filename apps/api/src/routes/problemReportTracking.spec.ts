import { describe, it, expect, afterAll, beforeAll } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { app } from "../server.js";
import { getDb, withTenant, insertStaffUser } from "../db.js";
import { signAuthToken } from "../utils/jwt.js";
import type { StaffRole } from "../db/users.js";

/**
 * Trackable reports (docs/stories/trackable-feedback-reports.md), through the
 * real Express stack and real Postgres: the reporter's receipt and status
 * notifications, "My reports", and the admin's ticket + reply fields.
 * Emails are not sent in tests (Resend is not configured); their copy is
 * covered by mailer.problemReport.spec.ts.
 */
const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";
const SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const DESCRIPTION = "The calendar does not show my afternoon visits.";

interface Account { id: string; identityId: string; email: string; auth: string }

async function account(role: StaffRole, label: string): Promise<Account> {
  return withTenant(TENANT_SLUG, async (client) => {
    const email = `qa-rpt-${label}-${SUFFIX}@neosleepcare.com`;
    const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
    const user = await insertStaffUser(client, email, "QA", `Tracking ${label}`, role, hash, false);
    const { rows } = await client.query<{ identity_id: string }>("SELECT identity_id FROM users WHERE id = $1", [user!.id]);
    return { id: user!.id, identityId: rows[0]!.identity_id, email, auth: `Bearer ${signAuthToken({ id: user!.id, email, role, token_version: 0 })}` };
  });
}

async function notificationsFor(identityId: string, entityId: string): Promise<{ type: string; action_url: string | null; metadata: Record<string, unknown> | null }[]> {
  return withTenant(TENANT_SLUG, async (client) => {
    const { rows } = await client.query(
      "SELECT type, action_url, metadata FROM notification WHERE identity_id = $1 AND entity_id = $2 ORDER BY created_at",
      [identityId, entityId]
    );
    return rows;
  });
}

async function send(reporter: Account, description = DESCRIPTION): Promise<{ id: string; number: number }> {
  const res = await request(app).post("/api/v1/problem-reports").set("Authorization", reporter.auth).send({ description });
  expect(res.status).toBe(201);
  return res.body;
}

describe("trackable problem reports", () => {
  let admin: Account;
  let doctor: Account;
  let rep: Account;

  beforeAll(async () => {
    admin = await account("admin", "admin");
    doctor = await account("doctor", "doctor");
    rep = await account("rep", "rep");
  });

  afterAll(async () => {
    await getDb().query("DELETE FROM platform.problem_report WHERE reporter_email LIKE $1", [`qa-rpt-%-${SUFFIX}@%`]);
  });

  it("gives the reporter an in-app receipt and the tenant's admins a heads-up", async () => {
    const report = await send(doctor);

    const mine = await notificationsFor(doctor.identityId, report.id);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      type: "problem_report_received",
      action_url: `/my-reports?report=${report.id}`,
      metadata: { number: Number(report.number) },
    });

    const admins = await notificationsFor(admin.identityId, report.id);
    expect(admins.map((n) => n.type)).toEqual(["problem_report_new"]);
    expect(admins[0]!.action_url).toBe(`/issues?report=${report.id}`);
  });

  it("does not tell a rep about someone else's report", async () => {
    const report = await send(doctor, "Another problem for the notification check.");
    expect(await notificationsFor(rep.identityId, report.id)).toEqual([]);
  });

  it("lists only the caller's own reports in My reports, without internal fields", async () => {
    const own = await send(rep);
    const others = await send(doctor, "Someone else's report text, not the rep's.");

    const res = await request(app).get("/api/v1/problem-reports/mine").set("Authorization", rep.auth);
    expect(res.status).toBe(200);
    const ids = res.body.items.map((r: { id: string }) => r.id);
    expect(ids).toContain(own.id);
    expect(ids).not.toContain(others.id);
    const item = res.body.items.find((r: { id: string }) => r.id === own.id);
    expect(item).toMatchObject({ status: "new", tracker_ref: null, reporter_reply: null, description: DESCRIPTION });
    for (const internal of ["admin_note", "reporter_email", "request_ids", "recent_errors", "user_agent", "tenant_slug"]) {
      expect(item).not.toHaveProperty(internal);
    }

    expect((await request(app).get("/api/v1/problem-reports/mine")).status).toBe(401);
  });

  it("lets an admin link a ticket (normalised) and rejects anything that isn't a ticket key", async () => {
    const report = await send(rep, "Ticket linking check for the admin dialog.");
    const url = `/api/v1/admin/problem-reports/${report.id}`;

    const linked = await request(app).patch(url).set("Authorization", admin.auth).send({ tracker_ref: " core-123 " });
    expect(linked.status).toBe(200);
    expect(linked.body.tracker_ref).toBe("CORE-123");

    for (const bad of ["123", "CORE 123", "https://linear.app/x/CORE-1", "C-1"]) {
      const res = await request(app).patch(url).set("Authorization", admin.auth).send({ tracker_ref: bad });
      expect(res.status, bad).toBe(400);
      expect(res.body.field).toBe("tracker_ref");
    }

    const cleared = await request(app).patch(url).set("Authorization", admin.auth).send({ tracker_ref: "" });
    expect(cleared.body.tracker_ref).toBeNull();

    const tooLong = await request(app).patch(url).set("Authorization", admin.auth).send({ reporter_reply: "x".repeat(1001) });
    expect(tooLong.status).toBe(400);
  });

  it("tells the reporter about in progress and resolved once each, with the ticket and reply visible to them", async () => {
    const report = await send(rep, "Status notification check for the reporter.");
    const url = `/api/v1/admin/problem-reports/${report.id}`;

    await request(app).patch(url).set("Authorization", admin.auth).send({ status: "in_progress" });
    // Saving the same status again (e.g. only the note changed) is not a new event.
    await request(app).patch(url).set("Authorization", admin.auth).send({ status: "in_progress", admin_note: "Repro on iPad" });
    const resolved = await request(app)
      .patch(url)
      .set("Authorization", admin.auth)
      .send({ status: "resolved", tracker_ref: "CORE-77", reporter_reply: "Fixed in today's update." });
    expect(resolved.status).toBe(200);

    const types = (await notificationsFor(rep.identityId, report.id)).map((n) => n.type);
    expect(types).toEqual(["problem_report_received", "problem_report_in_progress", "problem_report_closed"]);

    const mine = await request(app).get("/api/v1/problem-reports/mine").set("Authorization", rep.auth);
    const item = mine.body.items.find((r: { id: string }) => r.id === report.id);
    expect(item).toMatchObject({ status: "resolved", tracker_ref: "CORE-77", reporter_reply: "Fixed in today's update." });
    expect(item).not.toHaveProperty("admin_note");
  });

  it("treats won't fix like resolved for the reporter", async () => {
    const report = await send(rep, "Won't fix notification check for the reporter.");
    await request(app).patch(`/api/v1/admin/problem-reports/${report.id}`).set("Authorization", admin.auth).send({ status: "dismissed" });
    const types = (await notificationsFor(rep.identityId, report.id)).map((n) => n.type);
    expect(types).toEqual(["problem_report_received", "problem_report_closed"]);
  });
});
