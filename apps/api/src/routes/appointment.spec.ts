import { describe, it, expect } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { app } from "../server.js";
import { withTenant, insertStaffUser, insertPatient, insertPractitioner, getCountryTerritoryId } from "../db.js";
import { signAuthToken } from "../utils/jwt.js";
import type { StaffRole } from "../db/users.js";

/**
 * NEO-27 (ADR-026): patient↔doctor appointments through the real Express
 * stack and real Postgres — the role matrix from the scoping form
 * (2026-09-26), the no-double-booking constraint, the field force never
 * seeing notes, read audit and the doctor's notification.
 */
const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** A distinct future hour per call, so tests never collide on the same doctor's slot. */
let slotCounter = 0;
function futureSlot(hoursFromBase = 0): string {
  slotCounter += 3;
  const base = Date.UTC(2031, 0, 1, 8, 0, 0) + (slotCounter + hoursFromBase) * 3_600_000 + Math.floor(Math.random() * 1_000) * 86_400_000;
  return new Date(base).toISOString();
}

interface Actor {
  id: string;
  auth: string;
}

async function staff(role: StaffRole, country?: "PL" | "MX"): Promise<Actor> {
  return withTenant(TENANT_SLUG, async (client) => {
    const email = `qa-appointment-${role}-${uniqueSuffix()}@neosleepcare.com`;
    const scope = country ? await getCountryTerritoryId(client, country) : null;
    const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
    const user = await insertStaffUser(client, email, "QA", "Pilot", role, hash, false, null, null, scope);
    return { id: user!.id, auth: `Bearer ${signAuthToken({ id: user!.id, email, role, token_version: 0 })}` };
  });
}

/** A practitioner and, optionally, the doctor login that shares its identity (ADR-014). */
async function doctor(withLogin = true): Promise<{ practitionerId: string; login: Actor | null }> {
  return withTenant(TENANT_SLUG, async (client) => {
    const email = `qa-appointment-doc-${uniqueSuffix()}@neosleepcare.com`;
    const practitioner = await insertPractitioner(client, { first_name: "Doc", last_name: `Test-${uniqueSuffix()}`, email });
    if (!withLogin) return { practitionerId: practitioner.id, login: null };
    const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
    const user = await insertStaffUser(client, email, "Doc", "Test", "doctor", hash, false);
    return {
      practitionerId: practitioner.id,
      login: { id: user!.id, auth: `Bearer ${signAuthToken({ id: user!.id, email, role: "doctor", token_version: 0 })}` },
    };
  });
}

async function patient(practitionerId: string | null, country?: "PL" | "MX"): Promise<string> {
  return withTenant(TENANT_SLUG, async (client) => {
    const territoryId = country ? await getCountryTerritoryId(client, country) : null;
    const p = await insertPatient(client, {
      first_name: "Appt",
      last_name: `Patient-${uniqueSuffix()}`,
      practitioner_id: practitionerId ?? undefined,
      territory_id: territoryId,
    });
    return p.id;
  });
}

