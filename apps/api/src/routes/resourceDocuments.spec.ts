import { describe, it, expect } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { app } from "../server.js";
import { withTenant, insertStaffUser } from "../db.js";
import { signAuthToken } from "../utils/jwt.js";
import type { StaffRole } from "../db/users.js";

/**
 * Opened state of the app's own PDFs on Resources (guide + protocol), per user,
 * through the real Express stack and real Postgres. Stored in resource_progress
 * with partner = 'neosleep'.
 */
const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";
const BASE = "/api/v1/resources/documents";

async function staff(role: StaffRole): Promise<{ id: string; auth: string }> {
  return withTenant(TENANT_SLUG, async (client) => {
    const email = `qa-docs-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@neosleepcare.com`;
    const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
    const user = await insertStaffUser(client, email, "QA", "Docs", role, hash, false);
    return { id: user!.id, auth: `Bearer ${signAuthToken({ id: user!.id, email, role, token_version: 0 })}` };
  });
}

describe("own documents opened state API", () => {
  it("starts empty, records an open and returns it on the next read", async () => {
    const doc = await staff("doctor");
    const empty = await request(app).get(`${BASE}/progress`).set("Authorization", doc.auth);
    expect(empty.status).toBe(200);
    expect(empty.body.progress).toEqual([]);

    const put = await request(app).put(`${BASE}/guia-uso/opened`).set("Authorization", doc.auth);
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({ resourceId: "guia-uso", status: "completed" });
    expect(put.body.completedAt).toBeTruthy();

    const read = await request(app).get(`${BASE}/progress`).set("Authorization", doc.auth);
    expect(read.body.progress).toHaveLength(1);
    expect(read.body.progress[0]).toMatchObject({ resourceId: "guia-uso", status: "completed" });
  });

  it("opening twice keeps the first opened date; DELETE goes back to not opened", async () => {
    const doc = await staff("rep");
    const first = await request(app).put(`${BASE}/protocolo-atencion/opened`).set("Authorization", doc.auth);
    const again = await request(app).put(`${BASE}/protocolo-atencion/opened`).set("Authorization", doc.auth);
    expect(again.body.completedAt).toBe(first.body.completedAt);

    const del = await request(app).delete(`${BASE}/protocolo-atencion/opened`).set("Authorization", doc.auth);
    expect(del.status).toBe(200);
    expect(del.body).toMatchObject({ resourceId: "protocolo-atencion", status: "not_started", completedAt: null });
    const read = await request(app).get(`${BASE}/progress`).set("Authorization", doc.auth);
    expect(read.body.progress[0]).toMatchObject({ status: "not_started" });
  });

  it("user isolation: another user's opens are neither visible nor overwritten", async () => {
    const a = await staff("doctor");
    const b = await staff("manager");
    await request(app).put(`${BASE}/guia-uso/opened`).set("Authorization", a.auth);
    const bRead = await request(app).get(`${BASE}/progress`).set("Authorization", b.auth);
    expect(bRead.body.progress).toEqual([]);
    await request(app).delete(`${BASE}/guia-uso/opened`).set("Authorization", b.auth);
    const aRead = await request(app).get(`${BASE}/progress`).set("Authorization", a.auth);
    expect(aRead.body.progress[0]).toMatchObject({ resourceId: "guia-uso", status: "completed" });
  });

  it("does not mix with the partner webinar progress of the same user", async () => {
    const doc = await staff("doctor");
    await request(app).put(`/api/v1/partners/orthoapnea/resources/47/status`).set("Authorization", doc.auth).send({ status: "completed" });
    await request(app).put(`${BASE}/guia-uso/opened`).set("Authorization", doc.auth);
    const own = await request(app).get(`${BASE}/progress`).set("Authorization", doc.auth);
    expect(own.body.progress.map((r: { resourceId: string }) => r.resourceId)).toEqual(["guia-uso"]);
    const partner = await request(app).get(`/api/v1/partners/orthoapnea/resources/progress`).set("Authorization", doc.auth);
    expect(partner.body.progress.map((r: { resourceId: string }) => r.resourceId)).toEqual(["47"]);
  });

  it("answers 404 for an id that is not one of our documents, 401 without a session", async () => {
    const doc = await staff("doctor");
    const unknownPut = await request(app).put(`${BASE}/47/opened`).set("Authorization", doc.auth);
    const unknownDelete = await request(app).delete(`${BASE}/nope/opened`).set("Authorization", doc.auth);
    expect([unknownPut.status, unknownDelete.status]).toEqual([404, 404]);
    const anonGet = await request(app).get(`${BASE}/progress`);
    const anonPut = await request(app).put(`${BASE}/guia-uso/opened`);
    expect([anonGet.status, anonPut.status]).toEqual([401, 401]);
  });
});
