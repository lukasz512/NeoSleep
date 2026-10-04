import { describe, it, expect } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { app } from "../server.js";
import { withTenant, insertStaffUser, insertPatient, getCountryTerritoryId } from "../db.js";
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

/**
 * CORE-137: an event can be made "for" a patient. It then lists on that
 * patient's card (?patient_id=) and in their History, and only patients the
 * user may see can be linked.
 */
async function authFor(role: "rep" | "admin", country?: "PL" | "MX"): Promise<string> {
  const email = `qa-encounter-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@neosleepcare.com`;
  const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
  const user = await withTenant(TENANT_SLUG, async (client) => {
    const scope = country ? await getCountryTerritoryId(client, country) : null;
    return insertStaffUser(client, email, "QA", "Rep", role, hash, false, null, null, scope);
  });
  return `Bearer ${signAuthToken({ id: user!.id, email, role, token_version: 0 })}`;
}

async function newPatient(country: "PL" | "MX"): Promise<string> {
  return withTenant(TENANT_SLUG, async (client) => {
    const p = await insertPatient(client, {
      first_name: "Event",
      last_name: `Patient-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      territory_id: await getCountryTerritoryId(client, country),
    });
    return p.id;
  });
}

describe("/api/v1/encounter — linked to a patient (CORE-137)", () => {
  it("an event created with a patient returns it, lists under ?patient_id= and shows in the patient's History", async () => {
    const admin = await authFor("admin");
    const patientId = await newPatient("MX");
    const created = await request(app).post("/api/v1/encounter").set("Authorization", admin).send({ ...formBody, patient_id: patientId });
    expect(created.status).toBe(201);
    expect(created.body.patient_id).toBe(patientId);

    const listed = await request(app).get(`/api/v1/encounter?patient_id=${patientId}`).set("Authorization", admin);
    expect(listed.status).toBe(200);
    expect(listed.body.items.map((e: { id: string }) => e.id)).toEqual([created.body.id]);

    const history = await request(app).get(`/api/v1/patient/${patientId}/history`).set("Authorization", admin);
    expect(history.status).toBe(200);
    expect(history.body.entries.some((e: { entity_type: string; action: string; entity_id: string }) =>
      e.entity_type === "Encounter" && e.action === "create" && e.entity_id === created.body.id)).toBe(true);
  });

  it("linking a patient on update is audited and shows in History too", async () => {
    const admin = await authFor("admin");
    const patientId = await newPatient("MX");
    const created = await request(app).post("/api/v1/encounter").set("Authorization", admin).send(formBody);
    expect(created.body.patient_id).toBeNull();
    const edited = await request(app).patch(`/api/v1/encounter/${created.body.id}`).set("Authorization", admin).send({ patient_id: patientId });
    expect(edited.status).toBe(200);
    expect(edited.body.patient_id).toBe(patientId);

    const history = await request(app).get(`/api/v1/patient/${patientId}/history`).set("Authorization", admin);
    expect(history.body.entries.some((e: { entity_type: string; action: string; entity_id: string }) =>
      e.entity_type === "Encounter" && e.action === "update" && e.entity_id === created.body.id)).toBe(true);
  });

  it("403 when the patient is outside the user's scope, on create and on update", async () => {
    const plRep = await authFor("rep", "PL");
    const mxPatient = await newPatient("MX");
    const denied = await request(app).post("/api/v1/encounter").set("Authorization", plRep).send({ ...formBody, patient_id: mxPatient });
    expect(denied.status).toBe(403);

    const own = await request(app).post("/api/v1/encounter").set("Authorization", plRep).send(formBody);
    expect(own.status).toBe(201);
    const deniedPatch = await request(app).patch(`/api/v1/encounter/${own.body.id}`).set("Authorization", plRep).send({ patient_id: mxPatient });
    expect(deniedPatch.status).toBe(403);
  });

  it("403 when listing another scope's patient events", async () => {
    const plRep = await authFor("rep", "PL");
    const mxPatient = await newPatient("MX");
    const res = await request(app).get(`/api/v1/encounter?patient_id=${mxPatient}`).set("Authorization", plRep);
    expect(res.status).toBe(403);
  });

  it("events without a patient behave as before", async () => {
    const auth = await repAuth();
    const created = await request(app).post("/api/v1/encounter").set("Authorization", auth).send(formBody);
    expect(created.status).toBe(201);
    expect(created.body.patient_id).toBeNull();
  });
});
