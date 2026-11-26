import { describe, it, expect } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { app } from "../../server.js";
import { withTenant, insertStaffUser } from "../../db.js";
import { signAuthToken } from "../../utils/jwt.js";
import type { StaffRole } from "../../db/users.js";

/**
 * NEO-209: per-user watch progress for OrthoApnea webinars, through the real
 * Express stack and real Postgres.
 */
const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";
const BASE = "/api/v1/partners/orthoapnea/resources";

async function staff(role: StaffRole): Promise<{ id: string; auth: string }> {
  return withTenant(TENANT_SLUG, async (client) => {
    const email = `qa-progress-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@neosleepcare.com`;
    const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
    const user = await insertStaffUser(client, email, "QA", "Progress", role, hash, false);
    return { id: user!.id, auth: `Bearer ${signAuthToken({ id: user!.id, email, role, token_version: 0 })}` };
  });
}

describe("resource progress API", () => {
  it("starts empty, saves a position and returns it on the next read", async () => {
    const doc = await staff("doctor");
    const empty = await request(app).get(`${BASE}/progress`).set("Authorization", doc.auth);
    expect(empty.status).toBe(200);
    expect(empty.body.progress).toEqual([]);

    const put = await request(app).put(`${BASE}/47/progress`).set("Authorization", doc.auth).send({ positionSec: 252, durationSec: 665 });
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({ resourceId: "47", status: "in_progress", positionSec: 252, durationSec: 665, percent: 38 });

    const read = await request(app).get(`${BASE}/progress`).set("Authorization", doc.auth);
    expect(read.body.progress).toHaveLength(1);
    expect(read.body.progress[0]).toMatchObject({ resourceId: "47", positionSec: 252 });
  });

  it("marks completed at 90 % and keeps it completed on a rewatch", async () => {
    const doc = await staff("doctor");
    await request(app).put(`${BASE}/12/progress`).set("Authorization", doc.auth).send({ positionSec: 600, durationSec: 660 });
    const again = await request(app).put(`${BASE}/12/progress`).set("Authorization", doc.auth).send({ positionSec: 15, durationSec: 660 });
    expect(again.body).toMatchObject({ status: "completed", positionSec: 15 });
    expect(again.body.completedAt).toBeTruthy();
  });

  it("manual mark and unmark set only the status — nothing records how it was set", async () => {
    const doc = await staff("doctor");
    const marked = await request(app).put(`${BASE}/9/status`).set("Authorization", doc.auth).send({ status: "completed" });
    expect(marked.status).toBe(200);
    expect(marked.body).toMatchObject({ status: "completed", percent: 100 });
    expect(Object.keys(marked.body).sort()).toEqual(["completedAt", "durationSec", "percent", "positionSec", "resourceId", "status", "updatedAt"]);

    const unmarked = await request(app).put(`${BASE}/9/status`).set("Authorization", doc.auth).send({ status: "not_started" });
    expect(unmarked.body).toMatchObject({ status: "not_started", positionSec: 0, percent: 0 });
  });

  it("user isolation: nobody reads or overwrites another user's progress", async () => {
    const a = await staff("doctor");
    const b = await staff("rep");
    await request(app).put(`${BASE}/47/progress`).set("Authorization", a.auth).send({ positionSec: 100, durationSec: 600 });
    const bRead = await request(app).get(`${BASE}/progress`).set("Authorization", b.auth);
    expect(bRead.body.progress).toEqual([]);
    await request(app).put(`${BASE}/47/progress`).set("Authorization", b.auth).send({ positionSec: 500, durationSec: 600 });
    const aRead = await request(app).get(`${BASE}/progress`).set("Authorization", a.auth);
    expect(aRead.body.progress[0].positionSec).toBe(100);
  });

  it("rejects bad input with 400 and no session with 401", async () => {
    const doc = await staff("doctor");
    const badPos = await request(app).put(`${BASE}/47/progress`).set("Authorization", doc.auth).send({ positionSec: "x", durationSec: 600 });
    const badStatus = await request(app).put(`${BASE}/47/status`).set("Authorization", doc.auth).send({ status: "in_progress" });
    const badId = await request(app).put(`${BASE}/${"x".repeat(80)}/progress`).set("Authorization", doc.auth).send({ positionSec: 1, durationSec: 600 });
    expect([badPos.status, badStatus.status, badId.status]).toEqual([400, 400, 400]);
    const anon = await request(app).get(`${BASE}/progress`);
    expect(anon.status).toBe(401);
  });
});
