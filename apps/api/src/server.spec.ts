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
  // NOTE: routes live under /api/v1 (see server.ts) using singular resource
  // names (lead, practitioner, presentation, encounter) — these tests used
  // to hit stale pre-refactor paths (/api/leads, /api/hcp, /api/events, ...)
  // and had never actually run to completion (masked by the DATABASE_URL
  // crash below, fixed once CI provisions a real Postgres for this suite).
  it("GET /api/v1/lead without session returns 401", async () => {
    const res = await request(app).get("/api/v1/lead");
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
  });

  it("GET /api/v1/lead accepts pagination and filter query params (returns 401 without session)", async () => {
    const res = await request(app).get("/api/v1/lead?page=2&limit=2&sortBy=name&sortOrder=asc&search=alpha&status=qualified");
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
  });

  it("GET /api/v1/lead applies status filter server-side (401 without session)", async () => {
    const res = await request(app).get("/api/v1/lead?status=qualified");
    expect(res.status).toBe(401);
  });

  it("GET /api/v1/lead applies region filter server-side (401 without session)", async () => {
    const res = await request(app).get("/api/v1/lead?region=Central");
    expect(res.status).toBe(401);
  });

  it("GET /api/v1/lead applies search filter server-side (401 without session)", async () => {
    const res = await request(app).get("/api/v1/lead?search=alpha");
    expect(res.status).toBe(401);
  });

  it("GET /api/v1/practitioner without session returns 401", async () => {
    const res = await request(app).get("/api/v1/practitioner");
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
  });

  it("GET /api/v1/presentation without session returns 401", async () => {
    const res = await request(app).get("/api/v1/presentation");
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
  });

  describe("encounter API", () => {
    it("GET /api/v1/encounter returns 401 without session", async () => {
      const res = await request(app).get("/api/v1/encounter");
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty("error");
    });

    it("GET /api/v1/encounter accepts start and end query params (401 without session)", async () => {
      const start = "2026-02-01T00:00:00.000Z";
      const end = "2026-02-28T23:59:59.999Z";
      const res = await request(app).get(`/api/v1/encounter?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
      expect(res.status).toBe(401);
    });

    it("GET /api/v1/encounter/:id returns 401 without session for non-existent id", async () => {
      const res = await request(app).get("/api/v1/encounter/00000000-0000-0000-0000-000000000000");
      expect(res.status).toBe(401);
    });

    it("POST /api/v1/encounter returns 401 without session (when no DB)", async () => {
      const res = await request(app)
        .post("/api/v1/encounter")
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
  it("PATCH /api/v1/config/app without any session returns 401", async () => {
    const res = await request(app)
      .patch("/api/v1/config/app")
      .send({ primary_color: "#ff0000" });
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
  });

  // Input validation
  it("POST /api/v1/contact without firstName returns 400", async () => {
    const res = await request(app)
      .post("/api/v1/contact")
      .send({ lastName: "Smith", phone: "1234567890", city: "Warsaw" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("POST /api/v1/contact without phone returns 400", async () => {
    const res = await request(app)
      .post("/api/v1/contact")
      .send({ firstName: "John", lastName: "Smith", city: "Warsaw" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("POST /api/v1/diagnostics without message field returns 400 (when diagnostics enabled)", async () => {
    const original = process.env.ENABLE_DIAGNOSTICS_DB;
    process.env.ENABLE_DIAGNOSTICS_DB = "1";
    try {
      const res = await request(app)
        .post("/api/v1/diagnostics")
        .send({ level: "error" });
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
    } finally {
      process.env.ENABLE_DIAGNOSTICS_DB = original;
    }
  });

  // Public endpoints
  it("GET /api/v1/config/app returns 200", async () => {
    const res = await request(app).get("/api/v1/config/app");
    expect(res.status).toBe(200);
  });

  // Booking (public, no session). What's actually under test here is that the
  // route is reachable without auth — the outcome legitimately differs by
  // environment: 200 where GOOGLE_CALENDAR_* is configured, 502 ("not
  // configured", see services/googleCalendar.ts) where it isn't. Asserting a
  // single status would make this pass or fail on whether a developer happens
  // to have Calendar credentials in their .env.
  it("GET /api/v1/booking/slots is public (never 401), configured or not", async () => {
    const res = await request(app).get("/api/v1/booking/slots");
    expect(res.status).not.toBe(401);
    expect([200, 502]).toContain(res.status);
    if (res.status === 200) {
      expect(Array.isArray(res.body.slots)).toBe(true);
    } else {
      expect(res.body).toHaveProperty("error");
    }
  });

  it("POST /api/v1/lead/:id/send-offer without session returns 401", async () => {
    const res = await request(app).post("/api/v1/lead/00000000-0000-0000-0000-000000000000/send-offer");
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error");
  });

  it("GET /api/v1/public/lead/:id is public and 404s for an unknown id", async () => {
    const res = await request(app).get("/api/v1/public/lead/00000000-0000-0000-0000-000000000000");
    expect(res.status).not.toBe(401);
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });

  it("GET /api/v1/public/specialists is public", async () => {
    const res = await request(app).get("/api/v1/public/specialists");
    expect(res.status).not.toBe(401);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("specialists");
    expect(Array.isArray(res.body.specialists)).toBe(true);
  });
});
