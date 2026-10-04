import { describe, it, expect } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { app } from "../server.js";
import { withTenant, insertStaffUser, insertPatient, insertPractitioner, insertOrganization, linkPractitionerOrganization } from "../db.js";
import { signAuthToken } from "../utils/jwt.js";

/**
 * CORE-120: a booking is entered as clinic wall-clock time ("start_local")
 * and the server converts it in the clinic's zone — the one it stores on the
 * appointment. Before, the PWA converted in the device's zone while the
 * server stamped the clinic's: a PL admin booking an MX clinic at 15:00 got
 * 07:00 (Warsaw +2 vs Mexico City −6).
 */
const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";
const MX = "America/Mexico_City";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** A future day no other test books (fresh doctor per test anyway). */
function futureDay(): string {
  const d = new Date(Date.UTC(2031, 0, 5) + Math.floor(Math.random() * 300) * 86_400_000);
  return d.toISOString().slice(0, 10);
}

async function plAdmin(): Promise<string> {
  return withTenant(TENANT_SLUG, async (client) => {
    const email = `qa-walltime-admin-${uniqueSuffix()}@neosleepcare.com`;
    const user = await insertStaffUser(client, email, "QA", "Admin", "admin", await bcrypt.hash("x", 4), false);
    return `Bearer ${signAuthToken({ id: user!.id, email, role: "admin", token_version: 0 })}`;
  });
}

/** An MX doctor whose only clinic is NOT flagged primary — the case that fell back to the tenant default zone. */
async function mxDoctorAndPatient(opts: { primary: boolean } = { primary: false }): Promise<{ practitionerId: string; patientId: string; organizationId: string }> {
  return withTenant(TENANT_SLUG, async (client) => {
    const practitioner = await insertPractitioner(client, { first_name: "Ana", last_name: `Doc-${uniqueSuffix()}`, email: `qa-walltime-doc-${uniqueSuffix()}@neosleepcare.com` });
    const org = await insertOrganization(client, { name: `Clínica QA ${uniqueSuffix()}`, address_line1: "Av. Reforma 1", city: "CDMX", postal_code: "06600", country_code: "MX" });
    await linkPractitionerOrganization(client, practitioner.id, org.id, null);
    if (opts.primary) await client.query(`UPDATE practitioner_organization SET is_primary = true WHERE practitioner_id = $1`, [practitioner.id]);
    const patient = await insertPatient(client, { first_name: "Pac", last_name: `Wall-${uniqueSuffix()}`, practitioner_id: practitioner.id, region: "MX" });
    return { practitionerId: practitioner.id, patientId: patient.id, organizationId: org.id };
  });
}

describe("booking in clinic wall-clock time (CORE-120)", () => {
  it("15:00 at an MX clinic is 15:00 Mexico City, whoever books it", async () => {
    const auth = await plAdmin();
    const s = await mxDoctorAndPatient({ primary: true });
    const day = futureDay();

    const res = await request(app).post("/api/v1/appointments").set("Authorization", auth).send({ patient_id: s.patientId, organization_id: s.organizationId, start_local: `${day}T15:00` });
    expect(res.status).toBe(201);
    expect(res.body.timezone).toBe(MX);
    expect(res.body.start_at).toBe(new Date(`${day}T21:00:00.000Z`).toISOString());
    expect(res.body.end_at).toBe(new Date(`${day}T22:00:00.000Z`).toISOString());
  });

  it("without organization_id, the doctor's only clinic sets the zone even when it isn't flagged primary", async () => {
    const auth = await plAdmin();
    const s = await mxDoctorAndPatient({ primary: false });
    const day = futureDay();

    const res = await request(app).post("/api/v1/appointments").set("Authorization", auth).send({ patient_id: s.patientId, start_local: `${day}T16:00` });
    expect(res.status).toBe(201);
    expect(res.body.organization_id).toBe(s.organizationId);
    expect(res.body.timezone).toBe(MX);
    expect(res.body.start_at).toBe(new Date(`${day}T22:00:00.000Z`).toISOString());
  });

  it("a doctor with no clinic falls back to the patient's country before the tenant default", async () => {
    const auth = await plAdmin();
    const { practitionerId, patientId } = await withTenant(TENANT_SLUG, async (client) => {
      const practitioner = await insertPractitioner(client, { first_name: "Sin", last_name: `Clinica-${uniqueSuffix()}`, email: `qa-walltime-noclinic-${uniqueSuffix()}@neosleepcare.com` });
      const patient = await insertPatient(client, { first_name: "Pac", last_name: `Wall-${uniqueSuffix()}`, practitioner_id: practitioner.id, region: "MX" });
      return { practitionerId: practitioner.id, patientId: patient.id };
    });
    const day = futureDay();
    const res = await request(app).post("/api/v1/appointments").set("Authorization", auth).send({ patient_id: patientId, practitioner_id: practitionerId, start_local: `${day}T09:00` });
    expect(res.status).toBe(201);
    expect(res.body.timezone).toBe(MX);
    expect(res.body.start_at).toBe(new Date(`${day}T15:00:00.000Z`).toISOString());
  });

  it("a reschedule in wall-clock time uses the appointment's own zone and keeps the length", async () => {
    const auth = await plAdmin();
    const s = await mxDoctorAndPatient({ primary: true });
    const day = futureDay();
    const created = await request(app).post("/api/v1/appointments").set("Authorization", auth).send({ patient_id: s.patientId, start_local: `${day}T15:00`, duration_minutes: 45 });
    expect(created.status).toBe(201);

    const moved = await request(app).patch(`/api/v1/appointments/${created.body.id}`).set("Authorization", auth).send({ start_local: `${day}T17:30` });
    expect(moved.status).toBe(200);
    expect(moved.body.start_at).toBe(new Date(`${day}T23:30:00.000Z`).toISOString());
    expect(new Date(moved.body.end_at).getTime() - new Date(moved.body.start_at).getTime()).toBe(45 * 60_000);
  });

  it("start_at and start_local together are a 400 on start_local", async () => {
    const auth = await plAdmin();
    const s = await mxDoctorAndPatient({ primary: true });
    const day = futureDay();
    const res = await request(app).post("/api/v1/appointments").set("Authorization", auth).send({ patient_id: s.patientId, start_local: `${day}T15:00`, start_at: `${day}T21:00:00.000Z` });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe("start_local");
  });

  it("a malformed start_local is a 400 on start_local", async () => {
    const auth = await plAdmin();
    const s = await mxDoctorAndPatient({ primary: true });
    const res = await request(app).post("/api/v1/appointments").set("Authorization", auth).send({ patient_id: s.patientId, start_local: "tomorrow 3pm" });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe("start_local");
  });

  it("GET /appointments/booking-zone tells the form which zone it is booking in", async () => {
    const auth = await plAdmin();
    const s = await mxDoctorAndPatient({ primary: false });
    const byDoctor = await request(app).get(`/api/v1/appointments/booking-zone?practitioner_id=${s.practitionerId}`).set("Authorization", auth);
    const byClinic = await request(app).get(`/api/v1/appointments/booking-zone?organization_id=${s.organizationId}`).set("Authorization", auth);
    const anon = await request(app).get(`/api/v1/appointments/booking-zone?organization_id=${s.organizationId}`);
    expect([byDoctor.status, byDoctor.body.timezone]).toEqual([200, MX]);
    expect([byClinic.status, byClinic.body.timezone]).toEqual([200, MX]);
    expect(anon.status).toBe(401);
  });
});
