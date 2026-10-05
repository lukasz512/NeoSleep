import { describe, it, expect, afterAll, beforeAll } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { app } from "../server.js";
import { getDb, withTenant, insertStaffUser } from "../db.js";
import { signAuthToken } from "../utils/jwt.js";
import { errorHandler } from "../middleware/errorHandler.js";
import { ValidationError } from "../errors.js";
import type { StaffRole } from "../db/users.js";

/**
 * Report a problem + admin Issues endpoints, through the real Express stack and
 * real Postgres (platform.problem_report / platform.diagnostics). Storage is
 * not configured in tests, so attachments exercise the "report kept, upload
 * failed" path.
 */
const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";
const SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const DESCRIPTION = "The patient list does not load after I save a visit.";

interface Account { id: string; email: string; auth: string }

async function account(role: StaffRole, label: string): Promise<Account> {
  return withTenant(TENANT_SLUG, async (client) => {
    const email = `qa-rp-${label}-${SUFFIX}@neosleepcare.com`;
    const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
    const user = await insertStaffUser(client, email, "QA", `Report ${label}`, role, hash, false);
    return { id: user!.id, email, auth: `Bearer ${signAuthToken({ id: user!.id, email, role, token_version: 0 })}` };
  });
}

function uniqueWord(): string {
  return Array.from({ length: 12 }, () => String.fromCharCode(103 + Math.floor(Math.random() * 20))).join("");
}

