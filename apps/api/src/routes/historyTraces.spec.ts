import { describe, it, expect } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { app } from "../server.js";
import { withTenant, insertStaffUser, insertPatient, insertPractitioner, insertAuditLog, getCountryTerritoryId, setAppointmentPatientToken } from "../db.js";
import { generateToken } from "../utils/generateToken.js";
import { hashToken } from "../utils/hashToken.js";
import { signAuthToken } from "../utils/jwt.js";
import type { StaffRole } from "../db/users.js";

/**
 * CORE-133: History shows what happened to a patient or a doctor, not only
 * edits of their own record. Before, three bookings for one patient left the
 * patient's History with nothing about them and the doctor's History empty.
 */
const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";

interface Entry {
  action: string;
  actor: string | null;
  entity_type: string;
  entity_id: string | null;
  entity_before: Record<string, unknown> | null;
  entity_after: Record<string, unknown> | null;
}

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

let slotCounter = 0;
function futureSlot(): string {
  slotCounter += 2;
  return new Date(Date.UTC(2032, 2, 1, 8) + slotCounter * 3_600_000 + Math.floor(Math.random() * 500) * 86_400_000).toISOString();
}

async function staff(role: StaffRole, country?: "PL" | "MX"): Promise<string> {
  return withTenant(TENANT_SLUG, async (client) => {
    const email = `qa-history-${role}-${uniqueSuffix()}@neosleepcare.com`;
    const scope = country ? await getCountryTerritoryId(client, country) : null;
    const user = await insertStaffUser(client, email, "QA", "History", role, await bcrypt.hash("x", 4), false, null, null, scope);
    return `Bearer ${signAuthToken({ id: user!.id, email, role, token_version: 0 })}`;
  });
}

async function doctorAndPatient(country: "PL" | "MX" = "MX"): Promise<{ practitionerId: string; patientId: string; doctorLastName: string }> {
  return withTenant(TENANT_SLUG, async (client) => {
    const doctorLastName = `Doc-${uniqueSuffix()}`;
    const practitioner = await insertPractitioner(client, { first_name: "Hist", last_name: doctorLastName, email: `qa-history-doc-${uniqueSuffix()}@neosleepcare.com` });
    const patient = await insertPatient(client, {
      first_name: "Hist",
      last_name: `Patient-${uniqueSuffix()}`,
      practitioner_id: practitioner.id,
      territory_id: await getCountryTerritoryId(client, country),
    });
    return { practitionerId: practitioner.id, patientId: patient.id, doctorLastName };
  });
}

async function history(auth: string, path: string): Promise<Entry[]> {
  const res = await request(app).get(path).set("Authorization", auth);
  expect(res.status).toBe(200);
  return res.body.entries as Entry[];
}

