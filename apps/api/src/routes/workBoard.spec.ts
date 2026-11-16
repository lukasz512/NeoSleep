import { describe, it, expect, afterAll, beforeAll } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { createHash } from "node:crypto";
import { app } from "../server.js";
import { getDb, withTenant, insertStaffUser, listPlatformAudit } from "../db.js";
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

  describe("session tokens (CORE-187)", () => {
    const TICKET = { problem: "The board is stale.", change: "- Sessions write here", done_when: "- A test proves it" };
    let token: string;
    let tokenId: string;

    function asSession(req: request.Test, value = token): request.Test {
      return req.set("X-Session-Token", value);
    }

    beforeAll(async () => {
      const issued = await request(app).post(`${BASE}/session-tokens`).set("Authorization", platformAdmin.auth).send({ name: `QA laptop ${SUFFIX}` });
      expect(issued.status).toBe(201);
      token = issued.body.token;
      tokenId = issued.body.item.id;
    });

    afterAll(async () => {
      await getDb().query("DELETE FROM platform.work_session_token WHERE name LIKE $1", [`%${SUFFIX}`]);
    });

    it("shows the plaintext once: the list never carries it", async () => {
      expect(token).toMatch(/^nbs_[\w-]{40,}$/);
      const list = await request(app).get(`${BASE}/session-tokens`).set("Authorization", platformAdmin.auth);
      expect(list.status).toBe(200);
      const mine = list.body.items.find((t: { id: string }) => t.id === tokenId);
      expect(mine).toMatchObject({ name: `QA laptop ${SUFFIX}`, revoked_at: null });
      expect(JSON.stringify(list.body)).not.toContain(token);
    });

    it("creates in Building with the session label, logged as the session", async () => {
      const res = await asSession(request(app).post(`${BASE}/items`)).send({ team: TEAM, title: "Session work", status: "done", ...TICKET });
      expect(res.status).toBe(201);
      expect(res.body.item).toMatchObject({ status: "building", source: "session" });
      expect(res.body.item.labels).toContain("session");
      const detail = await request(app).get(`${BASE}/items/${res.body.item.key}`).set("Authorization", platformAdmin.auth);
      expect(detail.body.events[0]).toMatchObject({ kind: "created", actor_kind: "session", actor: `session:QA laptop ${SUFFIX}` });
    });

    it("creates a side ticket in Backlog when the session asks for it (CORE-223)", async () => {
      const res = await asSession(request(app).post(`${BASE}/items`)).send({ team: TEAM, title: "For later", status: "backlog", ...TICKET });
      expect(res.status).toBe(201);
      expect(res.body.item).toMatchObject({ status: "backlog", source: "session" });
      expect(res.body.item.labels).toContain("session");
    });

    it("rejects a ticket without Problem / Change / Done when or over 1500 characters", async () => {
      const missing = await asSession(request(app).post(`${BASE}/items`)).send({ team: TEAM, title: "No body", problem: "x" });
      expect(missing.status).toBe(400);
      expect(missing.body.field).toBe("change");
      const long = await asSession(request(app).post(`${BASE}/items`)).send({ team: TEAM, title: "Long", ...TICKET, change: "x".repeat(1500) });
      expect(long.status).toBe(400);
    });

    it("may comment, link, set the branch and hand over to Needs Review, never close", async () => {
      const { key } = (await asSession(request(app).post(`${BASE}/items`)).send({ team: TEAM, title: "Hand over", ...TICKET })).body.item;
      expect((await asSession(request(app).post(`${BASE}/items/${key}/comments`)).send({ body: "Branch: worktree-x" })).status).toBe(201);
      const review = await asSession(request(app).patch(`${BASE}/items/${key}`)).send({
        status: "needs_review",
        branch: "worktree-core-1-x",
        add_links: [{ kind: "artifact", url: "https://claude.ai/artifact/x" }],
      });
      expect(review.status).toBe(200);
      expect(review.body.item.status).toBe("needs_review");
      expect((await asSession(request(app).patch(`${BASE}/items/${key}`)).send({ status: "done" })).status).toBe(403);
      expect((await asSession(request(app).patch(`${BASE}/items/${key}`)).send({ status: "canceled" })).status).toBe(403);
      expect((await asSession(request(app).patch(`${BASE}/items/${key}`)).send({ title: "Renamed" })).status).toBe(403);
    });

    it("picks up a backlog item but never sees Triage or reopens closed work", async () => {
      const backlog = (await create({ title: "Waiting" })).body.item.key;
      expect((await asSession(request(app).patch(`${BASE}/items/${backlog}`)).send({ status: "building" })).status).toBe(200);
      const triage = (await create({ title: "Report", status: "triage" })).body.item.key;
      expect((await asSession(request(app).get(`${BASE}/items/${triage}`))).status).toBe(404);
      const done = (await create({ title: "Shipped", status: "done" })).body.item.key;
      expect((await asSession(request(app).patch(`${BASE}/items/${done}`)).send({ status: "building" })).status).toBe(403);
    });

    it("cannot manage tokens", async () => {
      expect((await asSession(request(app).get(`${BASE}/session-tokens`))).status).toBe(403);
      expect((await asSession(request(app).post(`${BASE}/session-tokens`)).send({ name: "more" })).status).toBe(403);
    });

    it("answers 401 for a wrong or revoked token", async () => {
      expect((await asSession(request(app).get(`${BASE}/items`), "nbs_wrong")).status).toBe(401);
      const spare = await request(app).post(`${BASE}/session-tokens`).set("Authorization", platformAdmin.auth).send({ name: `Spare ${SUFFIX}` });
      expect((await asSession(request(app).get(`${BASE}/teams`), spare.body.token)).status).toBe(200);
      const revoked = await request(app).delete(`${BASE}/session-tokens/${spare.body.item.id}`).set("Authorization", platformAdmin.auth);
      expect(revoked.status).toBe(204);
      expect((await asSession(request(app).get(`${BASE}/teams`), spare.body.token)).status).toBe(401);
    });

    it("leaves a platform.audit row for issuing and revoking, never the token itself (CORE-213)", async () => {
      const spare = await request(app).post(`${BASE}/session-tokens`).set("Authorization", platformAdmin.auth).send({ name: `Audited ${SUFFIX}` });
      await request(app).delete(`${BASE}/session-tokens/${spare.body.item.id}`).set("Authorization", platformAdmin.auth);
      const trail = await listPlatformAudit("work_session_token", spare.body.item.id);
      expect(trail.map((r) => r.action)).toEqual(["board.session_token.revoke", "board.session_token.issue"]);
      expect(trail[1]!.after).toEqual({ name: `Audited ${SUFFIX}` });
      for (const row of trail) {
        expect(row.actor_email).toBe(platformAdmin.email);
        expect(row.actor_id).not.toBeNull();
      }
      expect(JSON.stringify(trail)).not.toContain(spare.body.token);
      // A second revoke changes nothing and logs nothing.
      expect((await request(app).delete(`${BASE}/session-tokens/${spare.body.item.id}`).set("Authorization", platformAdmin.auth)).status).toBe(404);
      expect(await listPlatformAudit("work_session_token", spare.body.item.id)).toHaveLength(2);
    });
  });

  describe("git state (CORE-221)", () => {
    const SHA = "a".repeat(40);
    const SMOKE = "https://github.com/lukasz512/neoSLEEP/actions/runs/1";

    async function inReview(title: string, labels: string[] = []): Promise<string> {
      const created = await create({ title, status: "needs_review", labels });
      return created.body.item.key as string;
    }
    async function read(key: string) {
      return (await request(app).get(`${BASE}/items/${key}`).set("Authorization", platformAdmin.auth)).body;
    }
    function reportGit(body: Record<string, unknown>) {
      return asAgent(request(app).post(`${BASE}/git-state`)).send(body);
    }

    it("a new item has never been checked", async () => {
      const created = await create({ title: "Unchecked" });
      expect(created.body.item.git_state).toBeNull();
    });

    it("stores the state and commit per item and skips unknown keys", async () => {
      const key = await inReview("On dev");
      const res = await reportGit({ items: [{ key, state: "dev", sha: SHA }, { key: `${TEAM}-99999`, state: "prod", sha: SHA }] });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ updated: 1, closed: [], tidied: { to_review: [], to_backlog: [] } });
      const { item, events } = await read(key);
      expect(item).toMatchObject({ git_state: "dev", git_sha: SHA, status: "needs_review" });
      expect(item.git_checked_at).not.toBeNull();
      // A git fact is not an edit: the trail holds only the creation.
      expect(events.map((e: { kind: string }) => e.kind)).toEqual(["created"]);
    });

    it("a complete report marks every item it leaves out as not merged", async () => {
      const cited = await inReview("Cited");
      const left = await inReview("Left out");
      await reportGit({ items: [{ key: left, state: "dev", sha: SHA }] });
      await reportGit({ items: [{ key: cited, state: "prod", sha: SHA }], complete: true });
      expect((await read(cited)).item.git_state).toBe("prod");
      expect((await read(left)).item).toMatchObject({ git_state: "none", git_sha: null });
    });

    it("without close, an item on prod stays in Needs Review", async () => {
      const key = await inReview("Shipped, smoke unknown");
      const res = await reportGit({ items: [{ key, state: "prod", sha: SHA }] });
      expect(res.body.closed).toEqual([]);
      expect((await read(key)).item.status).toBe("needs_review");
    });

    it("close moves Needs Review items on prod to Done with a status event and a comment", async () => {
      const shipped = await inReview("Shipped");
      const held = await inReview("Shipped but held", ["hold"]);
      const onDev = await inReview("Only on dev");
      const building = (await create({ title: "Building, on prod", status: "building" })).body.item.key as string;
      const res = await reportGit({
        items: [
          { key: shipped, state: "prod", sha: SHA },
          { key: held, state: "prod", sha: SHA },
          { key: onDev, state: "dev", sha: SHA },
          { key: building, state: "prod", sha: SHA },
        ],
        close: { smoke_url: SMOKE },
      });
      expect(res.status).toBe(200);
      expect(res.body.closed).toContain(shipped);
      for (const key of [held, onDev, building]) expect(res.body.closed).not.toContain(key);

      const done = await read(shipped);
      expect(done.item.status).toBe("done");
      expect(done.item.completed_at).not.toBeNull();
      const status = done.events.find((e: { kind: string }) => e.kind === "status");
      expect(status).toMatchObject({ from_status: "needs_review", to_status: "done", actor: "agent", actor_kind: "agent" });
      const comment = done.events.find((e: { kind: string }) => e.kind === "comment");
      expect(comment.body).toContain("aaaaaaa");
      expect(comment.body).toContain(SMOKE);

      expect((await read(held)).item.status).toBe("needs_review");
      expect((await read(onDev)).item.status).toBe("needs_review");
      expect((await read(building)).item.status).toBe("building");
    });

    it("a session may report a state but may not close or send a complete report", async () => {
      const issued = await request(app).post(`${BASE}/session-tokens`).set("Authorization", platformAdmin.auth).send({ name: `Git ${SUFFIX}` });
      const asSession = (body: Record<string, unknown>) => request(app).post(`${BASE}/git-state`).set("X-Session-Token", issued.body.token).send(body);
      const key = await inReview("Session report");
      const items = [{ key, state: "prod", sha: SHA }];
      expect((await asSession({ items })).status).toBe(200);
      expect((await asSession({ items, close: { smoke_url: SMOKE } })).status).toBe(403);
      expect((await asSession({ items, complete: true })).status).toBe(403);
      expect((await read(key)).item).toMatchObject({ git_state: "prod", status: "needs_review" });
      await getDb().query("DELETE FROM platform.work_session_token WHERE id = $1", [issued.body.item.id]);
    });

    describe("tidy: Building means a branch exists (CORE-223)", () => {
      async function building(title: string, daysInBuilding: number, extra: Record<string, unknown> = {}): Promise<string> {
        const key = (await create({ title, status: "building", ...extra })).body.item.key as string;
        await getDb().query(
          `UPDATE platform.work_item SET status_changed_at = now() - make_interval(days => $2::int) WHERE team_key || '-' || number = $1`,
          [key, daysInBuilding]
        );
        return key;
      }
      async function patch(key: string, body: Record<string, unknown>) {
        return request(app).patch(`${BASE}/items/${key}`).set("Authorization", platformAdmin.auth).send(body);
      }

      it("moves a Building item that git sees on dev to Needs Review, with a status event and a comment", async () => {
        const merged = await building("Merged, still Building", 0);
        const held = await building("Merged, on hold", 0, { labels: ["hold"] });
        const res = await reportGit({ items: [{ key: merged, state: "dev", sha: SHA }, { key: held, state: "dev", sha: SHA }], tidy: { branches: [] } });
        expect(res.status).toBe(200);
        expect(res.body.tidied.to_review).toContain(merged);
        expect(res.body.tidied.to_review).not.toContain(held);

        const moved = await read(merged);
        expect(moved.item.status).toBe("needs_review");
        const status = moved.events.find((e: { kind: string }) => e.kind === "status");
        expect(status).toMatchObject({ from_status: "building", to_status: "needs_review", actor_kind: "agent" });
        expect(moved.events.find((e: { kind: string }) => e.kind === "comment").body).toContain("aaaaaaa");
        expect((await read(held)).item.status).toBe("building");
      });

      it("returns a Building item with no branch for more than 3 days to Backlog, and says why", async () => {
        const idle = await building("Idle, no branch", 4);
        const res = await reportGit({ items: [], tidy: { branches: [] } });
        expect(res.body.tidied.to_backlog).toContain(idle);
        const moved = await read(idle);
        expect(moved.item.status).toBe("backlog");
        expect(moved.events.find((e: { kind: string }) => e.kind === "status")).toMatchObject({ from_status: "building", to_status: "backlog" });
        expect(moved.events.find((e: { kind: string }) => e.kind === "comment").body).toContain("no branch");
      });

      it("leaves a young item, one with a branch, one with a remote branch and one on hold", async () => {
        const young = await building("Young", 2);
        const withBranch = await building("Has the branch field", 30);
        await patch(withBranch, { branch: "worktree-qa-1-has-branch" });
        await getDb().query(`UPDATE platform.work_item SET status_changed_at = now() - interval '30 days' WHERE team_key || '-' || number = $1`, [withBranch]);
        const remote = await building("Has a remote branch", 30);
        const held = await building("Idle, on hold", 30, { labels: ["hold"] });
        const res = await reportGit({ items: [], tidy: { branches: [remote] } });
        for (const key of [young, withBranch, remote, held]) {
          expect(res.body.tidied.to_backlog).not.toContain(key);
          expect((await read(key)).item.status).toBe("building");
        }
      });

      it("does not bounce an item a person sent back from Needs Review for rework", async () => {
        const key = await inReview("Rework");
        await patch(key, { status: "building" });
        const res = await reportGit({ items: [{ key, state: "dev", sha: SHA }], tidy: { branches: [] } });
        expect(res.body.tidied.to_review).not.toContain(key);
        expect((await read(key)).item.status).toBe("building");
      });

      it("without tidy nothing in Building moves; a session cannot tidy; bad input names the field", async () => {
        const idle = await building("Idle, no tidy asked", 10);
        expect((await reportGit({ items: [] })).body.tidied).toEqual({ to_review: [], to_backlog: [] });
        expect((await read(idle)).item.status).toBe("building");

        const issued = await request(app).post(`${BASE}/session-tokens`).set("Authorization", platformAdmin.auth).send({ name: `Tidy ${SUFFIX}` });
        const session = await request(app).post(`${BASE}/git-state`).set("X-Session-Token", issued.body.token).send({ items: [], tidy: { branches: [] } });
        expect(session.status).toBe(403);
        expect((await read(idle)).item.status).toBe("building");
        await getDb().query("DELETE FROM platform.work_session_token WHERE id = $1", [issued.body.item.id]);

        expect((await reportGit({ items: [], tidy: {} })).body.field).toBe("tidy");
        expect((await reportGit({ items: [], tidy: { branches: ["nope"] } })).body.field).toBe("tidy");
      });
    });

    it("403 for a tenant admin, 400 with the field for bad input", async () => {
      const key = await inReview("Validation");
      const tenant = await request(app).post(`${BASE}/git-state`).set("Authorization", tenantAdmin.auth).send({ items: [] });
      expect(tenant.status).toBe(403);
      expect((await reportGit({})).body.field).toBe("items");
      expect((await reportGit({ items: [{ key, state: "none", sha: SHA }] })).body.field).toBe("items");
      expect((await reportGit({ items: [{ key, state: "dev", sha: "not a sha" }] })).body.field).toBe("items");
      expect((await reportGit({ items: [{ key: "nope", state: "dev", sha: SHA }] })).body.field).toBe("items");
      expect((await reportGit({ items: [], close: { smoke_url: "http://insecure" } })).body.field).toBe("close");
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
