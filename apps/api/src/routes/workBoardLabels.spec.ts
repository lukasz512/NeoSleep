import { describe, it, expect, afterAll, beforeAll } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { app } from "../server.js";
import { getDb, withTenant, insertStaffUser, WORK_LABEL_COLORS } from "../db.js";
import { signAuthToken } from "../utils/jwt.js";

/**
 * Work board labels, session activity and CI link state (CORE-219,
 * docs/stories/work-board-labels-and-session-indicators.md) through the real Express stack
 * and real Postgres. The label catalog is platform-wide, so every name carries this run's tag.
 */
const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";
const SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const TAG = Math.random().toString(36).slice(2, 8);
const TEAM = `L${Math.random().toString(36).slice(2, 8).toUpperCase().replace(/[^A-Z0-9]/g, "X")}`;
const BASE = "/api/v1/platform/work";
const MIGRATION = fileURLToPath(new URL("../../migrations/068_work_board_labels.sql", import.meta.url));
const TICKET = { problem: "Labels are invisible.", change: "- Show them", done_when: "- A test proves it" };

interface Label { id: string; name: string; color: string }

describe("work board labels (CORE-219)", () => {
  let admin: string;
  let token: string;

  const name = (label: string) => `${label}-${TAG}`;
  const asAdmin = (req: request.Test) => req.set("Authorization", admin);
  const asSession = (req: request.Test) => req.set("X-Session-Token", token);
  async function create(body: Record<string, unknown>) {
    return asAdmin(request(app).post(`${BASE}/items`)).send({ team: TEAM, ...body });
  }
  async function catalog(): Promise<Label[]> {
    const res = await asAdmin(request(app).get(`${BASE}/labels`));
    expect(res.status).toBe(200);
    return (res.body.items as Label[]).filter((l) => l.name.toLowerCase().endsWith(`-${TAG}`));
  }
  async function labelNamed(label: string): Promise<Label> {
    const found = (await catalog()).find((l) => l.name === name(label));
    expect(found, `label ${name(label)} in the catalog`).toBeDefined();
    return found!;
  }

  beforeAll(async () => {
    const email = `qa-wbl-${SUFFIX}@neosleepcare.com`;
    await withTenant(TENANT_SLUG, async (client) => {
      const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
      const user = await insertStaffUser(client, email, "QA", "Board labels", "admin", hash, false);
      admin = `Bearer ${signAuthToken({ id: user!.id, email, role: "admin", token_version: 0 })}`;
    });
    await getDb().query(`INSERT INTO platform.users (email, name, role, is_active) VALUES ($1, 'QA Board labels', 'owner', true)`, [email]);
    await getDb().query(`INSERT INTO platform.work_team (key, name, kind, sort_order) VALUES ($1, 'QA labels', 'client', 999)`, [TEAM]);
    const issued = await asAdmin(request(app).post(`${BASE}/session-tokens`)).send({ name: `QA labels ${SUFFIX}` });
    token = issued.body.token;
  });

  afterAll(async () => {
    await getDb().query("DELETE FROM platform.work_item WHERE team_key = $1", [TEAM]);
    await getDb().query("DELETE FROM platform.work_team WHERE key = $1", [TEAM]);
    await getDb().query("DELETE FROM platform.work_label WHERE lower(name) LIKE $1", [`%-${TAG}`]);
    await getDb().query("DELETE FROM platform.work_session_token WHERE name LIKE $1", [`%${SUFFIX}`]);
    await getDb().query("DELETE FROM platform.users WHERE lower(email) = $1", [`qa-wbl-${SUFFIX}@neosleepcare.com`]);
  });

  describe("catalog", () => {
    it("gains a label the first time an item carries it, with a palette colour", async () => {
      const res = await create({ title: "Typed a new label", labels: [name("billing")] });
      expect(res.status).toBe(201);
      const label = await labelNamed("billing");
      expect(WORK_LABEL_COLORS).toContain(label.color);
    });

    it("gives the next label a colour no label uses yet, while one is free", async () => {
      await create({ title: "Two more", labels: [name("alpha"), name("beta")] });
      const { rows } = await getDb().query<{ color: string; uses: number }>(
        `SELECT color, count(*)::int AS uses FROM platform.work_label GROUP BY color`
      );
      const uses = rows.map((r) => r.uses);
      // Colours are handed out least-used first, so no colour is ever two ahead of another.
      const least = rows.length < WORK_LABEL_COLORS.length ? 0 : Math.min(...uses);
      expect(Math.max(...uses) - least).toBeLessThanOrEqual(1);
    });

    it("matches names case-insensitively and keeps the catalog's spelling on the item", async () => {
      await create({ title: "First spelling", labels: [name("Urgent")] });
      const second = await create({ title: "Other spelling", labels: [name("urgent").toUpperCase()] });
      expect(second.body.item.labels).toEqual([name("Urgent")]);
      expect((await catalog()).filter((l) => l.name.toLowerCase() === name("urgent").toLowerCase())).toHaveLength(1);
    });

    it("never lists the technical session label", async () => {
      const res = await asSession(request(app).post(`${BASE}/items`)).send({ team: TEAM, title: "Session work", ...TICKET });
      expect(res.body.item.labels).toContain("session");
      const all = await asAdmin(request(app).get(`${BASE}/labels`));
      expect(all.body.items.some((l: Label) => l.name.toLowerCase() === "session")).toBe(false);
    });

    it("is readable by a session, and lists names in alphabetical order", async () => {
      const res = await asSession(request(app).get(`${BASE}/labels`));
      expect(res.status).toBe(200);
      const names = (res.body.items as Label[]).map((l) => l.name.toLowerCase());
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    });

    it("is filled by the migration from labels already on items", async () => {
      const { rows } = await getDb().query<{ id: string }>(
        `INSERT INTO platform.work_item (team_key, number, title, labels) VALUES ($1, 9001, 'Old row', $2) RETURNING id`,
        [TEAM, [name("legacy"), "session"]]
      );
      expect(rows).toHaveLength(1);
      expect((await catalog()).some((l) => l.name === name("legacy"))).toBe(false);
      await getDb().query(readFileSync(MIGRATION, "utf-8"));
      await labelNamed("legacy");
      const all = await asAdmin(request(app).get(`${BASE}/labels`));
      expect(all.body.items.some((l: Label) => l.name.toLowerCase() === "session")).toBe(false);
    });
  });

  describe("on an item", () => {
    it("adds and removes labels through PATCH", async () => {
      const { key } = (await create({ title: "Label me" })).body.item;
      const added = await asAdmin(request(app).patch(`${BASE}/items/${key}`)).send({ labels: [name("ops"), name("billing")] });
      expect(added.body.item.labels).toEqual([name("ops"), name("billing")]);
      await labelNamed("ops");
      const removed = await asAdmin(request(app).patch(`${BASE}/items/${key}`)).send({ labels: [name("billing")] });
      expect(removed.body.item.labels).toEqual([name("billing")]);
    });

    it("rejects more than 10 labels and a name over 40 characters", async () => {
      const many = Array.from({ length: 11 }, (_, i) => name(`m${i}`));
      expect((await create({ title: "Too many", labels: many })).body.field).toBe("labels");
      expect((await create({ title: "Too long", labels: ["x".repeat(41)] })).body.field).toBe("labels");
    });
  });

  describe("rename and recolour", () => {
    it("renames the label on every item that carries it and logs an edit on each", async () => {
      const a = (await create({ title: "Carries it", labels: [name("old"), name("billing")] })).body.item.key as string;
      const b = (await create({ title: "Carries it too", labels: [name("old")] })).body.item.key as string;
      const label = await labelNamed("old");
      const res = await asAdmin(request(app).patch(`${BASE}/labels/${label.id}`)).send({ name: name("new") });
      expect(res.status).toBe(200);
      expect(res.body.item).toMatchObject({ id: label.id, name: name("new"), color: label.color });
      const first = await asAdmin(request(app).get(`${BASE}/items/${a}`));
      expect(first.body.item.labels).toEqual([name("new"), name("billing")]);
      expect(first.body.events.at(-1)).toMatchObject({ kind: "edit", body: "labels", actor_kind: "human" });
      expect((await asAdmin(request(app).get(`${BASE}/items/${b}`))).body.item.labels).toEqual([name("new")]);
      expect((await catalog()).some((l) => l.name === name("old"))).toBe(false);
    });

    it("rejects a name another label already has, whatever the case, and changes nothing", async () => {
      const { key } = (await create({ title: "Stays", labels: [name("keep"), name("taken")] })).body.item;
      const label = await labelNamed("keep");
      const res = await asAdmin(request(app).patch(`${BASE}/labels/${label.id}`)).send({ name: name("TAKEN") });
      expect(res.status).toBe(400);
      expect(res.body.field).toBe("name");
      expect((await asAdmin(request(app).get(`${BASE}/items/${key}`))).body.item.labels).toEqual([name("keep"), name("taken")]);
    });

    it("rejects an empty, too long or reserved name and an unknown colour", async () => {
      const label = await labelNamed("keep");
      const patch = (body: Record<string, unknown>) => asAdmin(request(app).patch(`${BASE}/labels/${label.id}`)).send(body);
      expect((await patch({ name: "  " })).body.field).toBe("name");
      expect((await patch({ name: "x".repeat(41) })).body.field).toBe("name");
      expect((await patch({ name: "Session" })).body.field).toBe("name");
      expect((await patch({ color: "#ff0000" })).body.field).toBe("color");
    });

    it("changes the colour without touching items", async () => {
      const label = await labelNamed("keep");
      const color = WORK_LABEL_COLORS.find((c) => c !== label.color)!;
      const res = await asAdmin(request(app).patch(`${BASE}/labels/${label.id}`)).send({ color });
      expect(res.body.item).toMatchObject({ name: name("keep"), color });
      expect((await labelNamed("keep")).color).toBe(color);
    });

    it("answers 404 for an unknown label and 403 for a session", async () => {
      const label = await labelNamed("keep");
      expect((await asAdmin(request(app).patch(`${BASE}/labels/00000000-0000-4000-8000-000000000000`)).send({ name: name("x") })).status).toBe(404);
      expect((await asAdmin(request(app).patch(`${BASE}/labels/nope`)).send({ name: name("x") })).status).toBe(404);
      expect((await asSession(request(app).patch(`${BASE}/labels/${label.id}`)).send({ name: name("mine") })).status).toBe(403);
    });
  });

  describe("session activity", () => {
    it("is null until a session touches the item, then the time of its newest event", async () => {
      const { key } = (await create({ title: "Human only" })).body.item;
      const list = async () =>
        ((await asAdmin(request(app).get(`${BASE}/items?team=${TEAM}`))).body.items as { key: string; session_active_at: string | null }[]).find(
          (i) => i.key === key
        )!;
      expect((await list()).session_active_at).toBeNull();
      await asAdmin(request(app).post(`${BASE}/items/${key}/comments`)).send({ body: "A person wrote this." });
      expect((await list()).session_active_at).toBeNull();
      const before = Date.now() - 5000;
      expect((await asSession(request(app).post(`${BASE}/items/${key}/comments`)).send({ body: "A session wrote this." })).status).toBe(201);
      const at = (await list()).session_active_at;
      expect(at).not.toBeNull();
      expect(Date.parse(at!)).toBeGreaterThan(before);
      expect((await asAdmin(request(app).get(`${BASE}/items/${key}`))).body.item.session_active_at).toBe(at);
    });

    it("still lets a session create, comment, link and move", async () => {
      const made = await asSession(request(app).post(`${BASE}/items`)).send({ team: TEAM, title: "Session flow", ...TICKET, labels: [name("cli")] });
      expect(made.status).toBe(201);
      expect(made.body.item.labels).toEqual([name("cli"), "session"]);
      const key = made.body.item.key as string;
      expect((await asSession(request(app).post(`${BASE}/items/${key}/comments`)).send({ body: "Branch: x" })).status).toBe(201);
      const moved = await asSession(request(app).patch(`${BASE}/items/${key}`)).send({
        status: "needs_review",
        add_links: [{ kind: "pr", url: "https://github.com/lukasz512/NeoSleep/pull/1" }],
      });
      expect(moved.status).toBe(200);
      expect(moved.body.item).toMatchObject({ status: "needs_review", labels: [name("cli"), "session"] });
      expect((await asSession(request(app).patch(`${BASE}/items/${key}`)).send({ labels: [] })).status).toBe(403);
    });
  });

  describe("CI link state", () => {
    const url = "https://github.com/lukasz512/NeoSleep/actions/runs/1";

    it("records passed or failed on a ci link and updates it when the run is linked again", async () => {
      const { key } = (await create({ title: "CI" })).body.item;
      const first = await asSession(request(app).patch(`${BASE}/items/${key}`)).send({ add_links: [{ kind: "ci", url, state: "failed" }] });
      expect(first.body.item.links).toEqual([{ kind: "ci", url, state: "failed" }]);
      const second = await asSession(request(app).patch(`${BASE}/items/${key}`)).send({ add_links: [{ kind: "ci", url, state: "passed" }] });
      expect(second.body.item.links).toEqual([{ kind: "ci", url, state: "passed" }]);
      const events = (await asAdmin(request(app).get(`${BASE}/items/${key}`))).body.events as { kind: string; body: string }[];
      expect(events.filter((e) => e.kind === "link").map((e) => e.body)).toEqual([`+ ci ${url} (failed)`, `~ ci ${url} (passed)`]);
    });

    it("rejects an unknown state and a state on a link that is not ci", async () => {
      const { key } = (await create({ title: "CI bad" })).body.item;
      const patch = (link: Record<string, unknown>) => asAdmin(request(app).patch(`${BASE}/items/${key}`)).send({ add_links: [link] });
      expect((await patch({ kind: "ci", url, state: "green" })).body.field).toBe("links");
      expect((await patch({ kind: "pr", url, state: "passed" })).body.field).toBe("links");
    });
  });
});
