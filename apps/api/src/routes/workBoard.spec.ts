import { describe, it, expect, afterAll, beforeAll } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { createHash } from "node:crypto";
import { app } from "../server.js";
import { getDb, withTenant, insertStaffUser } from "../db.js";
import { signAuthToken } from "../utils/jwt.js";
import type { StaffRole } from "../db/users.js";

/**
 * Platform work board (CORE-177) through the real Express stack and real Postgres
 * (platform.work_team / work_item / work_item_event). Each run uses its own team key,
 * so it never collides with CORE/NEO rows or a parallel run.
 */
const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";
const SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const TEAM = `T${Math.random().toString(36).slice(2, 8).toUpperCase().replace(/[^A-Z0-9]/g, "X")}`;
const AGENT_TOKEN = `agent-${SUFFIX}`;
const BASE = "/api/v1/platform/work";

interface Account { email: string; auth: string }

async function account(role: StaffRole, label: string): Promise<Account> {
  return withTenant(TENANT_SLUG, async (client) => {
    const email = `qa-wb-${label}-${SUFFIX}@neosleepcare.com`;
    const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
    const user = await insertStaffUser(client, email, "QA", `Board ${label}`, role, hash, false);
    return { email, auth: `Bearer ${signAuthToken({ id: user!.id, email, role, token_version: 0 })}` };
  });
}

