import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { app } from "../server.js";
import { getDb } from "../db.js";

/**
 * NEO-81 — request correlation + the public diagnostics endpoint, against a
 * real Postgres (no mocks, per CLAUDE.md): the row a browser report creates
 * must land in platform.diagnostics with the request id the API handed out.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("X-Request-ID", () => {
  it("every API response carries a generated request id", async () => {
    const res = await request(app).get("/api/v1/lead");
    expect(res.status).toBe(401);
    expect(res.headers["x-request-id"]).toMatch(UUID_RE);
  });

  it("two requests get two different ids", async () => {
    const a = await request(app).get("/api/v1/lead");
    const b = await request(app).get("/api/v1/lead");
    expect(a.headers["x-request-id"]).not.toBe(b.headers["x-request-id"]);
  });

  it("reuses a safe incoming id (e.g. from a proxy)", async () => {
    const res = await request(app).get("/api/v1/lead").set("X-Request-ID", "edge-abc_123.4");
    expect(res.headers["x-request-id"]).toBe("edge-abc_123.4");
  });

  it("replaces an unsafe or oversized incoming id instead of echoing it", async () => {
    const unsafe = await request(app).get("/api/v1/lead").set("X-Request-ID", "<script>alert(1)</script>");
    expect(unsafe.headers["x-request-id"]).toMatch(UUID_RE);

    const huge = await request(app).get("/api/v1/lead").set("X-Request-ID", "a".repeat(200));
    expect(huge.headers["x-request-id"]).toMatch(UUID_RE);
  });

  it("is exposed to cross-origin frontends via CORS", async () => {
    const res = await request(app).get("/api/v1/lead").set("Origin", "http://localhost:5173");
    const exposed = String(res.headers["access-control-expose-headers"] ?? "").toLowerCase();
    expect(exposed).toContain("x-request-id");
  });
});

describe("POST /api/v1/diagnostics", () => {
  const previous = process.env.ENABLE_DIAGNOSTICS_DB;
  const marker = `neo81-spec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  beforeAll(() => {
    process.env.ENABLE_DIAGNOSTICS_DB = "1";
  });

  afterAll(async () => {
    if (previous === undefined) delete process.env.ENABLE_DIAGNOSTICS_DB;
    else process.env.ENABLE_DIAGNOSTICS_DB = previous;
    await getDb().query("DELETE FROM platform.diagnostics WHERE message LIKE $1", [`%${marker}%`]);
  });

  it("stores a frontend report with its request id and metadata in platform.diagnostics", async () => {
    const res = await request(app)
      .post("/api/v1/diagnostics")
      .send({
        level: "error",
        message: `[web.FindSpecialistView.fetchSpecialists] ${marker}`,
        stack: "",
        source: "frontend",
        request_id: "3f2a9c1e-7b4d-4e21-9a0f-5c8d2e6b1a47",
        metadata: { where: "web.FindSpecialistView.fetchSpecialists", kind: "server", status: 500 },
      });
    expect(res.status).toBe(204);

    const { rows } = await getDb().query<{ level: string; source: string; request_id: string; metadata: Record<string, unknown> }>(
      "SELECT level, source, request_id, metadata FROM platform.diagnostics WHERE message LIKE $1",
      [`%${marker}%`],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      level: "error",
      source: "frontend",
      request_id: "3f2a9c1e-7b4d-4e21-9a0f-5c8d2e6b1a47",
      metadata: { kind: "server", status: 500 },
    });
  });

  it("rejects a report without a message", async () => {
    const res = await request(app).post("/api/v1/diagnostics").send({ level: "error" });
    expect(res.status).toBe(400);
  });

  it("has its own per-IP rate limit (60 / 15 min), independent of the global limiter", async () => {
    // Two requests already used above; exhaust the rest of the window cheaply (400s still count).
    let lastStatus = 0;
    for (let i = 0; i < 58; i++) {
      const res = await request(app).post("/api/v1/diagnostics").send({});
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(400);

    const limited = await request(app).post("/api/v1/diagnostics").send({ message: `${marker} over-limit` });
    expect(limited.status).toBe(429);
    expect(limited.headers["x-request-id"]).toMatch(UUID_RE);

    // Other routes are untouched by the diagnostics limiter.
    const other = await request(app).get("/api/v1/lead");
    expect(other.status).toBe(401);
  }, 60_000);
});