async function book(auth: string, patientId: string, notes?: string): Promise<string> {
  const res = await request(app).post("/api/v1/appointments").set("Authorization", auth).send({ patient_id: patientId, start_at: futureSlot(), ...(notes ? { notes } : {}) });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

describe("History traces (CORE-133)", () => {
  it("three bookings, a reschedule and a cancel all show in the patient's History", async () => {
    const admin = await staff("admin");
    const s = await doctorAndPatient();
    const ids = [await book(admin, s.patientId), await book(admin, s.patientId), await book(admin, s.patientId)];
    await request(app).patch(`/api/v1/appointments/${ids[0]}`).set("Authorization", admin).send({ start_at: futureSlot() });
    await request(app).patch(`/api/v1/appointments/${ids[1]}`).set("Authorization", admin).send({ status: "cancelled" });

    const entries = (await history(admin, `/api/v1/patient/${s.patientId}/history`)).filter((e) => e.entity_type === "Appointment");
    expect(entries.filter((e) => e.action === "create").map((e) => e.entity_id).sort()).toEqual([...ids].sort());
    expect(entries.filter((e) => e.action === "update")).toHaveLength(2);
    expect(entries.find((e) => e.entity_id === ids[1] && e.action === "update")?.entity_after).toMatchObject({ status: "cancelled" });
    // The clinic zone travels with the times, so History shows them as the calendar does.
    expect(entries.find((e) => e.action === "create")?.entity_after).toHaveProperty("timezone");
  });

  it("the same bookings show in the doctor's History", async () => {
    const admin = await staff("admin");
    const s = await doctorAndPatient();
    const ids = [await book(admin, s.patientId), await book(admin, s.patientId), await book(admin, s.patientId)];

    const entries = await history(admin, `/api/v1/practitioner/${s.practitionerId}/history`);
    expect(entries.filter((e) => e.entity_type === "Appointment" && e.action === "create").map((e) => e.entity_id).sort()).toEqual([...ids].sort());
  });

  it("an encounter with the doctor shows in the doctor's History", async () => {
    const admin = await staff("admin");
    const s = await doctorAndPatient();
    const created = await request(app).post("/api/v1/encounter").set("Authorization", admin).send({ start_at: futureSlot(), type: "visit", practitioner_id: s.practitionerId });
    expect(created.status).toBe(201);

    const entries = await history(admin, `/api/v1/practitioner/${s.practitionerId}/history`);
    expect(entries.some((e) => e.entity_type === "Encounter" && e.action === "create" && e.entity_id === created.body.id)).toBe(true);
  });

  it("an appointment email to the patient shows as a notify entry", async () => {
    const admin = await staff("admin");
    const s = await doctorAndPatient();
    const id = await book(admin, s.patientId);
    // What deliverAppointmentPatientEmail writes once Resend accepts the email.
    await withTenant(TENANT_SLUG, (client) =>
      insertAuditLog(client, { user_id: null, action: "notify", entity_type: "Appointment", entity_id: id, entity_after: { patient_id: s.patientId, channel: "email", sent_to: "p***@example.org", kind: "booked" } }),
    );

    const entries = await history(admin, `/api/v1/patient/${s.patientId}/history`);
    expect(entries.find((e) => e.action === "notify")?.entity_after).toMatchObject({ channel: "email", kind: "booked" });
  });

  it("a questionnaire link shows in the patient's History", async () => {
    const admin = await staff("admin");
    const s = await doctorAndPatient();
    const link = await request(app).post(`/api/v1/patient/${s.patientId}/questionnaire-requests`).set("Authorization", admin).send({ kind: "medical_history" });
    expect(link.status).toBe(201);

    const entries = await history(admin, `/api/v1/patient/${s.patientId}/history`);
    expect(entries.some((e) => e.entity_type === "QuestionnaireRequest" && e.action === "create")).toBe(true);
  });

  it("History never shows booking notes, and another patient's bookings stay out", async () => {
    const admin = await staff("admin");
    const a = await doctorAndPatient();
    const b = await doctorAndPatient();
    await book(admin, a.patientId, "Paciente con bruxismo severo");
    const other = await book(admin, b.patientId);

    const entries = await history(admin, `/api/v1/patient/${a.patientId}/history`);
    expect(JSON.stringify(entries)).not.toContain("bruxismo");
    expect(entries.some((e) => e.entity_id === other)).toBe(false);
  });

  it("reads stay out of History", async () => {
    const admin = await staff("admin");
    const s = await doctorAndPatient();
    const id = await book(admin, s.patientId);
    await request(app).get(`/api/v1/appointments/${id}`).set("Authorization", admin);

    const entries = await history(admin, `/api/v1/patient/${s.patientId}/history`);
    expect(entries.map((e) => e.action)).not.toContain("read");
  });
});

/**
 * CORE-160: what the patient does from the appointment email, and the
 * clinical entries, were written to audit_log but reached History empty
 * (every field stripped) and without an author.
 */
describe("History shows the patient's own answers and clinical entries (CORE-160)", () => {
  async function patientLink(appointmentId: string): Promise<string> {
    const token = generateToken();
    await withTenant(TENANT_SLUG, (client) => setAppointmentPatientToken(client, appointmentId, hashToken(token), new Date(Date.UTC(2040, 0, 1)), { clearResponse: false }));
    return token;
  }

  async function audit(row: Parameters<typeof insertAuditLog>[1]): Promise<void> {
    await withTenant(TENANT_SLUG, (client) => insertAuditLog(client, row));
  }

  it("a patient confirming from the email shows who did what", async () => {
    const admin = await staff("admin");
    const s = await doctorAndPatient();
    const id = await book(admin, s.patientId);
    const token = await patientLink(id);
    expect((await request(app).post("/api/v1/public/appointment/respond").send({ token, response: "confirmed" })).status).toBe(200);

    const entry = (await history(admin, `/api/v1/patient/${s.patientId}/history`)).find((e) => e.entity_id === id && e.action === "update");
    expect(entry?.entity_after).toEqual({ patient_response: "confirmed" });
    expect(entry?.actor).toBe("patient");
  });

  it("a patient declining shows too, in the doctor's History as well", async () => {
    const admin = await staff("admin");
    const s = await doctorAndPatient();
    const id = await book(admin, s.patientId);
    const token = await patientLink(id);
    expect((await request(app).post("/api/v1/public/appointment/respond").send({ token, response: "cannot_attend" })).status).toBe(200);

    const doctor = await history(admin, `/api/v1/practitioner/${s.practitionerId}/history`);
    expect(doctor.find((e) => e.entity_id === id && e.action === "update")?.entity_after).toEqual({ patient_response: "cannot_attend" });
  });

  it("stopping appointment emails shows on the patient", async () => {
    const admin = await staff("admin");
    const s = await doctorAndPatient();
    const token = await patientLink(await book(admin, s.patientId));
    expect((await request(app).post("/api/v1/public/appointment/opt-out").send({ token })).status).toBe(200);

    const entry = (await history(admin, `/api/v1/patient/${s.patientId}/history`)).find((e) => e.entity_type === "Patient" && e.actor === "patient");
    expect(entry?.entity_after).toEqual({ appointment_emails: "stopped" });
  });

  it("a staff entry has no patient actor", async () => {
    const admin = await staff("admin");
    const s = await doctorAndPatient();
    const id = await book(admin, s.patientId);
    const entry = (await history(admin, `/api/v1/patient/${s.patientId}/history`)).find((e) => e.entity_id === id);
    expect(entry?.actor).toBeNull();
  });

  it("a primary doctor change names the doctor, never the raw id", async () => {
    const admin = await staff("admin");
    const s = await doctorAndPatient();
    const next = await doctorAndPatient();
    await audit({ action: "update", entity_type: "Patient", entity_id: s.patientId, entity_before: { status: "active", region: "MX", practitioner_id: s.practitionerId }, entity_after: { status: "active", region: "MX", practitioner_id: next.practitionerId } });

    const entry = (await history(admin, `/api/v1/patient/${s.patientId}/history`)).find((e) => e.entity_type === "Patient");
    expect(String(entry?.entity_before?.practitioner)).toContain(s.doctorLastName);
    expect(String(entry?.entity_after?.practitioner)).toContain(next.doctorLastName);
    expect(JSON.stringify(entry)).not.toContain(next.practitionerId);
  });

  it("care team changes name the doctor and how they joined", async () => {
    const admin = await staff("admin");
    const s = await doctorAndPatient();
    await audit({ action: "create", entity_type: "PatientCareTeam", entity_id: crypto.randomUUID(), entity_after: { patient_id: s.patientId, practitioner_id: s.practitionerId, source: "manual", appointment_id: null } });

    const entry = (await history(admin, `/api/v1/patient/${s.patientId}/history`)).find((e) => e.entity_type === "PatientCareTeam");
    expect(entry?.entity_after).toMatchObject({ source: "manual" });
    expect(String(entry?.entity_after?.practitioner)).toContain(s.doctorLastName);
  });

  it("clinical entries say what was signed or uploaded, never the clinical content", async () => {
    const admin = await staff("admin");
    const s = await doctorAndPatient();
    const meta = { actor: "patient" };
    await audit({ action: "create", entity_type: "Consent", entity_id: crypto.randomUUID(), entity_after: { patient_id: s.patientId, purpose: "informedConsent", file_attachment_id: crypto.randomUUID(), source: "patient" }, metadata: meta });
    await audit({ action: "update", entity_type: "StopBangScreening", entity_id: crypto.randomUUID(), entity_after: { patient_id: s.patientId, score: 7 } });
    await audit({ action: "create", entity_type: "FileAttachment", entity_id: crypto.randomUUID(), entity_after: { patient_id: s.patientId, document_type: "study_upload", checklist_item: "psg", title: "PSG night 1" } });

    const entries = await history(admin, `/api/v1/patient/${s.patientId}/history`);
    const consent = entries.find((e) => e.entity_type === "Consent");
    expect(consent?.entity_after).toEqual({ purpose: "informedConsent" });
    expect(consent?.actor).toBe("patient");
    expect(entries.find((e) => e.entity_type === "FileAttachment")?.entity_after).toEqual({ document_type: "study_upload", title: "PSG night 1" });
    expect(entries.find((e) => e.entity_type === "StopBangScreening")?.entity_after).toBeNull();
  });

  it("a comment on a device order reads as a comment, not as a new order", async () => {
    const admin = await staff("admin");
    const s = await doctorAndPatient();
    await audit({ action: "create", entity_type: "PartnerOrder", entity_id: crypto.randomUUID(), entity_after: { action: "add_comment", patient_id: s.patientId } });

    const entry = (await history(admin, `/api/v1/patient/${s.patientId}/history`)).find((e) => e.entity_type === "PartnerOrder");
    expect(entry?.action).toBe("comment");
    expect(entry?.entity_after).toBeNull();
  });
});