describe("problem reports and admin issues", () => {
  let admin: Account;
  let platformAdmin: Account;
  let doctor: Account;
  let rep: Account;
  const errorMarker = `zzissuesspec ${uniqueWord()}`;
  const previousDiagnostics = process.env.ENABLE_DIAGNOSTICS_DB;

  beforeAll(async () => {
    admin = await account("admin", "admin");
    platformAdmin = await account("admin", "platform");
    doctor = await account("doctor", "doctor");
    rep = await account("rep", "rep");
    await getDb().query(
      `INSERT INTO platform.users (email, name, role, is_active) VALUES ($1, 'QA Platform', 'owner', true)`,
      [platformAdmin.email.toUpperCase()]
    );
  });

  afterAll(async () => {
    if (previousDiagnostics === undefined) delete process.env.ENABLE_DIAGNOSTICS_DB;
    else process.env.ENABLE_DIAGNOSTICS_DB = previousDiagnostics;
    await getDb().query("DELETE FROM platform.problem_report WHERE reporter_email LIKE $1", [`qa-rp-%-${SUFFIX}@%`]);
    await getDb().query("DELETE FROM platform.users WHERE lower(email) LIKE $1", [`qa-rp-%-${SUFFIX}@%`]);
    await getDb().query("DELETE FROM platform.diagnostics WHERE message LIKE $1", [`%${errorMarker}%`]);
  });

  describe("POST /api/v1/problem-reports", () => {
    it("requires a signed-in user", async () => {
      const res = await request(app).post("/api/v1/problem-reports").send({ description: DESCRIPTION });
      expect(res.status).toBe(401);
    });

    it("rejects a description shorter than 10 characters", async () => {
      const res = await request(app).post("/api/v1/problem-reports").set("Authorization", doctor.auth).send({ description: "too short" });
      expect(res.status).toBe(400);
      expect(res.body.field).toBe("description");
    });

    it("rejects an unknown kind and a non-image file", async () => {
      const kind = await request(app).post("/api/v1/problem-reports").set("Authorization", doctor.auth).send({ kind: "rant", description: DESCRIPTION });
      expect(kind.status).toBe(400);

      const file = await request(app)
        .post("/api/v1/problem-reports")
        .set("Authorization", doctor.auth)
        .field("description", DESCRIPTION)
        .attach("file", Buffer.from("MZ"), { filename: "x.exe", contentType: "application/x-msdownload" });
      expect(file.status).toBe(400);
    });

    it("stores a JSON report with context from the token and a stripped page url, and returns id and number", async () => {
      const res = await request(app)
        .post("/api/v1/problem-reports")
        .set("Authorization", doctor.auth)
        .set("User-Agent", "spec-agent/1.0")
        .send({
          kind: "suggestion",
          description: `  ${DESCRIPTION}  `,
          page_url: "/patients/123?token=secret#top",
          app_version: "1.2.3",
          viewport: "390x844",
          request_ids: ["req-a", "req-b", "req-a"],
          recent_errors: [{ where: "web.x", status: 500, request_id: "req-a" }],
        });
      expect(res.status).toBe(201);
      expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(Number(res.body.number)).toBeGreaterThan(0);

      const { rows } = await getDb().query("SELECT * FROM platform.problem_report WHERE id = $1", [res.body.id]);
      expect(rows[0]).toMatchObject({
        tenant_slug: TENANT_SLUG,
        kind: "suggestion",
        status: "new",
        description: DESCRIPTION,
        reporter_user_id: doctor.id,
        reporter_email: doctor.email,
        reporter_role: "doctor",
        page_url: "/patients/123",
        app_version: "1.2.3",
        viewport: "390x844",
        user_agent: "spec-agent/1.0",
        request_ids: ["req-a", "req-b"],
        recent_errors: [{ where: "web.x", status: 500, request_id: "req-a" }],
      });
    });

    it("accepts multipart with JSON-string fields and keeps the report when the upload cannot be stored", async () => {
      const res = await request(app)
        .post("/api/v1/problem-reports")
        .set("Authorization", rep.auth)
        .field("description", DESCRIPTION)
        .field("request_ids", JSON.stringify(["req-m"]))
        .field("recent_errors", JSON.stringify([{ where: "web.y" }]))
        .attach("file", Buffer.from("fake-png"), { filename: "screen shot.png", contentType: "image/png" });
      expect(res.status).toBe(201);
      const { rows } = await getDb().query("SELECT request_ids, kind FROM platform.problem_report WHERE id = $1", [res.body.id]);
      expect(rows[0]).toMatchObject({ request_ids: ["req-m"], kind: "problem" });
    });

    it("limits a user to 5 reports per hour", async () => {
      const limited = await account("rep", "limited");
      for (let i = 0; i < 5; i++) {
        const ok = await request(app).post("/api/v1/problem-reports").set("Authorization", limited.auth).send({ description: DESCRIPTION });
        expect(ok.status).toBe(201);
      }
      const sixth = await request(app).post("/api/v1/problem-reports").set("Authorization", limited.auth).send({ description: DESCRIPTION });
      expect(sixth.status).toBe(429);
    });
  });

  describe("admin endpoints", () => {
    it("are closed to doctors and reps (403) and to anonymous callers (401)", async () => {
      for (const path of ["/api/v1/admin/problem-reports", "/api/v1/admin/issues/access", "/api/v1/admin/diagnostics"]) {
        expect((await request(app).get(path)).status).toBe(401);
        expect((await request(app).get(path).set("Authorization", doctor.auth)).status).toBe(403);
        expect((await request(app).get(path).set("Authorization", rep.auth)).status).toBe(403);
      }
      const patch = await request(app).patch(`/api/v1/admin/problem-reports/${randomUUID()}`).set("Authorization", rep.auth).send({ status: "resolved" });
      expect(patch.status).toBe(403);
    });

    it("tells an admin whether they are a platform admin", async () => {
      const plain = await request(app).get("/api/v1/admin/issues/access").set("Authorization", admin.auth);
      expect(plain.body).toEqual({ platformAdmin: false });
      const platform = await request(app).get("/api/v1/admin/issues/access").set("Authorization", platformAdmin.auth);
      expect(platform.body).toEqual({ platformAdmin: true });
    });

    it("lists this tenant's reports without storage paths and never another tenant's", async () => {
      const other = randomUUID();
      await getDb().query(
        `INSERT INTO platform.problem_report (id, tenant_slug, env, description, reporter_email) VALUES ($1, 'other-tenant', 'test', $2, $3)`,
        [other, DESCRIPTION, `qa-rp-other-${SUFFIX}@neosleepcare.com`]
      );
      const res = await request(app).get("/api/v1/admin/problem-reports").set("Authorization", admin.auth);
      expect(res.status).toBe(200);
      const ids = res.body.items.map((r: { id: string }) => r.id);
      expect(ids).not.toContain(other);
      expect(res.body.items.length).toBeGreaterThanOrEqual(2);
      expect(res.body.items[0]).toHaveProperty("has_attachment", false);
      expect(res.body.items[0]).not.toHaveProperty("attachment_path");
      expect(res.body.items.every((r: { tenant_slug: string }) => r.tenant_slug === TENANT_SLUG)).toBe(true);

      const filtered = await request(app).get("/api/v1/admin/problem-reports?status=resolved").set("Authorization", admin.auth);
      expect(filtered.body.items.every((r: { status: string }) => r.status === "resolved")).toBe(true);
      expect((await request(app).get("/api/v1/admin/problem-reports?status=bogus").set("Authorization", admin.auth)).status).toBe(400);

      const patchOther = await request(app).patch(`/api/v1/admin/problem-reports/${other}`).set("Authorization", admin.auth).send({ status: "resolved" });
      expect(patchOther.status).toBe(404);
    });

    it("moves a report through statuses, sets and clears resolved_at, and saves the note", async () => {
      const created = await request(app).post("/api/v1/problem-reports").set("Authorization", platformAdmin.auth).send({ description: DESCRIPTION });
      const url = `/api/v1/admin/problem-reports/${created.body.id}`;

      const progress = await request(app).patch(url).set("Authorization", admin.auth).send({ status: "in_progress", admin_note: "Looking into it" });
      expect(progress.status).toBe(200);
      expect(progress.body).toMatchObject({ status: "in_progress", admin_note: "Looking into it", resolved_at: null });

      const resolved = await request(app).patch(url).set("Authorization", admin.auth).send({ status: "resolved" });
      expect(resolved.body.status).toBe("resolved");
      expect(resolved.body.resolved_at).not.toBeNull();
      expect(resolved.body.admin_note).toBe("Looking into it");

      const reopened = await request(app).patch(url).set("Authorization", admin.auth).send({ status: "new" });
      expect(reopened.body.resolved_at).toBeNull();

      expect((await request(app).patch(url).set("Authorization", admin.auth).send({ status: "bogus" })).status).toBe(400);
      expect((await request(app).patch(url).set("Authorization", admin.auth).send({})).status).toBe(400);
      expect((await request(app).patch("/api/v1/admin/problem-reports/not-a-uuid").set("Authorization", admin.auth).send({ status: "new" })).status).toBe(404);
    });

    it("answers 404 for the attachment of a report without one", async () => {
      const created = await request(app).post("/api/v1/problem-reports").set("Authorization", doctor.auth).send({ description: DESCRIPTION });
      const res = await request(app).get(`/api/v1/admin/problem-reports/${created.body.id}/attachment`).set("Authorization", admin.auth);
      expect(res.status).toBe(404);
    });
  });

  describe("errors (platform admin only)", () => {
    it("is forbidden for a tenant admin who is not in platform.users", async () => {
      const list = await request(app).get("/api/v1/admin/diagnostics").set("Authorization", admin.auth);
      expect(list.status).toBe(403);
      const patch = await request(app).patch(`/api/v1/admin/diagnostics/${randomUUID()}`).set("Authorization", admin.auth).send({ status: "resolved" });
      expect(patch.status).toBe(403);
    });

    it("records API errors with tenant and user, groups repeats, and links reports by request id", async () => {
      process.env.ENABLE_DIAGNOSTICS_DB = "1";
      const requestId = `req-${uniqueWord()}`;
      const fakeReq = { requestId, hostname: "localhost", path: "/api/v1/boom", user: { sub: admin.id } } as unknown as Request;
      const fakeRes = { headersSent: true } as unknown as Response;
      errorHandler(new Error(`${errorMarker} failed for ${randomUUID()}`), fakeReq, fakeRes, () => undefined);
      errorHandler(new Error(`${errorMarker} failed for ${randomUUID()}`), fakeReq, fakeRes, () => undefined);
      errorHandler(new ValidationError("not recorded: client errors are not diagnostics"), fakeReq, fakeRes, () => undefined);

      const pool = getDb();
      let row: { id: string; count: number; tenant_slug: string; user_id: string } | undefined;
      for (let i = 0; i < 40 && row?.count !== 2; i++) {
        await new Promise((r) => setTimeout(r, 100));
        const { rows } = await pool.query("SELECT id, count, tenant_slug, user_id FROM platform.diagnostics WHERE message LIKE $1", [`%${errorMarker}%`]);
        row = rows[0];
      }
      expect(row).toMatchObject({ count: 2, tenant_slug: TENANT_SLUG, user_id: admin.id });

      const reporter = await account("doctor", "linked");
      const report = await request(app)
        .post("/api/v1/problem-reports")
        .set("Authorization", reporter.auth)
        .send({ description: DESCRIPTION, request_ids: [requestId] });

      const list = await request(app).get("/api/v1/admin/diagnostics?env=test").set("Authorization", platformAdmin.auth);
      expect(list.status).toBe(200);
      const item = list.body.items.find((d: { id: string }) => d.id === row!.id);
      expect(item).toBeTruthy();
      expect(item.linked_reports).toEqual([{ id: report.body.id, number: Number(report.body.number) }]);

      const resolved = await request(app).patch(`/api/v1/admin/diagnostics/${row!.id}`).set("Authorization", platformAdmin.auth).send({ status: "resolved" });
      expect(resolved.status).toBe(200);
      expect(resolved.body.status).toBe("resolved");

      const openOnly = await request(app).get("/api/v1/admin/diagnostics?env=test").set("Authorization", platformAdmin.auth);
      expect(openOnly.body.items.some((d: { id: string }) => d.id === row!.id)).toBe(false);
      const all = await request(app).get("/api/v1/admin/diagnostics?status=all&env=test").set("Authorization", platformAdmin.auth);
      expect(all.body.items.some((d: { id: string }) => d.id === row!.id)).toBe(true);

      expect((await request(app).patch(`/api/v1/admin/diagnostics/${row!.id}`).set("Authorization", platformAdmin.auth).send({ status: "nope" })).status).toBe(400);
    });
  });
});
