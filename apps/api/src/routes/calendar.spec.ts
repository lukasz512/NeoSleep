import { describe, it, expect } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { app } from "../server.js";
import { withTenant, insertStaffUser, insertPatient, insertPractitioner } from "../db.js";
import { signAuthToken } from "../utils/jwt.js";

/**
 * CORE-117: /api/v1/calendar is the "Calendario" screen's one list —
 * encounters (Planificador) + appointments (Citas) for a date range, each
 * tagged with its kind. It is a thin merge over GetEncounterListQuery and
 * GetAppointmentsQuery (queries/calendar.ts), so it inherits whatever
 * visibility those two already enforce — including CORE-106's encounter
 * ownership fix once that lands, with no change needed in this route.
 */
const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface Actor {
  id: string;
  auth: string;
}

async function rep(): Promise<Actor> {
  return withTenant(TENANT_SLUG, async (client) => {
    const email = `qa-calendar-rep-${uniqueSuffix()}@neosleepcare.com`;
    const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
    const user = await insertStaffUser(client, email, "QA", "Rep", "rep", hash, false);
    return { id: user!.id, auth: `Bearer ${signAuthToken({ id: user!.id, email, role: "rep", token_version: 0 })}` };
  });
}

async function admin(): Promise<Actor> {
  return withTenant(TENANT_SLUG, async (client) => {
    const email = `qa-calendar-admin-${uniqueSuffix()}@neosleepcare.com`;
    const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
    const user = await insertStaffUser(client, email, "QA", "Admin", "admin", hash, false);
    return { id: user!.id, auth: `Bearer ${signAuthToken({ id: user!.id, email, role: "admin", token_version: 0 })}` };
  });
}

async function patientAndDoctor(): Promise<{ patientId: string; practitionerId: string }> {
  return withTenant(TENANT_SLUG, async (client) => {
    const practitioner = await insertPractitioner(client, { first_name: "Doc", last_name: `Test-${uniqueSuffix()}`, email: `qa-calendar-doc-${uniqueSuffix()}@neosleepcare.com` });
    const patient = await insertPatient(client, { first_name: "Pat", last_name: `Test-${uniqueSuffix()}`, practitioner_id: practitioner.id });
    return { patientId: patient.id, practitionerId: practitioner.id };
  });
}

let slotCounter = 0;
/** A distinct future hour per call, inside the fixed window the tests query. */
function slot(hoursFromBase = 0): string {
  slotCounter += 1;
  return new Date(Date.UTC(2032, 0, 1, 8, 0, 0) + (slotCounter + hoursFromBase) * 3_600_000).toISOString();
}

async function createEncounter(auth: string, start: string): Promise<string> {
  const res = await request(app)
    .post("/api/v1/encounter")
    .set("Authorization", auth)
    .send({ start_at: start, end_at: new Date(new Date(start).getTime() + 3_600_000).toISOString(), type: "visit", status: "scheduled", region: "MX", attendees: [] });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function createAppointment(auth: string, patientId: string, practitionerId: string, start: string): Promise<string> {
  const res = await request(app)
    .post("/api/v1/appointments")
    .set("Authorization", auth)
    .send({ patient_id: patientId, practitioner_id: practitionerId, start_at: start, end_at: new Date(new Date(start).getTime() + 1_800_000).toISOString() });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

// A wide window (not just one day) so the shared slotCounter across this file's
// tests never pushes a "future" slot() call past the end boundary.
const RANGE = { start: "2032-01-01T00:00:00.000Z", end: "2032-02-01T00:00:00.000Z" };

describe("GET /api/v1/calendar (CORE-117)", () => {
  it("returns both encounters and appointments, each tagged with its kind", async () => {
    const actor = await admin();
    const { patientId, practitionerId } = await patientAndDoctor();
    const encounterId = await createEncounter(actor.auth, slot());
    const appointmentId = await createAppointment(actor.auth, patientId, practitionerId, slot());

    const res = await request(app)
      .get(`/api/v1/calendar?start=${RANGE.start}&end=${RANGE.end}`)
      .set("Authorization", actor.auth);

    expect(res.status).toBe(200);
    const byId = new Map(res.body.items.map((i: { id: string; kind: string }) => [i.id, i.kind]));
    expect(byId.get(encounterId)).toBe("encounter");
    expect(byId.get(appointmentId)).toBe("appointment");
  });

  it("filters by date range — an item outside the window is excluded", async () => {
    const actor = await admin();
    const encounterInRange = await createEncounter(actor.auth, slot());
    // Far outside RANGE (2032-01-01..02-01) — a different month entirely.
    const encounterOutOfRange = await createEncounter(actor.auth, "2032-06-15T10:00:00.000Z");

    const res = await request(app)
      .get(`/api/v1/calendar?start=${RANGE.start}&end=${RANGE.end}`)
      .set("Authorization", actor.auth);

    const ids = res.body.items.map((i: { id: string }) => i.id);
    expect(ids).toContain(encounterInRange);
    expect(ids).not.toContain(encounterOutOfRange);
  });

  it("a rep does not see another rep's encounter in the union", async () => {
    const repA = await rep();
    const repB = await rep();
    const ownEncounter = await createEncounter(repA.auth, slot());
    const othersEncounter = await createEncounter(repB.auth, slot());

    const res = await request(app)
      .get(`/api/v1/calendar?start=${RANGE.start}&end=${RANGE.end}`)
      .set("Authorization", repA.auth);

    expect(res.status).toBe(200);
    const ids = res.body.items.map((i: { id: string }) => i.id);
    expect(ids).toContain(ownEncounter);
    expect(ids).not.toContain(othersEncounter);
  });

  it("items are sorted chronologically across both kinds", async () => {
    const actor = await admin();
    const { patientId, practitionerId } = await patientAndDoctor();
    const later = await createAppointment(actor.auth, patientId, practitionerId, slot(10));
    const earlier = await createEncounter(actor.auth, slot(1));

    const res = await request(app)
      .get(`/api/v1/calendar?start=${RANGE.start}&end=${RANGE.end}`)
      .set("Authorization", actor.auth);

    const ids = res.body.items.map((i: { id: string }) => i.id);
    expect(ids.indexOf(earlier)).toBeLessThan(ids.indexOf(later));
  });
});
