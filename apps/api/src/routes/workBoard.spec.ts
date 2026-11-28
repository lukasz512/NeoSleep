import { describe, it, expect, afterAll, beforeAll } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { createHash } from "node:crypto";
import { app } from "../server.js";
import {
  getDb,
  withTenant,
  insertStaffUser,
  listPlatformAudit,
} from "../db.js";
import { signAuthToken } from "../utils/jwt.js";
import type { StaffRole } from "../db/users.js";

/**
 * Platform work board (CORE-177) through the real Express stack and real Postgres
 * (platform.work_team / work_item / work_item_event). Each run uses its own team key,
 * so it never collides with CORE/NEO rows or a parallel run.
 */
const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";
const SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const TEAM = `T${Math.random()
  .toString(36)
  .slice(2, 8)
  .toUpperCase()
  .replace(/[^A-Z0-9]/g, "X")}`;
const AGENT_TOKEN = `agent-${SUFFIX}`;
const BASE = "/api/v1/platform/work";

interface Account {
  email: string;
  auth: string;
}

async function account(role: StaffRole, label: string): Promise<Account> {
  return withTenant(TENANT_SLUG, async (client) => {
    const email = `qa-wb-${label}-${SUFFIX}@neosleepcare.com`;
    const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
    const user = await insertStaffUser(
      client,
      email,
      "QA",
      `Board ${label}`,
      role,
      hash,
      false,
    );
    return {
      email,
      auth: `Bearer ${signAuthToken({ id: user!.id, email, role, token_version: 0 })}`,
    };
  });
}

