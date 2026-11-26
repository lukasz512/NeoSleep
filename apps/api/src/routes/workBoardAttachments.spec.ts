import { describe, it, expect, afterAll, beforeAll, beforeEach, vi } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { app } from "../server.js";
import { getDb, withTenant, insertStaffUser } from "../db.js";
import { signAuthToken } from "../utils/jwt.js";
import type { StaffRole } from "../db/users.js";

// Storage is the only stub: the bucket is not configured in tests. Postgres stays real.
const storage = vi.hoisted(() => ({
  uploadPartnerDocument: vi.fn(async () => undefined),
  deletePartnerDocument: vi.fn(async () => undefined),
  getPartnerDocumentSignedUrl: vi.fn(async (path: string) => `https://storage.test/signed/${path}`),
  downloadPartnerDocument: vi.fn(),
}));
vi.mock("../services/partnerDocuments.js", () => storage);

/**
 * Work board attachments, assignee and due date (CORE-192) through the real Express stack
 * and real Postgres. Own team key per run, like workBoard.spec.ts.
 */
const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";
const SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const TEAM = `A${Math.random().toString(36).slice(2, 8).toUpperCase().replace(/[^A-Z0-9]/g, "X")}`;
const BASE = "/api/v1/platform/work";
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");

interface Account { email: string; auth: string }

async function account(role: StaffRole, label: string): Promise<Account> {
  return withTenant(TENANT_SLUG, async (client) => {
    const email = `qa-wba-${label}-${SUFFIX}@neosleepcare.com`;
    const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
    const user = await insertStaffUser(client, email, "QA", `Attach ${label}`, role, hash, false);
    return { email, auth: `Bearer ${signAuthToken({ id: user!.id, email, role, token_version: 0 })}` };
  });
}

