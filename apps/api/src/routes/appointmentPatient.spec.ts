import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import type { AppointmentEmail } from "../mailer.js";

/**
 * CORE-25 / CORE-26 (decision form calendar-r1, 2026-10-03): the patient is
 * emailed on book / reschedule / cancel, with an .ics, "Confirm" / "I can't
 * come" and a stop link — through the real Express stack and real Postgres.
 * Only the email provider boundary is stubbed.
 */
const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn(async (..._args: unknown[]): Promise<string | null> => `re_test_${Math.random().toString(36).slice(2)}`),
}));
vi.mock("../mailer.js", async (importActual) => ({
  ...(await importActual<typeof import("../mailer.js")>()),
  sendAppointmentPatientEmail: sendMock,
}));

const { app } = await import("../server.js");
const { withTenant, insertStaffUser, insertPatient, insertPractitioner, insertOrganization } = await import("../db.js");
const { signAuthToken } = await import("../utils/jwt.js");

const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

let slotCounter = 0;
function futureSlot(): string {
  slotCounter += 3;
  return new Date(Date.UTC(2032, 0, 1, 8) + slotCounter * 3_600_000 + Math.floor(Math.random() * 1_000) * 86_400_000).toISOString();
}

async function admin(): Promise<{ id: string; auth: string }> {
  return withTenant(TENANT_SLUG, async (client) => {
    const email = `qa-appt-patient-admin-${uniqueSuffix()}@neosleepcare.com`;
    const user = await insertStaffUser(client, email, "QA", "Admin", "admin", await bcrypt.hash("x", 4), false);
    return { id: user!.id, auth: `Bearer ${signAuthToken({ id: user!.id, email, role: "admin", token_version: 0 })}` };
  });
}

async function setup(opts: { patientEmail?: string | null; clinic?: { phone?: string; email?: string; visitInstructions?: string } } = {}): Promise<{ practitionerId: string; practitionerIdentityId: string; patientId: string; patientIdentityId: string; organizationId: string | null }> {
  return withTenant(TENANT_SLUG, async (client) => {
    const practitioner = await insertPractitioner(client, { first_name: "Ana", last_name: `Doc-${uniqueSuffix()}`, email: `qa-appt-doc-${uniqueSuffix()}@neosleepcare.com` });
    const org = opts.clinic
      ? await insertOrganization(client, { name: `Clínica QA ${uniqueSuffix()}`, address_line1: "Av. Reforma 1", city: "CDMX", postal_code: "06600", country_code: "MX", phone: opts.clinic.phone ?? null, email: opts.clinic.email ?? null, visit_instructions: opts.clinic.visitInstructions ?? null })
      : null;
    const patient = await insertPatient(client, {
      first_name: "Pac",
      last_name: `Iente-${uniqueSuffix()}`,
      practitioner_id: practitioner.id,
      email: opts.patientEmail === undefined ? `qa-appt-patient-${uniqueSuffix()}@example.org` : (opts.patientEmail ?? undefined),
      region: "MX",
    });
    const ids = await client.query<{ p: string; d: string }>(
      `SELECT (SELECT identity_id FROM patient WHERE id = $1) AS p, (SELECT identity_id FROM practitioner WHERE id = $2) AS d`,
      [patient.id, practitioner.id]
    );
    return { practitionerId: practitioner.id, practitionerIdentityId: ids.rows[0]!.d, patientId: patient.id, patientIdentityId: ids.rows[0]!.p, organizationId: org?.id ?? null };
  });
}

function lastEmail(): { to: string; appointment: AppointmentEmail } {
  const call = sendMock.mock.calls.at(-1);
  if (!call) throw new Error("no appointment email was sent");
  return { to: call[0] as string, appointment: call[2] as AppointmentEmail };
}

function tokenFrom(link: string | null): string {
  const token = link?.split("#")[1];
  if (!token) throw new Error(`no token in ${link}`);
  return token;
}

async function book(auth: string, body: Record<string, unknown>): Promise<request.Response> {
  return request(app).post("/api/v1/appointments").set("Authorization", auth).send(body);
}