describe("platform work board", () => {
  let platformAdmin: Account;
  let tenantAdmin: Account;
  const previousHash = process.env.WORK_BOARD_AGENT_TOKEN_SHA256;

  async function create(body: Record<string, unknown>) {
    return request(app)
      .post(`${BASE}/items`)
      .set("Authorization", platformAdmin.auth)
      .send({ team: TEAM, ...body });
  }
  function asAgent(req: request.Test): request.Test {
    return req.set("X-Agent-Token", AGENT_TOKEN);
  }

  beforeAll(async () => {
    process.env.WORK_BOARD_AGENT_TOKEN_SHA256 = createHash("sha256")
      .update(AGENT_TOKEN)
      .digest("hex");
    platformAdmin = await account("admin", "platform");
    tenantAdmin = await account("admin", "tenant");
    await getDb().query(
      `INSERT INTO platform.users (email, name, role, is_active) VALUES ($1, 'QA Board', 'owner', true)`,
      [platformAdmin.email],
    );
    await getDb().query(
      `INSERT INTO platform.work_team (key, name, kind, sort_order) VALUES ($1, 'QA team', 'client', 999)`,
      [TEAM],
    );
  });

  afterAll(async () => {
    if (previousHash === undefined)
      delete process.env.WORK_BOARD_AGENT_TOKEN_SHA256;
    else process.env.WORK_BOARD_AGENT_TOKEN_SHA256 = previousHash;
    await getDb().query("DELETE FROM platform.work_item WHERE team_key = $1", [
      TEAM,
    ]);
    await getDb().query("DELETE FROM platform.work_team WHERE key = $1", [
      TEAM,
    ]);
    await getDb().query(
      "DELETE FROM platform.users WHERE lower(email) LIKE $1",
      [`qa-wb-%-${SUFFIX}@%`],
    );
  });

  describe("access", () => {
    it("401 without login, 403 for a tenant admin, 200 for a platform admin", async () => {
      expect((await request(app).get(`${BASE}/items`)).status).toBe(401);
      expect(
        (
          await request(app)
            .get(`${BASE}/items`)
            .set("Authorization", tenantAdmin.auth)
        ).status,
      ).toBe(403);
      const ok = await request(app)
        .get(`${BASE}/teams`)
        .set("Authorization", platformAdmin.auth);
      expect(ok.status).toBe(200);
      expect(ok.body.items.map((t: { key: string }) => t.key)).toEqual(
        expect.arrayContaining(["CORE", "NEO", TEAM]),
      );
    });

    it("rejects a wrong agent token with 401", async () => {
      const res = await request(app)
        .get(`${BASE}/items`)
        .set("X-Agent-Token", "wrong");
      expect(res.status).toBe(401);
    });
  });

  describe("numbering", () => {
    it("gives KEY-n from the team counter and never repeats under concurrent creates", async () => {
      await getDb().query(
        "UPDATE platform.work_team SET next_number = 41 WHERE key = $1",
        [TEAM],
      );
      const results = await Promise.all(
        Array.from({ length: 5 }, (_, i) => create({ title: `Parallel ${i}` })),
      );
      const numbers = results
        .map((r) => r.body.item.number as number)
        .sort((a, b) => a - b);
      expect(results.every((r) => r.status === 201)).toBe(true);
      expect(numbers).toEqual([41, 42, 43, 44, 45]);
      expect(results[0]!.body.item.key).toMatch(new RegExp(`^${TEAM}-4[1-5]$`));
    });
  });

  describe("audit trail", () => {
    it("logs create, status move, edit, link and comment with the actor", async () => {
      const created = await create({
        title: "Audit me",
        problem: "P",
        status: "backlog",
      });
      const key = created.body.item.key as string;
      const moved = await request(app)
        .patch(`${BASE}/items/${key}`)
        .set("Authorization", platformAdmin.auth)
        .send({
          status: "to_spec",
          title: "Audit me twice",
          add_links: [
            { kind: "artifact", url: "https://claude.ai/artifact/x" },
          ],
        });
      expect(moved.status).toBe(200);
      expect(moved.body.item.status).toBe("to_spec");
      await request(app)
        .post(`${BASE}/items/${key}/comments`)
        .set("Authorization", platformAdmin.auth)
        .send({ body: "Looks right." });

      const detail = await request(app)
        .get(`${BASE}/items/${key}`)
        .set("Authorization", platformAdmin.auth);
      const kinds = detail.body.events.map((e: { kind: string }) => e.kind);
      expect(kinds).toEqual(["created", "status", "edit", "link", "comment"]);
      const status = detail.body.events[1];
      expect(status).toMatchObject({
        from_status: "backlog",
        to_status: "to_spec",
        actor: platformAdmin.email,
        actor_kind: "human",
      });
    });

    it("refuses to update an event row", async () => {
      await expect(
        getDb().query(
          "UPDATE platform.work_item_event SET body = 'x' WHERE id = (SELECT max(id) FROM platform.work_item_event)",
        ),
      ).rejects.toThrow(/append-only/);
    });

    it("sets completed_at when an item reaches done and clears it when reopened", async () => {
      const { key } = (
        await create({ title: "Close me", status: "needs_review" })
      ).body.item;
      const done = await request(app)
        .patch(`${BASE}/items/${key}`)
        .set("Authorization", platformAdmin.auth)
        .send({ status: "done" });
      expect(done.body.item.completed_at).not.toBeNull();
      const reopened = await request(app)
        .patch(`${BASE}/items/${key}`)
        .set("Authorization", platformAdmin.auth)
        .send({ status: "backlog" });
      expect(reopened.body.item.completed_at).toBeNull();
    });
  });

  describe("agent scope", () => {
    it("never sees Triage", async () => {
      const { key } = (
        await create({ title: "Untriaged tester report", status: "triage" })
      ).body.item;
      const list = await asAgent(
        request(app).get(`${BASE}/items?team=${TEAM}`),
      );
      expect(list.status).toBe(200);
      expect(list.body.items.some((i: { key: string }) => i.key === key)).toBe(
        false,
      );
      expect(
        (await asAgent(request(app).get(`${BASE}/items/${key}`))).status,
      ).toBe(404);
      expect(
        (
          await asAgent(
            request(app).post(`${BASE}/items/${key}/comments`),
          ).send({ body: "hi" })
        ).status,
      ).toBe(404);
    });

    it("may write the spec and run the build, logged as the agent", async () => {
      const { key } = (
        await create({
          title: "Nightly work",
          status: "to_spec",
          priority: 2,
          done_when: "- It is built",
        })
      ).body.item;
      const spec = await asAgent(
        request(app).patch(`${BASE}/items/${key}`),
      ).send({
        status: "spec_ready",
        add_links: [{ kind: "spec", url: "https://claude.ai/artifact/spec" }],
      });
      expect(spec.status).toBe(200);
      await request(app)
        .patch(`${BASE}/items/${key}`)
        .set("Authorization", platformAdmin.auth)
        .send({ status: "approved" });
      expect(
        (
          await asAgent(request(app).patch(`${BASE}/items/${key}`)).send({
            status: "building",
            branch: "worker/x-1",
          })
        ).status,
      ).toBe(200);
      const review = await asAgent(
        request(app).patch(`${BASE}/items/${key}`),
      ).send({
        status: "needs_review",
        add_links: [
          { kind: "pr", url: "https://github.com/lukasz512/NeoSleep/pull/1" },
          { kind: "artifact", url: "https://claude.ai/artifact/built" },
          {
            kind: "ci",
            url: "https://github.com/lukasz512/NeoSleep/actions/runs/1",
            state: "passed",
          },
        ],
      });
      expect(review.body.item).toMatchObject({
        status: "needs_review",
        branch: "worker/x-1",
      });
      const detail = await request(app)
        .get(`${BASE}/items/${key}`)
        .set("Authorization", platformAdmin.auth);
      expect(
        detail.body.events.filter(
          (e: { actor_kind: string }) => e.actor_kind === "agent",
        ).length,
      ).toBeGreaterThan(0);
    });

    it("cannot approve its own spec, close work, edit the text or create items", async () => {
      const { key } = (await create({ title: "Gate", status: "spec_ready" }))
        .body.item;
      expect(
        (
          await asAgent(request(app).patch(`${BASE}/items/${key}`)).send({
            status: "approved",
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await asAgent(request(app).patch(`${BASE}/items/${key}`)).send({
            title: "Mine now",
          })
        ).status,
      ).toBe(403);
      await request(app)
        .patch(`${BASE}/items/${key}`)
        .set("Authorization", platformAdmin.auth)
        .send({ status: "needs_review" });
      expect(
        (
          await asAgent(request(app).patch(`${BASE}/items/${key}`)).send({
            status: "done",
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await asAgent(request(app).post(`${BASE}/items`)).send({
            team: TEAM,
            title: "x",
          })
        ).status,
      ).toBe(403);
    });
  });

  describe("session tokens (CORE-187)", () => {
    const TICKET = {
      problem: "The board is stale.",
      change: "- Sessions write here",
      done_when: "- A test proves it",
    };
    let token: string;
    let tokenId: string;

    function asSession(req: request.Test, value = token): request.Test {
      return req.set("X-Session-Token", value);
    }

    beforeAll(async () => {
      const issued = await request(app)
        .post(`${BASE}/session-tokens`)
        .set("Authorization", platformAdmin.auth)
        .send({ name: `QA laptop ${SUFFIX}` });
      expect(issued.status).toBe(201);
      token = issued.body.token;
      tokenId = issued.body.item.id;
    });

    afterAll(async () => {
      await getDb().query(
        "DELETE FROM platform.work_session_token WHERE name LIKE $1",
        [`%${SUFFIX}`],
      );
    });

    it("shows the plaintext once: the list never carries it", async () => {
      expect(token).toMatch(/^nbs_[\w-]{40,}$/);
      const list = await request(app)
        .get(`${BASE}/session-tokens`)
        .set("Authorization", platformAdmin.auth);
      expect(list.status).toBe(200);
      const mine = list.body.items.find(
        (t: { id: string }) => t.id === tokenId,
      );
      expect(mine).toMatchObject({
        name: `QA laptop ${SUFFIX}`,
        revoked_at: null,
      });
      expect(JSON.stringify(list.body)).not.toContain(token);
    });

    it("creates in Building with the session label, logged as the session", async () => {
      const res = await asSession(request(app).post(`${BASE}/items`)).send({
        team: TEAM,
        title: "Session work",
        status: "done",
        ...TICKET,
      });
      expect(res.status).toBe(201);
      expect(res.body.item).toMatchObject({
        status: "building",
        source: "session",
      });
      expect(res.body.item.labels).toContain("session");
      const detail = await request(app)
        .get(`${BASE}/items/${res.body.item.key}`)
        .set("Authorization", platformAdmin.auth);
      expect(detail.body.events[0]).toMatchObject({
        kind: "created",
        actor_kind: "session",
        actor: `session:QA laptop ${SUFFIX}`,
      });
    });

    it("creates a side ticket in Backlog when the session asks for it (CORE-223)", async () => {
      const res = await asSession(request(app).post(`${BASE}/items`)).send({
        team: TEAM,
        title: "For later",
        status: "backlog",
        ...TICKET,
      });
      expect(res.status).toBe(201);
      expect(res.body.item).toMatchObject({
        status: "backlog",
        source: "session",
      });
      expect(res.body.item.labels).toContain("session");
    });

    it("rejects a ticket without Problem / Change / Done when or over 1500 characters", async () => {
      const missing = await asSession(request(app).post(`${BASE}/items`)).send({
        team: TEAM,
        title: "No body",
        problem: "x",
      });
      expect(missing.status).toBe(400);
      expect(missing.body.field).toBe("change");
      const long = await asSession(request(app).post(`${BASE}/items`)).send({
        team: TEAM,
        title: "Long",
        ...TICKET,
        change: "x".repeat(1500),
      });
      expect(long.status).toBe(400);
    });

    it("may comment, link, set the branch and hand over to Needs Review, never close", async () => {
      const { key } = (
        await asSession(request(app).post(`${BASE}/items`)).send({
          team: TEAM,
          title: "Hand over",
          ...TICKET,
        })
      ).body.item;
      expect(
        (
          await asSession(
            request(app).post(`${BASE}/items/${key}/comments`),
          ).send({ body: "Branch: worktree-x" })
        ).status,
      ).toBe(201);
      const review = await asSession(
        request(app).patch(`${BASE}/items/${key}`),
      ).send({
        status: "needs_review",
        branch: "worktree-core-1-x",
        add_links: [
          { kind: "artifact", url: "https://claude.ai/artifact/x" },
          {
            kind: "ci",
            url: "https://github.com/lukasz512/NeoSleep/actions/runs/2",
            state: "passed",
          },
        ],
      });
      expect(review.status).toBe(200);
      expect(review.body.item.status).toBe("needs_review");
      expect(
        (
          await asSession(request(app).patch(`${BASE}/items/${key}`)).send({
            status: "done",
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await asSession(request(app).patch(`${BASE}/items/${key}`)).send({
            status: "canceled",
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await asSession(request(app).patch(`${BASE}/items/${key}`)).send({
            title: "Renamed",
          })
        ).status,
      ).toBe(403);
    });

    it("picks up a backlog item but never sees Triage or reopens closed work", async () => {
      const backlog = (await create({ title: "Waiting" })).body.item.key;
      expect(
        (
          await asSession(request(app).patch(`${BASE}/items/${backlog}`)).send({
            status: "building",
          })
        ).status,
      ).toBe(200);
      const triage = (await create({ title: "Report", status: "triage" })).body
        .item.key;
      expect(
        (await asSession(request(app).get(`${BASE}/items/${triage}`))).status,
      ).toBe(404);
      const done = (await create({ title: "Shipped", status: "done" })).body
        .item.key;
      expect(
        (
          await asSession(request(app).patch(`${BASE}/items/${done}`)).send({
            status: "building",
          })
        ).status,
      ).toBe(403);
    });

    it("cannot manage tokens", async () => {
      expect(
        (await asSession(request(app).get(`${BASE}/session-tokens`))).status,
      ).toBe(403);
      expect(
        (
          await asSession(request(app).post(`${BASE}/session-tokens`)).send({
            name: "more",
          })
        ).status,
      ).toBe(403);
    });

    it("answers 401 for a wrong or revoked token", async () => {
      expect(
        (await asSession(request(app).get(`${BASE}/items`), "nbs_wrong"))
          .status,
      ).toBe(401);
      const spare = await request(app)
        .post(`${BASE}/session-tokens`)
        .set("Authorization", platformAdmin.auth)
        .send({ name: `Spare ${SUFFIX}` });
      expect(
        (await asSession(request(app).get(`${BASE}/teams`), spare.body.token))
          .status,
      ).toBe(200);
      const revoked = await request(app)
        .delete(`${BASE}/session-tokens/${spare.body.item.id}`)
        .set("Authorization", platformAdmin.auth);
      expect(revoked.status).toBe(204);
      expect(
        (await asSession(request(app).get(`${BASE}/teams`), spare.body.token))
          .status,
      ).toBe(401);
    });

    it("leaves a platform.audit row for issuing and revoking, never the token itself (CORE-213)", async () => {
      const spare = await request(app)
        .post(`${BASE}/session-tokens`)
        .set("Authorization", platformAdmin.auth)
        .send({ name: `Audited ${SUFFIX}` });
      await request(app)
        .delete(`${BASE}/session-tokens/${spare.body.item.id}`)
        .set("Authorization", platformAdmin.auth);
      const trail = await listPlatformAudit(
        "work_session_token",
        spare.body.item.id,
      );
      expect(trail.map((r) => r.action)).toEqual([
        "board.session_token.revoke",
        "board.session_token.issue",
      ]);
      expect(trail[1]!.after).toEqual({ name: `Audited ${SUFFIX}` });
      for (const row of trail) {
        expect(row.actor_email).toBe(platformAdmin.email);
        expect(row.actor_id).not.toBeNull();
      }
      expect(JSON.stringify(trail)).not.toContain(spare.body.token);
      // A second revoke changes nothing and logs nothing.
      expect(
        (
          await request(app)
            .delete(`${BASE}/session-tokens/${spare.body.item.id}`)
            .set("Authorization", platformAdmin.auth)
        ).status,
      ).toBe(404);
      expect(
        await listPlatformAudit("work_session_token", spare.body.item.id),
      ).toHaveLength(2);
    });
  });

  describe("git state (CORE-221)", () => {
    const SHA = "a".repeat(40);
    const SMOKE = "https://github.com/lukasz512/neoSLEEP/actions/runs/1";

    async function inReview(
      title: string,
      labels: string[] = [],
    ): Promise<string> {
      const created = await create({ title, status: "needs_review", labels });
      return created.body.item.key as string;
    }
    async function read(key: string) {
      return (
        await request(app)
          .get(`${BASE}/items/${key}`)
          .set("Authorization", platformAdmin.auth)
      ).body;
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
      const res = await reportGit({
        items: [
          { key, state: "dev", sha: SHA },
          { key: `${TEAM}-99999`, state: "prod", sha: SHA },
        ],
      });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        updated: 1,
        closed: [],
        tidied: { to_review: [], to_backlog: [], to_later: [] },
      });
      const { item, events } = await read(key);
      expect(item).toMatchObject({
        git_state: "dev",
        git_sha: SHA,
        status: "needs_review",
      });
      expect(item.git_checked_at).not.toBeNull();
      // A git fact is not an edit: the trail holds only the creation.
      expect(events.map((e: { kind: string }) => e.kind)).toEqual(["created"]);
    });

    it("a complete report marks every item it leaves out as not merged", async () => {
      const cited = await inReview("Cited");
      const left = await inReview("Left out");
      await reportGit({ items: [{ key: left, state: "dev", sha: SHA }] });
      await reportGit({
        items: [{ key: cited, state: "prod", sha: SHA }],
        complete: true,
      });
      expect((await read(cited)).item.git_state).toBe("prod");
      expect((await read(left)).item).toMatchObject({
        git_state: "none",
        git_sha: null,
      });
    });

    it("without close, an item on prod stays in Needs Review", async () => {
      const key = await inReview("Shipped, smoke unknown");
      const res = await reportGit({
        items: [{ key, state: "prod", sha: SHA }],
      });
      expect(res.body.closed).toEqual([]);
      expect((await read(key)).item.status).toBe("needs_review");
    });

    it("close moves Needs Review items on prod to Done with a status event and a comment", async () => {
      const shipped = await inReview("Shipped");
      const held = await inReview("Shipped but held", ["hold"]);
      const onDev = await inReview("Only on dev");
      const building = (
        await create({ title: "Building, on prod", status: "building" })
      ).body.item.key as string;
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
      for (const key of [held, onDev, building])
        expect(res.body.closed).not.toContain(key);

      const done = await read(shipped);
      expect(done.item.status).toBe("done");
      expect(done.item.completed_at).not.toBeNull();
      const status = done.events.find(
        (e: { kind: string }) => e.kind === "status",
      );
      expect(status).toMatchObject({
        from_status: "needs_review",
        to_status: "done",
        actor: "agent",
        actor_kind: "agent",
      });
      const comment = done.events.find(
        (e: { kind: string }) => e.kind === "comment",
      );
      expect(comment.body).toContain("aaaaaaa");
      expect(comment.body).toContain(SMOKE);

      expect((await read(held)).item.status).toBe("needs_review");
      expect((await read(onDev)).item.status).toBe("needs_review");
      expect((await read(building)).item.status).toBe("building");
    });

    it("a session may report a state but may not close or send a complete report", async () => {
      const issued = await request(app)
        .post(`${BASE}/session-tokens`)
        .set("Authorization", platformAdmin.auth)
        .send({ name: `Git ${SUFFIX}` });
      const asSession = (body: Record<string, unknown>) =>
        request(app)
          .post(`${BASE}/git-state`)
          .set("X-Session-Token", issued.body.token)
          .send(body);
      const key = await inReview("Session report");
      const items = [{ key, state: "prod", sha: SHA }];
      expect((await asSession({ items })).status).toBe(200);
      expect(
        (await asSession({ items, close: { smoke_url: SMOKE } })).status,
      ).toBe(403);
      expect((await asSession({ items, complete: true })).status).toBe(403);
      expect((await read(key)).item).toMatchObject({
        git_state: "prod",
        status: "needs_review",
      });
      await getDb().query(
        "DELETE FROM platform.work_session_token WHERE id = $1",
        [issued.body.item.id],
      );
    });

    describe("tidy: Building means a branch exists (CORE-223)", () => {
      async function building(
        title: string,
        daysInBuilding: number,
        extra: Record<string, unknown> = {},
      ): Promise<string> {
        const key = (await create({ title, status: "building", ...extra })).body
          .item.key as string;
        await getDb().query(
          `UPDATE platform.work_item SET status_changed_at = now() - make_interval(days => $2::int) WHERE team_key || '-' || number = $1`,
          [key, daysInBuilding],
        );
        return key;
      }
      async function patch(key: string, body: Record<string, unknown>) {
        return request(app)
          .patch(`${BASE}/items/${key}`)
          .set("Authorization", platformAdmin.auth)
          .send(body);
      }

      it("moves a Building item that git sees on dev to Needs Review, with a status event and a comment", async () => {
        const merged = await building("Merged, still Building", 0);
        const held = await building("Merged, on hold", 0, { labels: ["hold"] });
        const res = await reportGit({
          items: [
            { key: merged, state: "dev", sha: SHA },
            { key: held, state: "dev", sha: SHA },
          ],
          tidy: { branches: [] },
        });
        expect(res.status).toBe(200);
        expect(res.body.tidied.to_review).toContain(merged);
        expect(res.body.tidied.to_review).not.toContain(held);

        const moved = await read(merged);
        expect(moved.item.status).toBe("needs_review");
        const status = moved.events.find(
          (e: { kind: string }) => e.kind === "status",
        );
        expect(status).toMatchObject({
          from_status: "building",
          to_status: "needs_review",
          actor_kind: "agent",
        });
        expect(
          moved.events.find((e: { kind: string }) => e.kind === "comment").body,
        ).toContain("aaaaaaa");
        expect((await read(held)).item.status).toBe("building");
      });

      it("returns a Building item with no branch for more than 3 days to Backlog, and says why", async () => {
        const idle = await building("Idle, no branch", 4);
        const res = await reportGit({ items: [], tidy: { branches: [] } });
        expect(res.body.tidied.to_backlog).toContain(idle);
        const moved = await read(idle);
        expect(moved.item.status).toBe("backlog");
        expect(
          moved.events.find((e: { kind: string }) => e.kind === "status"),
        ).toMatchObject({ from_status: "building", to_status: "backlog" });
        expect(
          moved.events.find((e: { kind: string }) => e.kind === "comment").body,
        ).toContain("no branch");
      });

      it("leaves a young item, one with a branch, one with a remote branch and one on hold", async () => {
        const young = await building("Young", 2);
        const withBranch = await building("Has the branch field", 30);
        await patch(withBranch, { branch: "worktree-qa-1-has-branch" });
        await getDb().query(
          `UPDATE platform.work_item SET status_changed_at = now() - interval '30 days' WHERE team_key || '-' || number = $1`,
          [withBranch],
        );
        const remote = await building("Has a remote branch", 30);
        const held = await building("Idle, on hold", 30, { labels: ["hold"] });
        const res = await reportGit({
          items: [],
          tidy: { branches: [remote] },
        });
        for (const key of [young, withBranch, remote, held]) {
          expect(res.body.tidied.to_backlog).not.toContain(key);
          expect((await read(key)).item.status).toBe("building");
        }
      });

      it("does not bounce an item a person sent back from Needs Review for rework", async () => {
        const key = await inReview("Rework");
        await patch(key, { status: "building" });
        const res = await reportGit({
          items: [{ key, state: "dev", sha: SHA }],
          tidy: { branches: [] },
        });
        expect(res.body.tidied.to_review).not.toContain(key);
        expect((await read(key)).item.status).toBe("building");
      });

      it("without tidy nothing in Building moves; a session cannot tidy; bad input names the field", async () => {
        const idle = await building("Idle, no tidy asked", 10);
        expect((await reportGit({ items: [] })).body.tidied).toEqual({
          to_review: [],
          to_backlog: [],
          to_later: [],
        });
        expect((await read(idle)).item.status).toBe("building");

        const issued = await request(app)
          .post(`${BASE}/session-tokens`)
          .set("Authorization", platformAdmin.auth)
          .send({ name: `Tidy ${SUFFIX}` });
        const session = await request(app)
          .post(`${BASE}/git-state`)
          .set("X-Session-Token", issued.body.token)
          .send({ items: [], tidy: { branches: [] } });
        expect(session.status).toBe(403);
        expect((await read(idle)).item.status).toBe("building");
        await getDb().query(
          "DELETE FROM platform.work_session_token WHERE id = $1",
          [issued.body.item.id],
        );

        expect((await reportGit({ items: [], tidy: {} })).body.field).toBe(
          "tidy",
        );
        expect(
          (await reportGit({ items: [], tidy: { branches: ["nope"] } })).body
            .field,
        ).toBe("tidy");
      });
    });

    describe("tidy: an untouched Backlog ticket is set aside (CORE-234)", () => {
      async function untouched(
        title: string,
        days: number,
        extra: Record<string, unknown> = {},
      ): Promise<string> {
        const key = (await create({ title, ...extra })).body.item.key as string;
        await getDb().query(
          `UPDATE platform.work_item SET updated_at = now() - make_interval(days => $2::int) WHERE team_key || '-' || number = $1`,
          [key, days],
        );
        return key;
      }

      it("labels a Backlog item nobody touched for 60 days as later, with an edit event and a comment", async () => {
        const old = await untouched("Forgotten", 61);
        const fresh = await untouched("Touched last month", 59);
        const held = await untouched("Forgotten, on hold", 200, {
          labels: ["hold"],
        });
        const elsewhere = await untouched("Old, but not in Backlog", 200, {
          status: "to_spec",
        });
        const res = await reportGit({ items: [], tidy: { branches: [] } });
        expect(res.status).toBe(200);
        expect(res.body.tidied.to_later).toContain(old);
        for (const key of [fresh, held, elsewhere])
          expect(res.body.tidied.to_later).not.toContain(key);

        const { item, events } = await read(old);
        expect(item.status).toBe("backlog");
        expect(item.labels).toContain("later");
        expect(events.map((e: { kind: string }) => e.kind)).toEqual([
          "created",
          "edit",
          "comment",
        ]);
        expect(events[2].body).toContain("60 days");
        expect((await read(fresh)).item.labels).not.toContain("later");
        expect((await read(held)).item.labels).toEqual(["hold"]);
      });

      it("does not count its own label as a touch, and labels a ticket once", async () => {
        const old = await untouched("Forgotten once", 90);
        await reportGit({ items: [], tidy: { branches: [] } });
        const again = await reportGit({ items: [], tidy: { branches: [] } });
        expect(again.body.tidied.to_later).not.toContain(old);
        const { item, events } = await read(old);
        expect(item.labels.filter((l: string) => l === "later")).toHaveLength(
          1,
        );
        expect(Date.now() - Date.parse(item.updated_at)).toBeGreaterThan(
          89 * 86_400_000,
        );
        expect(
          events.filter((e: { kind: string }) => e.kind === "comment"),
        ).toHaveLength(1);
      });

      it("without tidy an old Backlog item keeps its labels", async () => {
        const old = await untouched("Forgotten, no tidy asked", 90);
        await reportGit({ items: [] });
        expect((await read(old)).item.labels).toEqual([]);
      });
    });

    it("403 for a tenant admin, 400 with the field for bad input", async () => {
      const key = await inReview("Validation");
      const tenant = await request(app)
        .post(`${BASE}/git-state`)
        .set("Authorization", tenantAdmin.auth)
        .send({ items: [] });
      expect(tenant.status).toBe(403);
      expect((await reportGit({})).body.field).toBe("items");
      expect(
        (await reportGit({ items: [{ key, state: "none", sha: SHA }] })).body
          .field,
      ).toBe("items");
      expect(
        (await reportGit({ items: [{ key, state: "dev", sha: "not a sha" }] }))
          .body.field,
      ).toBe("items");
      expect(
        (await reportGit({ items: [{ key: "nope", state: "dev", sha: SHA }] }))
          .body.field,
      ).toBe("items");
      expect(
        (
          await reportGit({
            items: [],
            close: { smoke_url: "http://insecure" },
          })
        ).body.field,
      ).toBe("close");
    });
  });

  describe("Approved needs a priority and a Done when (CORE-234)", () => {
    const READY = { priority: 2, done_when: "- A test proves it" };
    async function patch(key: string, body: Record<string, unknown>) {
      return request(app)
        .patch(`${BASE}/items/${key}`)
        .set("Authorization", platformAdmin.auth)
        .send(body);
    }

    it("refuses a move to Approved without a priority or without a Done when, naming the field", async () => {
      const bare = (await create({ title: "Bare" })).body.item.key as string;
      const noPriority = await patch(bare, { status: "approved" });
      expect(noPriority.status).toBe(400);
      expect(noPriority.body.field).toBe("priority");

      const noDoneWhen = (await create({ title: "No done when", priority: 1 }))
        .body.item.key as string;
      const refused = await patch(noDoneWhen, { status: "approved" });
      expect(refused.status).toBe(400);
      expect(refused.body.field).toBe("done_when");
      expect(
        (await patch(noDoneWhen, { status: "approved", done_when: "  " })).body
          .field,
      ).toBe("done_when");
    });

    it("accepts the move when both are there, also when the same request sets them", async () => {
      const ready = (await create({ title: "Ready", ...READY })).body.item
        .key as string;
      expect(
        (await patch(ready, { status: "approved" })).body.item.status,
      ).toBe("approved");
      const bare = (await create({ title: "Completed on the way" })).body.item
        .key as string;
      const moved = await patch(bare, { status: "approved", ...READY });
      expect(moved.status).toBe(200);
      expect(moved.body.item).toMatchObject({ status: "approved", ...READY });
    });

    it("applies to a ticket created straight in Approved", async () => {
      expect(
        (await create({ title: "Straight in", status: "approved" })).body.field,
      ).toBe("priority");
      expect(
        (
          await create({
            title: "Straight in",
            status: "approved",
            priority: 3,
          })
        ).body.field,
      ).toBe("done_when");
      expect(
        (await create({ title: "Straight in", status: "approved", ...READY }))
          .status,
      ).toBe(201);
    });

    it("lets the worker give a ticket back from Building, and still answers 403 before 400 for the agent", async () => {
      const legacy = (
        await create({ title: "Approved before the rule", status: "building" })
      ).body.item.key as string;
      expect(
        (
          await asAgent(request(app).patch(`${BASE}/items/${legacy}`)).send({
            status: "approved",
          })
        ).status,
      ).toBe(200);
      const spec = (
        await create({ title: "Spec, not ready", status: "spec_ready" })
      ).body.item.key as string;
      expect(
        (
          await asAgent(request(app).patch(`${BASE}/items/${spec}`)).send({
            status: "approved",
          })
        ).status,
      ).toBe(403);
    });
  });

  describe("backlog review (CORE-234)", () => {
    const SHA = "b".repeat(40);
    let token: string;
    let tokenId: string;

    function review(
      body: Record<string, unknown>,
      as: "session" | "human" | "agent" = "session",
    ) {
      const req = request(app).post(`${BASE}/backlog-review`);
      if (as === "agent") return asAgent(req).send(body);
      return (
        as === "session"
          ? req.set("X-Session-Token", token)
          : req.set("Authorization", platformAdmin.auth)
      ).send(body);
    }
    async function read(key: string) {
      return (
        await request(app)
          .get(`${BASE}/items/${key}`)
          .set("Authorization", platformAdmin.auth)
      ).body;
    }
    async function backlog(
      title: string,
      extra: Record<string, unknown> = {},
    ): Promise<string> {
      return (await create({ title, ...extra })).body.item.key as string;
    }

    beforeAll(async () => {
      const issued = await request(app)
        .post(`${BASE}/session-tokens`)
        .set("Authorization", platformAdmin.auth)
        .send({ name: `Review ${SUFFIX}` });
      token = issued.body.token;
      tokenId = issued.body.item.id;
    });

    afterAll(async () => {
      await getDb().query(
        "DELETE FROM platform.work_session_token WHERE id = $1",
        [tokenId],
      );
    });

    it("applies keep, later, cancel and shipped to Backlog tickets, each with a comment naming the form", async () => {
      const keep = await backlog("Keep me", { labels: ["later", "ux"] });
      const later = await backlog("Later");
      const cancel = await backlog("Cancel me");
      const shipped = await backlog("Shipped long ago");
      await asAgent(request(app).post(`${BASE}/git-state`)).send({
        items: [{ key: shipped, state: "prod", sha: SHA }],
      });

      const res = await review({
        form: "qa-review-r1",
        confirm: "qa-review-r1-cancels",
        decisions: [
          { key: keep, decision: "keep" },
          { key: later, decision: "later" },
          { key: cancel, decision: "cancel" },
          { key: shipped, decision: "shipped" },
        ],
      });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        applied: [
          { key: keep, decision: "keep" },
          { key: later, decision: "later" },
          { key: cancel, decision: "cancel" },
          { key: shipped, decision: "shipped" },
        ],
        skipped: [],
      });

      const kept = await read(keep);
      expect(kept.item).toMatchObject({ status: "backlog", labels: ["ux"] });
      expect((await read(later)).item).toMatchObject({
        status: "backlog",
        labels: ["later"],
      });
      const canceled = await read(cancel);
      expect(canceled.item.status).toBe("canceled");
      expect(canceled.item.completed_at).not.toBeNull();
      expect(
        canceled.events.find((e: { kind: string }) => e.kind === "status"),
      ).toMatchObject({
        from_status: "backlog",
        to_status: "canceled",
        actor_kind: "session",
        actor: `session:Review ${SUFFIX}`,
      });
      const done = await read(shipped);
      expect(done.item.status).toBe("done");
      expect(done.events.at(-1).body).toContain("bbbbbbb");
      for (const detail of [kept, canceled, done]) {
        expect(detail.events.at(-1)).toMatchObject({
          kind: "comment",
          actor_kind: "session",
        });
        expect(detail.events.at(-1).body).toContain(
          "Backlog review qa-review-r1",
        );
      }
    });

    it("skips what is not in Backlog and a shipped ticket that is not on prod, and says why", async () => {
      const notOnProd = await backlog("Not shipped");
      const building = await backlog("Being built", { status: "building" });
      const triage = await backlog("Untriaged", { status: "triage" });
      const fine = await backlog("Fine");
      const res = await review({
        form: "qa-review-r2",
        decisions: [
          { key: notOnProd, decision: "shipped" },
          { key: building, decision: "cancel" },
          { key: triage, decision: "cancel" },
          { key: `${TEAM}-99999`, decision: "cancel" },
          { key: fine, decision: "later" },
        ],
      });
      expect(res.status).toBe(200);
      expect(res.body.applied).toEqual([{ key: fine, decision: "later" }]);
      expect(res.body.skipped).toEqual([
        { key: notOnProd, reason: "not on prod" },
        { key: building, reason: "not in Backlog" },
        { key: triage, reason: "not in Backlog" },
        { key: `${TEAM}-99999`, reason: "not in Backlog" },
      ]);
      expect((await read(notOnProd)).item.status).toBe("backlog");
      expect((await read(building)).item.status).toBe("building");
      expect((await read(triage)).item.status).toBe("triage");
    });

    it("is for people and sessions, not for the agent or a tenant admin", async () => {
      const key = await backlog("Human answer");
      const body = {
        form: "qa-review-r3",
        decisions: [{ key, decision: "cancel" }],
      };
      expect((await review(body, "agent")).status).toBe(403);
      expect(
        (
          await request(app)
            .post(`${BASE}/backlog-review`)
            .set("Authorization", tenantAdmin.auth)
            .send(body)
        ).status,
      ).toBe(403);
      expect((await read(key)).item.status).toBe("backlog");
      expect((await review(body, "human")).body.applied).toEqual([
        { key, decision: "cancel" },
      ]);
    });

    it("answers 400 with the field for bad input, and changes nothing", async () => {
      const key = await backlog("Validation");
      const decisions = [{ key, decision: "cancel" }];
      expect((await review({ decisions })).body.field).toBe("form");
      expect((await review({ form: "has spaces", decisions })).body.field).toBe(
        "form",
      );
      expect((await review({ form: "ok" })).body.field).toBe("decisions");
      expect((await review({ form: "ok", decisions: [] })).body.field).toBe(
        "decisions",
      );
      expect(
        (await review({ form: "ok", decisions: [{ key, decision: "delete" }] }))
          .body.field,
      ).toBe("decisions");
      expect(
        (
          await review({
            form: "ok",
            decisions: [{ key: "nope", decision: "keep" }],
          })
        ).body.field,
      ).toBe("decisions");
      expect(
        (
          await review({
            form: "ok",
            decisions: [...decisions, { key, decision: "keep" }],
          })
        ).body.field,
      ).toBe("decisions");
      expect(
        (await review({ form: "ok", confirm: "has spaces", decisions })).body
          .field,
      ).toBe("confirm");
      expect(
        (await review({ form: "ok", confirm: "ok", decisions })).body.field,
      ).toBe("confirm");
      expect((await read(key)).item.status).toBe("backlog");
    });

    it("holds a session's cancel until a second form confirms it; a person cancels at once (D1)", async () => {
      const cancel = await backlog("Cancel after a second click");
      const later = await backlog("Later at once");
      const decisions = [
        { key: cancel, decision: "cancel" },
        { key: later, decision: "later" },
      ];
      const first = await review({ form: "qa-review-r4", decisions });
      expect(first.body.applied).toEqual([{ key: later, decision: "later" }]);
      expect(first.body.skipped).toEqual([
        { key: cancel, reason: "cancel waits for a confirmation form" },
      ]);
      expect((await read(cancel)).item.status).toBe("backlog");

      const second = await review({
        form: "qa-review-r4",
        confirm: "qa-review-r4-confirm",
        decisions: [decisions[0]],
      });
      expect(second.body).toEqual({
        applied: [{ key: cancel, decision: "cancel" }],
        skipped: [],
      });
      const canceled = await read(cancel);
      expect(canceled.item.status).toBe("canceled");
      expect(canceled.events.at(-1).body).toBe(
        "Backlog review qa-review-r4, confirmed in qa-review-r4-confirm: canceled.",
      );
    });
  });

  describe("a session moves picks to Approved (CORE-234 D2)", () => {
    let token: string;
    let tokenId: string;

    const move = (key: string, status: string) =>
      request(app)
        .patch(`${BASE}/items/${key}`)
        .set("X-Session-Token", token)
        .send({ status });
    async function ready(
      title: string,
      extra: Record<string, unknown> = {},
    ): Promise<string> {
      return (
        await create({ title, priority: 2, done_when: "It works.", ...extra })
      ).body.item.key as string;
    }

    beforeAll(async () => {
      const issued = await request(app)
        .post(`${BASE}/session-tokens`)
        .set("Authorization", platformAdmin.auth)
        .send({ name: `Picks ${SUFFIX}` });
      token = issued.body.token;
      tokenId = issued.body.item.id;
      // The cap counts every session's moves; what an earlier run left in the test DB must not use it up.
      await getDb().query(
        `DELETE FROM platform.work_item_event
          WHERE kind = 'status' AND to_status = 'approved' AND actor_kind = 'session' AND created_at > now() - interval '7 days'`,
      );
    });

    afterAll(async () => {
      await getDb().query(
        "DELETE FROM platform.work_session_token WHERE id = $1",
        [tokenId],
      );
    });

    it("moves a prepared Backlog ticket, and only from Backlog", async () => {
      const unprepared = (await create({ title: "No priority" })).body.item
        .key as string;
      const refused = await move(unprepared, "approved");
      expect(refused.status).toBe(400);
      expect(refused.body.field).toBe("priority");

      const spec = await ready("Spec waits for a person", {
        status: "spec_ready",
      });
      expect((await move(spec, "approved")).status).toBe(403);
      const closed = await ready("Closed stays closed", { status: "done" });
      expect((await move(closed, "approved")).status).toBe(403);

      const pick = await ready("Monday pick");
      const moved = await move(pick, "approved");
      expect(moved.status).toBe(200);
      expect(moved.body.item.status).toBe("approved");
    });

    it("stops at 3 moves in 7 days; a person's moves do not count and an old move frees a place", async () => {
      // One move was made by the test above.
      const byHuman = await ready("Approved by a person");
      await request(app)
        .patch(`${BASE}/items/${byHuman}`)
        .set("Authorization", platformAdmin.auth)
        .send({ status: "approved" });
      const second = await ready("Second pick");
      const third = await ready("Third pick");
      const fourth = await ready("Fourth pick");
      expect((await move(second, "approved")).status).toBe(200);
      expect((await move(third, "approved")).status).toBe(200);

      const over = await move(fourth, "approved");
      expect(over.status).toBe(403);
      expect(over.body.error).toMatch(
        /3 tickets to Approved in the last 7 days/,
      );
      expect(
        (
          await request(app)
            .get(`${BASE}/items/${fourth}`)
            .set("Authorization", platformAdmin.auth)
        ).body.item.status,
      ).toBe("backlog");
      // The cap is on Approved only.
      expect((await move(fourth, "building")).status).toBe(200);

      // The trail is append-only, so the move is aged by a copy dated 8 days back.
      const aged = await getDb().query(
        `DELETE FROM platform.work_item_event
          WHERE item_id = (SELECT id FROM platform.work_item WHERE team_key = $1 AND number = $2) AND to_status = 'approved'
          RETURNING item_id, actor`,
        [TEAM, Number(second.split("-")[1])],
      );
      await getDb().query(
        `INSERT INTO platform.work_item_event (item_id, kind, from_status, to_status, actor, actor_kind, created_at)
         VALUES ($1, 'status', 'backlog', 'approved', $2, 'session', now() - interval '8 days')`,
        [aged.rows[0].item_id, aged.rows[0].actor],
      );
      const fifth = await ready("Fifth pick");
      expect((await move(fifth, "approved")).status).toBe(200);
    });
  });

  describe("verify stage (CORE-277)", () => {
    const SHA = "b".repeat(40);
    const RUN = "https://github.com/lukasz512/neoSLEEP/actions/runs/277";
    const RESULTS = [
      {
        ac: "Card shows a badge",
        test: "WorkItemCard.spec › shows verify result badge",
        status: "pass",
      },
      {
        ac: "Fix ticket is created",
        test: "workBoard.spec › fail creates a fix ticket",
        status: "fail",
      },
    ];
    const admin = (req: request.Test) =>
      req.set("Authorization", platformAdmin.auth);

    async function read(key: string) {
      return (await admin(request(app).get(`${BASE}/items/${key}`))).body;
    }
    async function landed(
      title: string,
      labels: string[] = [],
    ): Promise<string> {
      const key = (
        await create({
          title,
          status: "needs_review",
          labels,
          priority: 2,
          done_when: "- Works",
        })
      ).body.item.key as string;
      await asAgent(request(app).post(`${BASE}/git-state`)).send({
        items: [{ key, state: "dev", sha: SHA }],
        verify: true,
      });
      return key;
    }
    function postResult(
      key: string,
      body: Record<string, unknown>,
      as: (r: request.Test) => request.Test = asAgent,
    ) {
      return as(request(app).post(`${BASE}/items/${key}/verify-result`)).send(
        body,
      );
    }

    it("a Needs Review ticket that reaches dev moves to Verifying, pending, with an event and a comment", async () => {
      const key = await landed("Lands on dev");
      const { item, events } = await read(key);
      expect(item).toMatchObject({
        status: "verifying",
        verify_state: "pending",
      });
      expect(
        events.some(
          (e: { kind: string; to_status: string }) =>
            e.kind === "status" && e.to_status === "verifying",
        ),
      ).toBe(true);
      expect(events.some((e: { kind: string }) => e.kind === "comment")).toBe(
        true,
      );
    });

    it("does not enter Verifying without verify:true, with a hold label, or when already verified", async () => {
      const plain = (await create({ title: "Plain", status: "needs_review" }))
        .body.item.key as string;
      await asAgent(request(app).post(`${BASE}/git-state`)).send({
        items: [{ key: plain, state: "dev", sha: SHA }],
      });
      expect((await read(plain)).item.status).toBe("needs_review");
      const held = await landed("Held", ["hold"]);
      expect((await read(held)).item.status).toBe("needs_review");
      const done = await landed("Verified once");
      await postResult(done, { state: "pass", run_url: RUN, results: [] });
      await asAgent(request(app).post(`${BASE}/git-state`)).send({
        items: [{ key: done, state: "dev", sha: SHA }],
        verify: true,
      });
      expect((await read(done)).item.status).toBe("needs_review");
    });

    it("pass returns the ticket to Needs Review with the result, the map and a passed ci link", async () => {
      const key = await landed("Passes");
      const res = await postResult(key, {
        state: "pass",
        run_url: RUN,
        results: RESULTS.map((r) => ({ ...r, status: "pass" })),
      });
      expect(res.status).toBe(200);
      const { item } = await read(key);
      expect(item).toMatchObject({
        status: "needs_review",
        verify_state: "pass",
        verify_run_url: RUN,
        fix_item: null,
      });
      expect(item.verify_checked_at).not.toBeNull();
      expect(item.verify_results).toHaveLength(2);
      expect(item.links).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: "ci", url: RUN, state: "passed" }),
        ]),
      );
    });

    it("fail keeps the original in Needs Review marked fail and creates one fix ticket in Approved", async () => {
      const key = await landed("Fails");
      const res = await postResult(key, {
        state: "fail",
        run_url: RUN,
        results: RESULTS,
      });
      expect(res.status).toBe(200);
      const { item } = await read(key);
      expect(item).toMatchObject({
        status: "needs_review",
        verify_state: "fail",
      });
      expect(item.fix_item).toMatch(new RegExp(`^${TEAM}-\\d+$`));
      const fix = (await read(item.fix_item)).item;
      expect(fix).toMatchObject({ status: "approved", team_key: TEAM });
      expect(fix.priority).toBeGreaterThan(0);
      expect(fix.done_when).toBeTruthy();
      expect(fix.problem).toContain(key);
      // Repeating the result does not create a second fix ticket.
      await postResult(key, { state: "fail", run_url: RUN, results: RESULTS });
      expect((await read(key)).item.fix_item).toBe(item.fix_item);
    });

    it("a result needs a ticket in Verifying and a valid body", async () => {
      const plain = (
        await create({ title: "Not verifying", status: "needs_review" })
      ).body.item.key as string;
      expect(
        (await postResult(plain, { state: "pass", run_url: RUN, results: [] }))
          .status,
      ).toBe(409);
      const key = await landed("Bad body");
      expect(
        (await postResult(key, { state: "maybe", run_url: RUN, results: [] }))
          .status,
      ).toBe(400);
      expect(
        (
          await postResult(key, {
            state: "pass",
            run_url: "not a url",
            results: [],
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await postResult(key, {
            state: "pass",
            run_url: RUN,
            results: [{ ac: "x" }],
          })
        ).status,
      ).toBe(400);
    });

    it("a person re-runs verification; the agent cannot", async () => {
      const key = await landed("Re-run me");
      await postResult(key, { state: "fail", run_url: RUN, results: RESULTS });
      expect(
        (await asAgent(request(app).post(`${BASE}/items/${key}/verify`)))
          .status,
      ).toBe(403);
      const res = await admin(request(app).post(`${BASE}/items/${key}/verify`));
      expect(res.status).toBe(200);
      expect((await read(key)).item).toMatchObject({
        status: "verifying",
        verify_state: "pending",
      });
      const backlog = (await create({ title: "Backlog" })).body.item
        .key as string;
      expect(
        (await admin(request(app).post(`${BASE}/items/${backlog}/verify`)))
          .status,
      ).toBe(409);
    });

    it("agent cannot move to done", async () => {
      const key = await landed("No close by agent");
      expect(
        (
          await asAgent(request(app).patch(`${BASE}/items/${key}`)).send({
            status: "done",
          })
        ).status,
      ).toBe(403);
    });

    it("the agent cannot move a ticket out of or into Verifying", async () => {
      const key = await landed("Stuck in verifying");
      expect(
        (
          await asAgent(request(app).patch(`${BASE}/items/${key}`)).send({
            status: "needs_review",
          })
        ).status,
      ).toBe(403);
      const building = (await create({ title: "Building", status: "building" }))
        .body.item.key as string;
      expect(
        (
          await asAgent(request(app).patch(`${BASE}/items/${building}`)).send({
            status: "verifying",
          })
        ).status,
      ).toBe(403);
    });

    it("a session cannot move a ticket out of Verifying", async () => {
      const issued = await admin(
        request(app).post(`${BASE}/session-tokens`),
      ).send({ name: `QA verify ${SUFFIX}` });
      const token = issued.body.token as string;
      try {
        const key = await landed("Session stuck");
        const res = await request(app)
          .patch(`${BASE}/items/${key}`)
          .set("X-Session-Token", token)
          .send({ status: "needs_review" });
        expect(res.status).toBe(403);
      } finally {
        await getDb().query(
          "DELETE FROM platform.work_session_token WHERE name LIKE $1",
          [`%${SUFFIX}`],
        );
      }
    });

    it("hand-over to Needs Review needs an artifact link and a ci link (agent)", async () => {
      const mk = async () =>
        (await create({ title: "Hand over", status: "building" })).body.item
          .key as string;
      const move = (key: string, links: unknown[]) =>
        asAgent(request(app).patch(`${BASE}/items/${key}`)).send({
          status: "needs_review",
          add_links: links,
        });
      const artifact = {
        kind: "artifact",
        url: "https://claude.ai/artifact/h",
      };
      const ci = {
        kind: "ci",
        url: "https://github.com/lukasz512/neoSLEEP/actions/runs/9",
        state: "passed",
      };
      const a = await mk();
      const none = await move(a, []);
      expect(none.status).toBe(400);
      expect(none.body.field).toBe("add_links");
      expect((await move(a, [artifact])).status).toBe(400);
      expect((await move(a, [ci])).status).toBe(400);
      expect((await move(a, [artifact, ci])).status).toBe(200);
      // Links already on the ticket count; a person is not held to the rule.
      const b = await mk();
      await asAgent(request(app).patch(`${BASE}/items/${b}`)).send({
        add_links: [artifact, ci],
      });
      expect((await move(b, [])).status).toBe(200);
      const c = await mk();
      expect(
        (
          await admin(request(app).patch(`${BASE}/items/${c}`)).send({
            status: "needs_review",
          })
        ).status,
      ).toBe(200);
    });

    it("close skips a ticket whose verification failed", async () => {
      const failed = await landed("Red on prod");
      await postResult(failed, {
        state: "fail",
        run_url: RUN,
        results: RESULTS,
      });
      const green = await landed("Green on prod");
      await postResult(green, { state: "pass", run_url: RUN, results: [] });
      const res = await asAgent(request(app).post(`${BASE}/git-state`)).send({
        items: [
          { key: failed, state: "prod", sha: SHA },
          { key: green, state: "prod", sha: SHA },
        ],
        close: { smoke_url: RUN },
      });
      expect(res.body.closed).toContain(green);
      expect(res.body.closed).not.toContain(failed);
      expect((await read(failed)).item.status).toBe("needs_review");
    });

    it("lists the tickets waiting for verification", async () => {
      const key = await landed("Waiting for CI");
      const list = await asAgent(
        request(app).get(`${BASE}/items?team=${TEAM}&status=verifying`),
      );
      expect(list.status).toBe(200);
      expect(list.body.items.map((i: { key: string }) => i.key)).toContain(key);
      expect(
        list.body.items.every(
          (i: { status: string }) => i.status === "verifying",
        ),
      ).toBe(true);
    });
  });

  describe("validation", () => {
    it("answers 400 with the field for bad input", async () => {
      expect((await create({ title: "" })).body.field).toBe("title");
      expect((await create({ title: "x".repeat(201) })).body.field).toBe(
        "title",
      );
      expect((await create({ title: "ok", status: "wip" })).body.field).toBe(
        "status",
      );
      expect(
        (await create({ title: "ok", problem: "x".repeat(5001) })).body.field,
      ).toBe("problem");
      expect(
        (
          await create({
            title: "ok",
            links: [{ kind: "pr", url: "http://insecure" }],
          })
        ).body.field,
      ).toBe("links");
      const unknownTeam = await request(app)
        .post(`${BASE}/items`)
        .set("Authorization", platformAdmin.auth)
        .send({ team: "NOPE9", title: "x" });
      expect(unknownTeam.body.field).toBe("team");
    });

    it("answers 404 for an unknown or malformed key", async () => {
      expect(
        (
          await request(app)
            .get(`${BASE}/items/${TEAM}-99999`)
            .set("Authorization", platformAdmin.auth)
        ).status,
      ).toBe(404);
      expect(
        (
          await request(app)
            .get(`${BASE}/items/not-a-key`)
            .set("Authorization", platformAdmin.auth)
        ).status,
      ).toBe(404);
    });
  });
});