describe("platform work board", () => {
  let platformAdmin: Account;
  let tenantAdmin: Account;
  const previousHash = process.env.WORK_BOARD_AGENT_TOKEN_SHA256;

  async function create(body: Record<string, unknown>) {
    return request(app).post(`${BASE}/items`).set("Authorization", platformAdmin.auth).send({ team: TEAM, ...body });
  }
  function asAgent(req: request.Test): request.Test {
    return req.set("X-Agent-Token", AGENT_TOKEN);
  }

  beforeAll(async () => {
    process.env.WORK_BOARD_AGENT_TOKEN_SHA256 = createHash("sha256").update(AGENT_TOKEN).digest("hex");
    platformAdmin = await account("admin", "platform");
    tenantAdmin = await account("admin", "tenant");
    await getDb().query(`INSERT INTO platform.users (email, name, role, is_active) VALUES ($1, 'QA Board', 'owner', true)`, [
      platformAdmin.email,
    ]);
    await getDb().query(`INSERT INTO platform.work_team (key, name, kind, sort_order) VALUES ($1, 'QA team', 'client', 999)`, [TEAM]);
  });

  afterAll(async () => {
    if (previousHash === undefined) delete process.env.WORK_BOARD_AGENT_TOKEN_SHA256;
    else process.env.WORK_BOARD_AGENT_TOKEN_SHA256 = previousHash;
    await getDb().query("DELETE FROM platform.work_item WHERE team_key = $1", [TEAM]);
    await getDb().query("DELETE FROM platform.work_team WHERE key = $1", [TEAM]);
    await getDb().query("DELETE FROM platform.users WHERE lower(email) LIKE $1", [`qa-wb-%-${SUFFIX}@%`]);
  });

  describe("access", () => {
    it("401 without login, 403 for a tenant admin, 200 for a platform admin", async () => {
      expect((await request(app).get(`${BASE}/items`)).status).toBe(401);
      expect((await request(app).get(`${BASE}/items`).set("Authorization", tenantAdmin.auth)).status).toBe(403);
      const ok = await request(app).get(`${BASE}/teams`).set("Authorization", platformAdmin.auth);
      expect(ok.status).toBe(200);
      expect(ok.body.items.map((t: { key: string }) => t.key)).toEqual(expect.arrayContaining(["CORE", "NEO", TEAM]));
    });

    it("rejects a wrong agent token with 401", async () => {
      const res = await request(app).get(`${BASE}/items`).set("X-Agent-Token", "wrong");
      expect(res.status).toBe(401);
    });
  });

  describe("numbering", () => {
    it("gives KEY-n from the team counter and never repeats under concurrent creates", async () => {
      await getDb().query("UPDATE platform.work_team SET next_number = 41 WHERE key = $1", [TEAM]);
      const results = await Promise.all(Array.from({ length: 5 }, (_, i) => create({ title: `Parallel ${i}` })));
      const numbers = results.map((r) => r.body.item.number as number).sort((a, b) => a - b);
      expect(results.every((r) => r.status === 201)).toBe(true);
      expect(numbers).toEqual([41, 42, 43, 44, 45]);
      expect(results[0]!.body.item.key).toMatch(new RegExp(`^${TEAM}-4[1-5]$`));
    });
  });

  describe("audit trail", () => {
    it("logs create, status move, edit, link and comment with the actor", async () => {
      const created = await create({ title: "Audit me", problem: "P", status: "backlog" });
      const key = created.body.item.key as string;
      const moved = await request(app)
        .patch(`${BASE}/items/${key}`)
        .set("Authorization", platformAdmin.auth)
        .send({ status: "to_spec", title: "Audit me twice", add_links: [{ kind: "artifact", url: "https://claude.ai/artifact/x" }] });
      expect(moved.status).toBe(200);
      expect(moved.body.item.status).toBe("to_spec");
      await request(app).post(`${BASE}/items/${key}/comments`).set("Authorization", platformAdmin.auth).send({ body: "Looks right." });

      const detail = await request(app).get(`${BASE}/items/${key}`).set("Authorization", platformAdmin.auth);
      const kinds = detail.body.events.map((e: { kind: string }) => e.kind);
      expect(kinds).toEqual(["created", "status", "edit", "link", "comment"]);
      const status = detail.body.events[1];
      expect(status).toMatchObject({ from_status: "backlog", to_status: "to_spec", actor: platformAdmin.email, actor_kind: "human" });
    });

    it("refuses to update an event row", async () => {
      await expect(getDb().query("UPDATE platform.work_item_event SET body = 'x' WHERE id = (SELECT max(id) FROM platform.work_item_event)")).rejects.toThrow(
        /append-only/
      );
    });

    it("sets completed_at when an item reaches done and clears it when reopened", async () => {
      const { key } = (await create({ title: "Close me", status: "needs_review" })).body.item;
      const done = await request(app).patch(`${BASE}/items/${key}`).set("Authorization", platformAdmin.auth).send({ status: "done" });
      expect(done.body.item.completed_at).not.toBeNull();
      const reopened = await request(app).patch(`${BASE}/items/${key}`).set("Authorization", platformAdmin.auth).send({ status: "backlog" });
      expect(reopened.body.item.completed_at).toBeNull();
    });
  });

  describe("agent scope", () => {
    it("never sees Triage", async () => {
      const { key } = (await create({ title: "Untriaged tester report", status: "triage" })).body.item;
      const list = await asAgent(request(app).get(`${BASE}/items?team=${TEAM}`));
      expect(list.status).toBe(200);
      expect(list.body.items.some((i: { key: string }) => i.key === key)).toBe(false);
      expect((await asAgent(request(app).get(`${BASE}/items/${key}`))).status).toBe(404);
      expect((await asAgent(request(app).post(`${BASE}/items/${key}/comments`)).send({ body: "hi" })).status).toBe(404);
    });

    it("may write the spec and run the build, logged as the agent", async () => {
      const { key } = (await create({ title: "Nightly work", status: "to_spec" })).body.item;
      const spec = await asAgent(request(app).patch(`${BASE}/items/${key}`)).send({
        status: "spec_ready",
        add_links: [{ kind: "spec", url: "https://claude.ai/artifact/spec" }],
      });
      expect(spec.status).toBe(200);
      await request(app).patch(`${BASE}/items/${key}`).set("Authorization", platformAdmin.auth).send({ status: "approved" });
      expect((await asAgent(request(app).patch(`${BASE}/items/${key}`)).send({ status: "building", branch: "worker/x-1" })).status).toBe(200);
      const review = await asAgent(request(app).patch(`${BASE}/items/${key}`)).send({
        status: "needs_review",
        add_links: [{ kind: "pr", url: "https://github.com/lukasz512/NeoSleep/pull/1" }],
      });
      expect(review.body.item).toMatchObject({ status: "needs_review", branch: "worker/x-1" });
      const detail = await request(app).get(`${BASE}/items/${key}`).set("Authorization", platformAdmin.auth);
      expect(detail.body.events.filter((e: { actor_kind: string }) => e.actor_kind === "agent").length).toBeGreaterThan(0);
    });

    it("cannot approve its own spec, close work, edit the text or create items", async () => {
      const { key } = (await create({ title: "Gate", status: "spec_ready" })).body.item;
      expect((await asAgent(request(app).patch(`${BASE}/items/${key}`)).send({ status: "approved" })).status).toBe(403);
      expect((await asAgent(request(app).patch(`${BASE}/items/${key}`)).send({ title: "Mine now" })).status).toBe(403);
      await request(app).patch(`${BASE}/items/${key}`).set("Authorization", platformAdmin.auth).send({ status: "needs_review" });
      expect((await asAgent(request(app).patch(`${BASE}/items/${key}`)).send({ status: "done" })).status).toBe(403);
      expect((await asAgent(request(app).post(`${BASE}/items`)).send({ team: TEAM, title: "x" })).status).toBe(403);
    });
  });

  describe("validation", () => {
    it("answers 400 with the field for bad input", async () => {
      expect((await create({ title: "" })).body.field).toBe("title");
      expect((await create({ title: "x".repeat(201) })).body.field).toBe("title");
      expect((await create({ title: "ok", status: "wip" })).body.field).toBe("status");
      expect((await create({ title: "ok", problem: "x".repeat(5001) })).body.field).toBe("problem");
      expect((await create({ title: "ok", links: [{ kind: "pr", url: "http://insecure" }] })).body.field).toBe("links");
      const unknownTeam = await request(app).post(`${BASE}/items`).set("Authorization", platformAdmin.auth).send({ team: "NOPE9", title: "x" });
      expect(unknownTeam.body.field).toBe("team");
    });

    it("answers 404 for an unknown or malformed key", async () => {
      expect((await request(app).get(`${BASE}/items/${TEAM}-99999`).set("Authorization", platformAdmin.auth)).status).toBe(404);
      expect((await request(app).get(`${BASE}/items/not-a-key`).set("Authorization", platformAdmin.auth)).status).toBe(404);
    });
  });
});
