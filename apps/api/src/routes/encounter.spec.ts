import { describe, it, expect } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { app } from "../server.js";
import { withTenant, insertStaffUser } from "../db.js";
import { signAuthToken } from "../utils/jwt.js";

/**
 * NEO-112: the planner's event form could never save — the API validated
 * status "planned" (the DB only allows "scheduled") and the form sent types
 * and attendees the encounter doesn't take. The PWA now maps its form through
 * apps/pwa/src/utils/encounterMapping.ts; this posts exactly that body
 * through the real Express stack and real Postgres.
 */
const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";

async function repAuth(): Promise<string> {
  const email = `qa-encounter-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@neosleepcare.com`;
  const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
  const user = await withTenant(TENANT_SLUG, (client) => insertStaffUser(client, email, "QA", "Rep", "rep", hash, false));
  return `Bearer ${signAuthToken({ id: user!.id, email, role: "rep", token_version: 0 })}`;
}

// What toEncounterBody() sends for a video call with a clinic and a doctor attending.
const formBody = {
  start_at: "2026-10-01T10:00:00.000Z",
  end_at: "2026-10-01T11:00:00.000Z",
  type: "call",
  status: "scheduled",
  notes: "Traer muestras",
  region: "MX",
  attendees: ["hco:11111111-1111-1111-1111-111111111111", "doctor:22222222-2222-2222-2222-222222222222"],
  metadata: { title: "Visita Dra. López", location: null, video_link: "https://meet.example.com/abc" },
};

describe("/api/v1/encounter — the planner's event form (NEO-112)", () => {
  it("creates an event, lists it back with its title and attendees, and edits it", async () => {
    const auth = await repAuth();
    const created = await request(app).post("/api/v1/encounter").set("Authorization", auth).send(formBody);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ type: "call", status: "scheduled", class: "VR", attendees: formBody.attendees });
    expect(created.body.metadata).toMatchObject({ title: "Visita Dra. López" });

    const listed = await request(app)
      .get("/api/v1/encounter?start=2026-10-01T00:00:00.000Z&end=2026-10-02T00:00:00.000Z")
      .set("Authorization", auth);
    expect(listed.status).toBe(200);
    expect(listed.body.items.map((e: { id: string }) => e.id)).toContain(created.body.id);

    const edited = await request(app)
      .patch(`/api/v1/encounter/${created.body.id}`)
      .set("Authorization", auth)
      .send({ ...formBody, type: "visit", status: "completed", metadata: { ...formBody.metadata, title: "Visita hecha" } });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ type: "visit", status: "completed" });
    expect(edited.body.metadata).toMatchObject({ title: "Visita hecha" });
  });

  it("defaults a new event to scheduled, which the database accepts", async () => {
    const auth = await repAuth();
    const { status: _omit, ...withoutStatus } = formBody;
    const created = await request(app).post("/api/v1/encounter").set("Authorization", auth).send(withoutStatus);
    expect(created.status).toBe(201);
    expect(created.body.status).toBe("scheduled");
  });

  it("still names the field for a type the encounter doesn't know", async () => {
    const auth = await repAuth();
    const res = await request(app).post("/api/v1/encounter").set("Authorization", auth).send({ ...formBody, type: "f2f" });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: "VALIDATION_ERROR", field: "type" });
  });
});