describe("appointment emails to the patient (CORE-25)", () => {
  beforeEach(() => sendMock.mockClear());

  it("booking emails the patient: clinic contact, buttons, stop link and an .ics invitation; the send is logged with legal basis 'contract'", async () => {
    const a = await admin();
    const s = await setup({ clinic: { phone: "+52 55 1234 5678", email: "hola@clinica.mx" } });
    const res = await book(a.auth, { patient_id: s.patientId, organization_id: s.organizationId, start_at: futureSlot(), notes: "Ajuste de dispositivo" });
    expect(res.status).toBe(201);

    const { appointment } = lastEmail();
    expect(appointment.kind).toBe("booked");
    expect(appointment.contact).toEqual({ phone: "+52 55 1234 5678", email: "hola@clinica.mx" });
    expect(appointment.clinicAddress).toBe("Av. Reforma 1, 06600 CDMX");
    expect(appointment.links.confirm).toMatch(/\/a\?r=confirm#[A-Za-z0-9_-]{43}$/);
    expect(appointment.links.cannotAttend).toMatch(/\/a\?r=cannot#/);
    expect(appointment.links.optOut).toMatch(/\/a\?r=stop#/);
    expect(appointment.ics.method).toBe("REQUEST");
    expect(appointment.ics.content).toContain(`UID:appointment-${res.body.id}@neosleepcare.com`);
    expect(JSON.stringify(appointment)).not.toContain("Ajuste de dispositivo");

    await withTenant(TENANT_SLUG, async (client) => {
      const sends = await client.query(`SELECT kind, appointment_id FROM patient_email_send WHERE patient_id = $1`, [s.patientId]);
      expect(sends.rows).toEqual([{ kind: "appointment", appointment_id: res.body.id }]);
      const audit = await client.query(`SELECT legal_basis FROM audit_log WHERE entity_id = $1 AND action = 'notify'`, [res.body.id]);
      expect(audit.rows).toEqual([{ legal_basis: "contract" }]);
      // Written after the commit, still tied to the booking request (audit ref 27de033d had none).
      const traced = await client.query(`SELECT request_id FROM audit_log WHERE entity_id = $1 AND action = 'notify'`, [res.body.id]);
      expect(traced.rows[0]?.request_id).toBe(res.headers["x-request-id"]);
    });
  });

  it("the clinic's own 'what to bring' text reaches the email; a clinic without one sends none", async () => {
    const a = await admin();
    const withText = await setup({ clinic: { phone: "+52 55 1111 2222", visitInstructions: "Llegue 10 minutos antes." } });
    await book(a.auth, { patient_id: withText.patientId, organization_id: withText.organizationId, start_at: futureSlot() });
    expect(lastEmail().appointment.visitInstructions).toBe("Llegue 10 minutos antes.");

    const withoutText = await setup({ clinic: { phone: "+52 55 1111 3333" } });
    await book(a.auth, { patient_id: withoutText.patientId, organization_id: withoutText.organizationId, start_at: futureSlot() });
    expect(lastEmail().appointment.visitInstructions).toBeNull();
  });

  it("without a clinic phone/email the contact falls back to the tenant's support address", async () => {
    const a = await admin();
    const s = await setup();
    const support = await withTenant(TENANT_SLUG, async (client) => (await client.query<{ e: string | null }>(`SELECT support_email AS e FROM app_config LIMIT 1`)).rows[0]?.e ?? null);
    expect((await book(a.auth, { patient_id: s.patientId, start_at: futureSlot() })).status).toBe(201);
    expect(lastEmail().appointment.contact).toEqual({ phone: null, email: support });
  });

  it("a patient without email: the booking succeeds, nothing is sent, whoever booked gets an in-app notice", async () => {
    const a = await admin();
    const s = await setup({ patientEmail: null });
    const res = await book(a.auth, { patient_id: s.patientId, start_at: futureSlot() });
    expect(res.status).toBe(201);
    expect(sendMock).not.toHaveBeenCalled();
    const rows = await withTenant(TENANT_SLUG, (client) =>
      client.query(`SELECT n.type FROM notification n JOIN users u ON u.identity_id = n.identity_id WHERE u.id = $1 AND n.entity_id = $2`, [a.id, res.body.id])
    );
    expect(rows.rows.map((r) => r.type)).toEqual(["appointment_patient_no_email"]);
  });

  it("a failing email never undoes the booking", async () => {
    const a = await admin();
    const s = await setup();
    sendMock.mockRejectedValueOnce(new Error("Resend down"));
    const res = await book(a.auth, { patient_id: s.patientId, start_at: futureSlot() });
    expect(res.status).toBe(201);
    const row = await withTenant(TENANT_SLUG, (client) => client.query(`SELECT status FROM appointment WHERE id = $1`, [res.body.id]));
    expect(row.rows[0]?.status).toBe("scheduled");
  });

  it("reschedule sends a new email with a new link (the old one stops working) and clears the patient's earlier answer", async () => {
    const a = await admin();
    const s = await setup();
    const created = await book(a.auth, { patient_id: s.patientId, start_at: futureSlot() });
    const firstToken = tokenFrom(lastEmail().appointment.links.confirm);
    expect((await request(app).post("/api/v1/public/appointment/respond").send({ token: firstToken, response: "confirmed" })).status).toBe(200);

    const moved = await request(app).patch(`/api/v1/appointments/${created.body.id}`).set("Authorization", a.auth).send({ start_at: futureSlot() });
    expect(moved.status).toBe(200);
    expect(moved.body.patient_response).toBeNull();
    const { appointment } = lastEmail();
    expect(appointment.kind).toBe("rescheduled");
    expect(tokenFrom(appointment.links.confirm)).not.toBe(firstToken);
    expect((await request(app).post("/api/v1/public/appointment/lookup").send({ token: firstToken })).status).toBe(410);
  });

  it("cancel sends a cancellation with METHOD:CANCEL and no buttons; the link can no longer confirm but can still stop emails", async () => {
    const a = await admin();
    const s = await setup();
    const created = await book(a.auth, { patient_id: s.patientId, start_at: futureSlot() });
    await request(app).patch(`/api/v1/appointments/${created.body.id}`).set("Authorization", a.auth).send({ status: "cancelled" });
    const { appointment } = lastEmail();
    expect(appointment.kind).toBe("cancelled");
    expect(appointment.ics.method).toBe("CANCEL");
    expect(appointment.links.confirm).toBeNull();
    expect(appointment.links.cannotAttend).toBeNull();

    const token = tokenFrom(appointment.links.optOut);
    const lookup = await request(app).post("/api/v1/public/appointment/lookup").send({ token });
    expect(lookup.body.status).toBe("cancelled");
    expect((await request(app).post("/api/v1/public/appointment/respond").send({ token, response: "confirmed" })).status).toBe(409);
    expect((await request(app).post("/api/v1/public/appointment/opt-out").send({ token })).status).toBe(200);
  });
});

describe("clinic 'what to bring' text (organization.visit_instructions)", () => {
  it("is saved and returned trimmed through the organization API; over 500 characters is a 400 on that field; empty clears it", async () => {
    const a = await admin();
    const created = await request(app).post("/api/v1/organization").set("Authorization", a.auth)
      .send({ name: `Clínica Instrucciones ${uniqueSuffix()}`, country_code: "MX", email: `qa-clinic-${uniqueSuffix()}@example.org`, phone: "+52 55 1234 5678", visit_instructions: "  Traiga una identificación.  " });
    expect(created.status).toBe(201);
    expect(created.body.visit_instructions).toBe("Traiga una identificación.");

    const tooLong = await request(app).patch(`/api/v1/organization/${created.body.id}`).set("Authorization", a.auth).send({ visit_instructions: "x".repeat(501) });
    expect(tooLong.status).toBe(400);
    expect(JSON.stringify(tooLong.body)).toContain("visit_instructions");

    const cleared = await request(app).patch(`/api/v1/organization/${created.body.id}`).set("Authorization", a.auth).send({ visit_instructions: "" });
    expect(cleared.status).toBe(200);
    expect(cleared.body.visit_instructions ?? "").toBe(""); // PATCH returns the row (null), GET the DTO ("")
  });
});

describe("the patient's appointment page /a (CORE-25)", () => {
  beforeEach(() => sendMock.mockClear());

  it("lookup shows when, where, who and how to reach the clinic — never notes", async () => {
    const a = await admin();
    const s = await setup({ clinic: { phone: "+52 55 0000 0000" } });
    await book(a.auth, { patient_id: s.patientId, organization_id: s.organizationId, start_at: futureSlot(), notes: "Nota clínica privada" });
    const res = await request(app).post("/api/v1/public/appointment/lookup").send({ token: tokenFrom(lastEmail().appointment.links.confirm) });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "scheduled", past: false, contact_phone: "+52 55 0000 0000", patient_response: null, opted_out: false, locale: "mx" });
    expect(res.body.doctor_name).toContain("Ana");
    expect(JSON.stringify(res.body)).not.toContain("Nota clínica privada");
  });

  it("an unknown or malformed token is 410 LINK_INVALID", async () => {
    for (const token of ["short", "A".repeat(43)]) {
      const res = await request(app).post("/api/v1/public/appointment/lookup").send({ token });
      expect(res.status).toBe(410);
      expect(res.body.code).toBe("LINK_INVALID");
    }
  });

  it("'Confirm' marks the appointment confirmed for the staff calendar", async () => {
    const a = await admin();
    const s = await setup();
    const created = await book(a.auth, { patient_id: s.patientId, start_at: futureSlot() });
    const res = await request(app).post("/api/v1/public/appointment/respond").send({ token: tokenFrom(lastEmail().appointment.links.confirm), response: "confirmed" });
    expect(res.status).toBe(200);
    expect(res.body.patient_response).toBe("confirmed");
    const staffView = await request(app).get(`/api/v1/appointments/${created.body.id}`).set("Authorization", a.auth);
    expect(staffView.body.patient_response).toBe("confirmed");
    expect(staffView.body.patient_responded_at).toBeTruthy();
  });

  it("'I can't come' notifies the doctor and whoever booked", async () => {
    const a = await admin();
    const s = await setup();
    const created = await book(a.auth, { patient_id: s.patientId, start_at: futureSlot() });
    await request(app).post("/api/v1/public/appointment/respond").send({ token: tokenFrom(lastEmail().appointment.links.cannotAttend), response: "cannot_attend" });
    const rows = await withTenant(TENANT_SLUG, (client) =>
      client.query<{ identity_id: string }>(`SELECT identity_id FROM notification WHERE entity_id = $1 AND type = 'appointment_patient_cannot_attend'`, [created.body.id])
    );
    const bookerIdentity = await withTenant(TENANT_SLUG, async (client) => (await client.query<{ i: string }>(`SELECT identity_id AS i FROM users WHERE id = $1`, [a.id])).rows[0]!.i);
    expect(rows.rows.map((r) => r.identity_id).sort()).toEqual([s.practitionerIdentityId, bookerIdentity].sort());
  });

  it("rejects an unknown answer", async () => {
    const a = await admin();
    const s = await setup();
    await book(a.auth, { patient_id: s.patientId, start_at: futureSlot() });
    const res = await request(app).post("/api/v1/public/appointment/respond").send({ token: tokenFrom(lastEmail().appointment.links.confirm), response: "maybe" });
    expect(res.status).toBe(400);
  });

  it("'Stop emails' is honoured: the next booking for that patient sends nothing", async () => {
    const a = await admin();
    const s = await setup();
    await book(a.auth, { patient_id: s.patientId, start_at: futureSlot() });
    const stop = await request(app).post("/api/v1/public/appointment/opt-out").send({ token: tokenFrom(lastEmail().appointment.links.optOut) });
    expect(stop.status).toBe(200);
    expect(stop.body.opted_out).toBe(true);

    sendMock.mockClear();
    expect((await book(a.auth, { patient_id: s.patientId, start_at: futureSlot() })).status).toBe(201);
    expect(sendMock).not.toHaveBeenCalled();
    const audit = await withTenant(TENANT_SLUG, (client) => client.query(`SELECT 1 FROM audit_log WHERE entity_type = 'Patient' AND entity_id = $1 AND entity_after->>'appointment_emails' = 'stopped'`, [s.patientId]));
    expect(audit.rowCount).toBe(1);
  });
});