describe("/api/v1/appointments", () => {
  it("401s without a token", async () => {
    const res = await request(app).get("/api/v1/appointments");
    expect(res.status).toBe(401);
  });

  it("admin books with the patient's assigned doctor by default, 60 minutes long, and the doctor is notified", async () => {
    const admin = await staff("admin");
    const doc = await doctor();
    const patientId = await patient(doc.practitionerId);
    const start = futureSlot();

    const res = await request(app).post("/api/v1/appointments").set("Authorization", admin.auth).send({ patient_id: patientId, start_at: start, notes: "Fitting" });
    expect(res.status).toBe(201);
    expect(res.body.practitioner_id).toBe(doc.practitionerId);
    expect(res.body.status).toBe("scheduled");
    expect(new Date(res.body.end_at).getTime() - new Date(res.body.start_at).getTime()).toBe(60 * 60_000);
    expect(res.body.notes).toBe("Fitting");

    const notifications = await withTenant(TENANT_SLUG, (client) =>
      client.query(
        `SELECT n.type FROM notification n JOIN practitioner p ON p.identity_id = n.identity_id WHERE p.id = $1 AND n.entity_id = $2`,
        [doc.practitionerId, res.body.id],
      ),
    );
    expect(notifications.rows.map((r) => r.type)).toEqual(["appointment_booked"]);
  });

  it("rejects an overlapping booking for the same doctor with 409, but a cancelled one frees the slot", async () => {
    const admin = await staff("admin");
    const doc = await doctor(false);
    const patientId = await patient(doc.practitionerId);
    const start = futureSlot();
    const halfHourLater = new Date(new Date(start).getTime() + 30 * 60_000).toISOString();

    const first = await request(app).post("/api/v1/appointments").set("Authorization", admin.auth).send({ patient_id: patientId, start_at: start });
    const clash = await request(app).post("/api/v1/appointments").set("Authorization", admin.auth).send({ patient_id: patientId, start_at: halfHourLater });
    expect([first.status, clash.status]).toEqual([201, 409]);

    const cancel = await request(app).patch(`/api/v1/appointments/${first.body.id}`).set("Authorization", admin.auth).send({ status: "cancelled" });
    const retry = await request(app).post("/api/v1/appointments").set("Authorization", admin.auth).send({ patient_id: patientId, start_at: halfHourLater });
    expect([cancel.status, retry.status]).toEqual([200, 201]);
  });

  it("back-to-back appointments don't collide ([start, end) ranges)", async () => {
    const admin = await staff("admin");
    const doc = await doctor(false);
    const patientId = await patient(doc.practitionerId);
    const start = futureSlot();
    const oneHourLater = new Date(new Date(start).getTime() + 60 * 60_000).toISOString();
    const a = await request(app).post("/api/v1/appointments").set("Authorization", admin.auth).send({ patient_id: patientId, start_at: start });
    const b = await request(app).post("/api/v1/appointments").set("Authorization", admin.auth).send({ patient_id: patientId, start_at: oneHourLater });
    expect([a.status, b.status]).toEqual([201, 201]);
  });

  it("a doctor books only their own patients, always with themselves, and sees only their own appointments", async () => {
    const doc = await doctor();
    const other = await doctor();
    const own = await patient(doc.practitionerId);
    const foreign = await patient(other.practitionerId);
    const auth = doc.login!.auth;

    const ok = await request(app).post("/api/v1/appointments").set("Authorization", auth).send({ patient_id: own, start_at: futureSlot() });
    const foreignPatient = await request(app).post("/api/v1/appointments").set("Authorization", auth).send({ patient_id: foreign, start_at: futureSlot() });
    const otherDoctor = await request(app)
      .post("/api/v1/appointments")
      .set("Authorization", auth)
      .send({ patient_id: own, practitioner_id: other.practitionerId, start_at: futureSlot() });
    expect([ok.status, foreignPatient.status, otherDoctor.status]).toEqual([201, 403, 403]);

    const admin = await staff("admin");
    const othersAppointment = await request(app).post("/api/v1/appointments").set("Authorization", admin.auth).send({ patient_id: foreign, start_at: futureSlot() });
    const list = await request(app).get("/api/v1/appointments").set("Authorization", auth);
    expect(list.status).toBe(200);
    const ids = list.body.items.map((a: { id: string }) => a.id);
    expect(ids).toContain(ok.body.id);
    expect(ids).not.toContain(othersAppointment.body.id);
    const peek = await request(app).get(`/api/v1/appointments/${othersAppointment.body.id}`).set("Authorization", auth);
    expect(peek.status).toBe(403);
  });

  it("a doctor booking for themselves doesn't notify themselves", async () => {
    const doc = await doctor();
    const own = await patient(doc.practitionerId);
    const res = await request(app).post("/api/v1/appointments").set("Authorization", doc.login!.auth).send({ patient_id: own, start_at: futureSlot() });
    const notifications = await withTenant(TENANT_SLUG, (client) => client.query(`SELECT 1 FROM notification WHERE entity_id = $1`, [res.body.id]));
    expect(notifications.rowCount).toBe(0);
  });

  it.each(["rep", "kam", "msl"] as const)("%s books inside their territory, never sees notes, and can't book outside it", async (role) => {
    const actor = await staff(role, "PL");
    const admin = await staff("admin");
    const doc = await doctor(false);
    const plPatient = await patient(doc.practitionerId, "PL");
    const mxPatient = await patient(doc.practitionerId, "MX");

    const booked = await request(app).post("/api/v1/appointments").set("Authorization", actor.auth).send({ patient_id: plPatient, start_at: futureSlot() });
    const outside = await request(app).post("/api/v1/appointments").set("Authorization", actor.auth).send({ patient_id: mxPatient, start_at: futureSlot() });
    const withNotes = await request(app)
      .post("/api/v1/appointments")
      .set("Authorization", actor.auth)
      .send({ patient_id: plPatient, start_at: futureSlot(), notes: "clinical" });
    expect([booked.status, outside.status, withNotes.status]).toEqual([201, 403, 403]);

    const clinical = await request(app)
      .post("/api/v1/appointments")
      .set("Authorization", admin.auth)
      .send({ patient_id: plPatient, start_at: futureSlot(), notes: "AHI 32, fitting" });
    const read = await request(app).get(`/api/v1/appointments/${clinical.body.id}`).set("Authorization", actor.auth);
    expect(read.status).toBe(200);
    expect(read.body.notes).toBeNull();
    const list = await request(app).get(`/api/v1/appointments?patient_id=${plPatient}`).set("Authorization", actor.auth);
    expect(list.body.items.every((a: { notes: string | null }) => a.notes === null)).toBe(true);
  });

  it("the field force can cancel what they booked, but can't close appointments or change someone else's", async () => {
    const rep = await staff("rep", "PL");
    const admin = await staff("admin");
    const doc = await doctor(false);
    const plPatient = await patient(doc.practitionerId, "PL");

    const own = await request(app).post("/api/v1/appointments").set("Authorization", rep.auth).send({ patient_id: plPatient, start_at: futureSlot() });
    const complete = await request(app).patch(`/api/v1/appointments/${own.body.id}`).set("Authorization", rep.auth).send({ status: "completed" });
    const reschedule = await request(app).patch(`/api/v1/appointments/${own.body.id}`).set("Authorization", rep.auth).send({ start_at: futureSlot() });
    const cancel = await request(app).patch(`/api/v1/appointments/${own.body.id}`).set("Authorization", rep.auth).send({ status: "cancelled" });
    expect([complete.status, reschedule.status, cancel.status]).toEqual([403, 200, 200]);

    const adminBooked = await request(app).post("/api/v1/appointments").set("Authorization", admin.auth).send({ patient_id: plPatient, start_at: futureSlot() });
    const foreignCancel = await request(app).patch(`/api/v1/appointments/${adminBooked.body.id}`).set("Authorization", rep.auth).send({ status: "cancelled" });
    expect(foreignCancel.status).toBe(403);
  });

  it("manager and the appointment's doctor close appointments; reschedule keeps the length and notifies the doctor", async () => {
    const manager = await staff("manager");
    const doc = await doctor();
    const patientId = await patient(doc.practitionerId);
    const start = futureSlot();

    const created = await request(app).post("/api/v1/appointments").set("Authorization", manager.auth).send({ patient_id: patientId, start_at: start, duration_minutes: 30 });
    const newStart = futureSlot();
    const moved = await request(app).patch(`/api/v1/appointments/${created.body.id}`).set("Authorization", manager.auth).send({ start_at: newStart });
    expect(moved.status).toBe(200);
    expect(moved.body.start_at).toBe(new Date(newStart).toISOString());
    expect(new Date(moved.body.end_at).getTime() - new Date(moved.body.start_at).getTime()).toBe(30 * 60_000);

    const noShow = await request(app).patch(`/api/v1/appointments/${created.body.id}`).set("Authorization", doc.login!.auth).send({ status: "no_show" });
    const completed = await request(app).patch(`/api/v1/appointments/${created.body.id}`).set("Authorization", manager.auth).send({ status: "completed" });
    expect([noShow.status, completed.status]).toEqual([200, 200]);

    const types = await withTenant(TENANT_SLUG, (client) =>
      client.query<{ type: string }>(`SELECT type FROM notification WHERE entity_id = $1 ORDER BY created_at`, [created.body.id]),
    );
    expect(types.rows.map((r) => r.type)).toEqual(["appointment_booked", "appointment_rescheduled"]);
  });

  it("validates input: bad UUIDs, missing start, silly durations", async () => {
    const admin = await staff("admin");
    const doc = await doctor(false);
    const patientId = await patient(doc.practitionerId);
    const badId = await request(app).post("/api/v1/appointments").set("Authorization", admin.auth).send({ patient_id: "nope", start_at: futureSlot() });
    const noStart = await request(app).post("/api/v1/appointments").set("Authorization", admin.auth).send({ patient_id: patientId });
    const tooLong = await request(app).post("/api/v1/appointments").set("Authorization", admin.auth).send({ patient_id: patientId, start_at: futureSlot(), duration_minutes: 900 });
    const noDoctor = await request(app).post("/api/v1/appointments").set("Authorization", admin.auth).send({ patient_id: await patient(null), start_at: futureSlot() });
    const badStatus = await request(app).get(`/api/v1/appointments/${crypto.randomUUID()}`).set("Authorization", admin.auth);
    expect([badId.status, noStart.status, tooLong.status, noDoctor.status, badStatus.status]).toEqual([400, 400, 400, 400, 404]);
  });

  it("clinical reads are audited (not the field force's redacted ones); only admin deletes", async () => {
    const admin = await staff("admin");
    const manager = await staff("manager");
    const doc = await doctor(false);
    const patientId = await patient(doc.practitionerId);
    const created = await request(app).post("/api/v1/appointments").set("Authorization", admin.auth).send({ patient_id: patientId, start_at: futureSlot() });

    await request(app).get(`/api/v1/appointments/${created.body.id}`).set("Authorization", manager.auth);
    await request(app).get(`/api/v1/appointments?patient_id=${patientId}`).set("Authorization", manager.auth);
    const reads = await withTenant(TENANT_SLUG, (client) =>
      client.query<{ entity_type: string; metadata: { view: string; role: string } }>(
        `SELECT entity_type, metadata FROM audit_log WHERE action = 'read' AND metadata->>'patient_id' = $1 ORDER BY created_at`,
        [patientId],
      ),
    );
    expect(reads.rows.map((r) => [r.entity_type, r.metadata.view, r.metadata.role])).toEqual([
      ["Appointment", "appointment", "manager"],
      ["Appointment", "appointments-list", "manager"],
    ]);

    const managerDelete = await request(app).delete(`/api/v1/appointments/${created.body.id}`).set("Authorization", manager.auth);
    const adminDelete = await request(app).delete(`/api/v1/appointments/${created.body.id}`).set("Authorization", admin.auth);
    const gone = await request(app).get(`/api/v1/appointments/${created.body.id}`).set("Authorization", admin.auth);
    expect([managerDelete.status, adminDelete.status, gone.status]).toEqual([403, 200, 404]);
  });

  it("lists by time window", async () => {
    const admin = await staff("admin");
    const doc = await doctor(false);
    const patientId = await patient(doc.practitionerId);
    const start = futureSlot();
    const created = await request(app).post("/api/v1/appointments").set("Authorization", admin.auth).send({ patient_id: patientId, start_at: start });
    const inWindow = await request(app)
      .get(`/api/v1/appointments?start=${encodeURIComponent(new Date(new Date(start).getTime() - 3_600_000).toISOString())}&end=${encodeURIComponent(new Date(new Date(start).getTime() + 3_600_000).toISOString())}&practitioner_id=${doc.practitionerId}`)
      .set("Authorization", admin.auth);
    const before = await request(app)
      .get(`/api/v1/appointments?end=${encodeURIComponent(start)}&practitioner_id=${doc.practitionerId}`)
      .set("Authorization", admin.auth);
    expect(inWindow.body.items.map((a: { id: string }) => a.id)).toEqual([created.body.id]);
    expect(before.body.items).toEqual([]);
  });
});