describe("platform work board attachments", () => {
  let platformAdmin: Account;
  let tenantAdmin: Account;
  let key: string;

  function attach(itemKey: string, file: Buffer, name: string, contentType: string, comment?: string): request.Test {
    const req = request(app).post(`${BASE}/items/${itemKey}/attachments`).set("Authorization", platformAdmin.auth);
    if (comment !== undefined) req.field("comment", comment);
    return req.attach("file", file, { filename: name, contentType });
  }

  beforeAll(async () => {
    platformAdmin = await account("admin", "platform");
    tenantAdmin = await account("admin", "tenant");
    await getDb().query(`INSERT INTO platform.users (email, name, role, is_active) VALUES ($1, 'QA Attach', 'owner', true)`, [
      platformAdmin.email,
    ]);
    await getDb().query(`INSERT INTO platform.work_team (key, name, kind, sort_order) VALUES ($1, 'QA attach', 'client', 998)`, [TEAM]);
    const created = await request(app).post(`${BASE}/items`).set("Authorization", platformAdmin.auth).send({ team: TEAM, title: "Has screenshots" });
    key = created.body.item.key as string;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await getDb().query("DELETE FROM platform.work_item WHERE team_key = $1", [TEAM]);
    await getDb().query("DELETE FROM platform.work_team WHERE key = $1", [TEAM]);
    await getDb().query("DELETE FROM platform.users WHERE lower(email) LIKE $1", [`qa-wba-%-${SUFFIX}@%`]);
  });

  it("uploads an image to a private path, lists it on the item without the path and logs it", async () => {
    const res = await attach(key, PNG, "screen shot.png", "image/png");
    expect(res.status).toBe(201);
    expect(res.body.attachment).toMatchObject({ filename: "screen_shot.png", mime_type: "image/png", size_bytes: PNG.length, uploaded_by: platformAdmin.email });
    expect(res.body.attachment.path).toBeUndefined();
    const [path, bytes, type] = storage.uploadPartnerDocument.mock.calls[0] as unknown as [string, Uint8Array, string];
    expect(path).toMatch(/^work-board\/[0-9a-f-]{36}\/[0-9a-f-]{36}-screen_shot\.png$/);
    expect(bytes.length).toBe(PNG.length);
    expect(type).toBe("image/png");

    const detail = await request(app).get(`${BASE}/items/${key}`).set("Authorization", platformAdmin.auth);
    expect(detail.body.attachments.map((a: { id: string }) => a.id)).toContain(res.body.attachment.id);
    expect(detail.body.attachments.every((a: Record<string, unknown>) => !("path" in a))).toBe(true);
    expect(detail.body.events.at(-1)).toMatchObject({ kind: "attachment", body: "+ screen_shot.png" });
  });

  it("accepts a PDF and rejects other types with 400 before anything is stored", async () => {
    expect((await attach(key, Buffer.from("%PDF-1.4"), "report.pdf", "application/pdf")).status).toBe(201);
    storage.uploadPartnerDocument.mockClear();
    const bad = await attach(key, Buffer.from("MZ"), "run.exe", "application/octet-stream");
    expect(bad.status).toBe(400);
    expect(storage.uploadPartnerDocument).not.toHaveBeenCalled();
  });

  it("rejects a file over 10 MB with 400", async () => {
    const res = await attach(key, Buffer.alloc(10 * 1024 * 1024 + 1), "huge.png", "image/png");
    expect(res.status).toBe(400);
    expect(storage.uploadPartnerDocument).not.toHaveBeenCalled();
  });

  it("ties an attachment to a comment on the same item and refuses a comment from another item", async () => {
    const comment = await request(app).post(`${BASE}/items/${key}/comments`).set("Authorization", platformAdmin.auth).send({ body: "See screenshot" });
    const eventId = String(comment.body.event.id);
    const ok = await attach(key, PNG, "c.png", "image/png", eventId);
    expect(ok.status).toBe(201);
    expect(String(ok.body.attachment.event_id)).toBe(eventId);

    const other = await request(app).post(`${BASE}/items`).set("Authorization", platformAdmin.auth).send({ team: TEAM, title: "Other" });
    storage.deletePartnerDocument.mockClear();
    const wrong = await attach(other.body.item.key as string, PNG, "c.png", "image/png", eventId);
    expect(wrong.status).toBe(400);
    expect(storage.deletePartnerDocument).toHaveBeenCalledTimes(1);
  });

  it("hands out a short-lived signed URL; 401 without login, 403 for a tenant admin", async () => {
    const { id } = (await attach(key, PNG, "s.png", "image/png")).body.attachment;
    const url = `${BASE}/items/${key}/attachments/${id}`;
    const ok = await request(app).get(url).set("Authorization", platformAdmin.auth);
    expect(ok.status).toBe(200);
    expect(ok.body.url).toMatch(/^https:\/\/storage\.test\/signed\/work-board\//);
    expect(ok.body.expires_in).toBeLessThanOrEqual(600);
    expect((await request(app).get(url)).status).toBe(401);
    expect((await request(app).get(url).set("Authorization", tenantAdmin.auth)).status).toBe(403);
    expect((await request(app).get(`${BASE}/items/${key}/attachments/not-a-uuid`).set("Authorization", platformAdmin.auth)).status).toBe(404);
  });

  it("deletes the row and the stored object and logs it", async () => {
    const { id } = (await attach(key, PNG, "gone.png", "image/png")).body.attachment;
    const path = (storage.uploadPartnerDocument.mock.calls[0] as unknown as [string])[0];
    const res = await request(app).delete(`${BASE}/items/${key}/attachments/${id}`).set("Authorization", platformAdmin.auth);
    expect(res.status).toBe(204);
    expect(storage.deletePartnerDocument).toHaveBeenCalledWith(path);
    const detail = await request(app).get(`${BASE}/items/${key}`).set("Authorization", platformAdmin.auth);
    expect(detail.body.attachments.map((a: { id: string }) => a.id)).not.toContain(id);
    expect(detail.body.events.at(-1)).toMatchObject({ kind: "attachment", body: "- gone.png" });
    expect((await request(app).get(`${BASE}/items/${key}/attachments/${id}`).set("Authorization", platformAdmin.auth)).status).toBe(404);
  });

  describe("assignee and due date", () => {
    it("lists platform admins as people", async () => {
      const res = await request(app).get(`${BASE}/people`).set("Authorization", platformAdmin.auth);
      expect(res.status).toBe(200);
      expect(res.body.items.map((p: { email: string }) => p.email)).toContain(platformAdmin.email);
    });

    it("stores a platform admin and a date, logs the edit and can clear both", async () => {
      const set = await request(app)
        .patch(`${BASE}/items/${key}`)
        .set("Authorization", platformAdmin.auth)
        .send({ assignee: platformAdmin.email.toUpperCase(), due_date: "2026-12-01" });
      expect(set.status).toBe(200);
      expect(set.body.item).toMatchObject({ assignee: platformAdmin.email, due_date: "2026-12-01" });
      const detail = await request(app).get(`${BASE}/items/${key}`).set("Authorization", platformAdmin.auth);
      expect(detail.body.events.at(-1).kind).toBe("edit");

      const cleared = await request(app).patch(`${BASE}/items/${key}`).set("Authorization", platformAdmin.auth).send({ assignee: null, due_date: null });
      expect(cleared.body.item).toMatchObject({ assignee: null, due_date: null });
    });

    it("rejects someone who is not a platform admin and a malformed date", async () => {
      const who = await request(app).patch(`${BASE}/items/${key}`).set("Authorization", platformAdmin.auth).send({ assignee: tenantAdmin.email });
      expect(who.status).toBe(400);
      const when = await request(app).patch(`${BASE}/items/${key}`).set("Authorization", platformAdmin.auth).send({ due_date: "01/12/2026" });
      expect(when.status).toBe(400);
    });

    it("takes both on create", async () => {
      const res = await request(app)
        .post(`${BASE}/items`)
        .set("Authorization", platformAdmin.auth)
        .send({ team: TEAM, title: "Assigned", assignee: platformAdmin.email, due_date: "2027-01-15" });
      expect(res.status).toBe(201);
      expect(res.body.item).toMatchObject({ assignee: platformAdmin.email, due_date: "2027-01-15" });
    });
  });
});
