import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "./server";

describe("API server", () => {
  it("GET /health returns ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  // Auth guard — unauthenticated requests should return 401
  it("GET /api/leads without session returns 401", async () => {
    const res = await request(app).get("/api/leads");
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
  });

  it("GET /api/leads accepts pagination and filter query params (returns 401 without session)", async () => {
    const res = await request(app).get("/api/leads?page=2&limit=2&sortBy=name&sortOrder=asc&search=alpha&status=qualified");
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
  });

  it("GET /api/leads applies status filter server-side (401 without session)", async () => {
    const res = await request(app).get("/api/leads?status=qualified");
    expect(res.status).toBe(401);
  });

  it("GET /api/leads applies region filter server-side (401 without session)", async () => {
    const res = await request(app).get("/api/leads?region=Central");
    expect(res.status).toBe(401);
  });

  it("GET /api/leads applies search filter server-side (401 without session)", async () => {
    const res = await request(app).get("/api/leads?search=alpha");
    expect(res.status).toBe(401);
  });

  it("GET /api/hcp without session returns 401", async () => {
    const res = await request(app).get("/api/hcp");
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
  });

  it("GET /api/presentations without session returns 401", async () => {
    const res = await request(app).get("/api/presentations");
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
  });

  describe("events API", () => {
    it("GET /api/events returns 401 without session", async () => {
      const res = await request(app).get("/api/events");
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty("error");
    });

    it("GET /api/events accepts start and end query params (401 without session)", async () => {
      const start = "2026-02-01T00:00:00.000Z";
      const end = "2026-02-28T23:59:59.999Z";
      const res = await request(app).get(`/api/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
      expect(res.status).toBe(401);
    });

    it("GET /api/events/:id returns 401 without session for non-existent id", async () => {
      const res = await request(app).get("/api/events/00000000-0000-0000-0000-000000000000");
      expect(res.status).toBe(401);
    });

    it("POST /api/events returns 401 without session (when no DB)", async () => {
      const res = await request(app)
        .post("/api/events")
        .send({
          title: "Test event",
          start_at: "2026-02-19T09:00:00.000Z",
          end_at: "2026-02-19T10:00:00.000Z",
          type: "f2f",
          status: "scheduled",
          attendees: [],
        });
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty("error");
    });
  });

  // Authorization — no session at all
  it("PATCH /api/config/app without any session returns 401", async () => {
    const res = await request(app)
      .patch("/api/config/app")
      .send({ primary_color: "#ff0000" });
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
  });

  // Input validation
  it("POST /api/contact without firstName returns 400", async () => {
    const res = await request(app)
      .post("/api/contact")
      .send({ lastName: "Smith", phone: "1234567890", city: "Warsaw" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("POST /api/contact without phone returns 400", async () => {
    const res = await request(app)
      .post("/api/contact")
      .send({ firstName: "John", lastName: "Smith", city: "Warsaw" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("POST /api/diagnostics without message field returns 400 (when diagnostics enabled)", async () => {
    const original = process.env.ENABLE_DIAGNOSTICS_DB;
    process.env.ENABLE_DIAGNOSTICS_DB = "1";
    try {
      const res = await request(app)
        .post("/api/diagnostics")
        .send({ level: "error" });
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
    } finally {
      process.env.ENABLE_DIAGNOSTICS_DB = original;
    }
  });

  // Public endpoints
  it("GET /api/config/app returns 200", async () => {
    const res = await request(app).get("/api/config/app");
    expect(res.status).toBe(200);
  });
});
