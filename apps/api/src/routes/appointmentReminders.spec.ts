import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import type { AppointmentEmail } from "../mailer.js";

/**
 * CORE-116 (decision form confirm-flow-r1, 2026-10-04): the scheduled patient
 * emails, against real Postgres — only the email provider is stubbed.
 *   P1: "please confirm" 2 days before at 10:00 clinic time; the day before a
 *       reminder if confirmed, else asked again + the clinic notified.
 *   P2: the booking email asks right away only inside that 2-day window.
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
const { RunAppointmentRemindersForTenant } = await import("../commands/appointmentReminders.js");
const { localHourDaysBefore } = await import("../utils/appointmentSchedule.js");

const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";
const ORIGIN = "https://pwa.example.test";
const MX = "America/Mexico_City";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** A visit far in the future so it never collides; each test picks its own hour. */
let slot = 0;
function visitStart(): string {
  slot += 1;
  return new Date(Date.UTC(2033, 2, 1, 15) + slot * 7 * 86_400_000 + Math.floor(Math.random() * 500) * 3_600_000).toISOString();
}

async function admin(): Promise<{ id: string; auth: string }> {
  return withTenant(TENANT_SLUG, async (client) => {
    const email = `qa-appt-rem-admin-${uniqueSuffix()}@neosleepcare.com`;
    const user = await insertStaffUser(client, email, "QA", "Admin", "admin", await bcrypt.hash("x", 4), false);
    return { id: user!.id, auth: `Bearer ${signAuthToken({ id: user!.id, email, role: "admin", token_version: 0 })}` };
  });
}

async function setup(): Promise<{ patientId: string; organizationId: string; practitionerIdentityId: string }> {
  return withTenant(TENANT_SLUG, async (client) => {
    const practitioner = await insertPractitioner(client, { first_name: "Ana", last_name: `Doc-${uniqueSuffix()}`, email: `qa-rem-doc-${uniqueSuffix()}@neosleepcare.com` });
    const org = await insertOrganization(client, { name: `Clínica QA ${uniqueSuffix()}`, address_line1: "Av. Reforma 1", city: "CDMX", postal_code: "06600", country_code: "MX", phone: "+52 55 0000 1111" });
    const patient = await insertPatient(client, { first_name: "Pac", last_name: `Rem-${uniqueSuffix()}`, practitioner_id: practitioner.id, email: `qa-rem-patient-${uniqueSuffix()}@example.org`, region: "MX" });
    const d = await client.query<{ id: string }>(`SELECT identity_id AS id FROM practitioner WHERE id = $1`, [practitioner.id]);
    return { patientId: patient.id, organizationId: org.id, practitionerIdentityId: d.rows[0]!.id };
  });
}

function emailsFor(appointmentId: string): AppointmentEmail[] {
  return sendMock.mock.calls
    .map((c) => c[2] as AppointmentEmail)
    .filter((e) => e.ics.content.includes(`UID:appointment-${appointmentId}@`));
}

async function book(auth: string, s: { patientId: string; organizationId: string }, startAt: string): Promise<string> {
  const res = await request(app).post("/api/v1/appointments").set("Authorization", auth).send({ patient_id: s.patientId, organization_id: s.organizationId, start_at: startAt });
  expect(res.status).toBe(201);
  expect(res.body.timezone).toBe(MX);
  return res.body.id as string;
}

async function respond(appointmentId: string, response: "confirmed" | "cannot_attend"): Promise<void> {
  await withTenant(TENANT_SLUG, (client) =>
    client.query(`UPDATE appointment SET patient_response = $2, patient_responded_at = now() WHERE id = $1`, [appointmentId, response])
  );
}

describe("scheduled appointment emails (CORE-116)", () => {
  beforeEach(() => {
    sendMock.mockClear();
    process.env.APPOINTMENT_REMINDERS = "on";
  });
  afterEach(() => {
    delete process.env.APPOINTMENT_REMINDERS;
  });

  it("P2: a booking weeks ahead has no buttons and says we'll ask 2 days before", async () => {
    const a = await admin();
    const s = await setup();
    const id = await book(a.auth, s, visitStart());
    const [booking] = emailsFor(id);
    expect(booking?.kind).toBe("booked");
    expect(booking?.links.confirm).toBeNull();
    expect(booking?.links.cannotAttend).toBeNull();
    expect(booking?.confirmLater).toBe(true);
  });

  it("P1: asks 2 days before at 10:00 clinic time, once; nothing before that", async () => {
    const a = await admin();
    const s = await setup();
    const start = visitStart();
    const id = await book(a.auth, s, start);
    const askAt = localHourDaysBefore(start, MX, 2, 10);

    await RunAppointmentRemindersForTenant(TENANT_SLUG, ORIGIN, new Date(askAt.getTime() - 60_000));
    expect(emailsFor(id).map((e) => e.kind)).toEqual(["booked"]);

    await RunAppointmentRemindersForTenant(TENANT_SLUG, ORIGIN, askAt);
    const ask = emailsFor(id).at(-1);
    expect(ask?.kind).toBe("ask");
    expect(ask?.links.confirm).toMatch(/\/a\?r=confirm#[A-Za-z0-9_-]{43}$/);
    expect(ask?.confirmLater).toBe(false);

    await RunAppointmentRemindersForTenant(TENANT_SLUG, ORIGIN, new Date(askAt.getTime() + 5 * 60_000));
    expect(emailsFor(id).map((e) => e.kind)).toEqual(["booked", "ask"]);
  });

  it("P1: confirmed → plain reminder the day before (no buttons), the clinic is not bothered", async () => {
    const a = await admin();
    const s = await setup();
    const start = visitStart();
    const id = await book(a.auth, s, start);
    await RunAppointmentRemindersForTenant(TENANT_SLUG, ORIGIN, localHourDaysBefore(start, MX, 2, 10));
    await respond(id, "confirmed");

    await RunAppointmentRemindersForTenant(TENANT_SLUG, ORIGIN, localHourDaysBefore(start, MX, 1, 10));
    const reminder = emailsFor(id).at(-1);
    expect(reminder?.kind).toBe("reminder");
    expect(reminder?.links.confirm).toBeNull();

    await withTenant(TENANT_SLUG, async (client) => {
      const n = await client.query(`SELECT 1 FROM notification WHERE entity_id = $1 AND type = 'appointment_patient_unconfirmed'`, [id]);
      expect(n.rowCount).toBe(0);
    });
  });

  it("P1 more: no answer by the day before → asked again and the doctor gets 'hasn't confirmed'", async () => {
    const a = await admin();
    const s = await setup();
    const start = visitStart();
    const id = await book(a.auth, s, start);
    await RunAppointmentRemindersForTenant(TENANT_SLUG, ORIGIN, localHourDaysBefore(start, MX, 2, 10));

    await RunAppointmentRemindersForTenant(TENANT_SLUG, ORIGIN, localHourDaysBefore(start, MX, 1, 10));
    expect(emailsFor(id).map((e) => e.kind)).toEqual(["booked", "ask", "ask"]);

    await withTenant(TENANT_SLUG, async (client) => {
      const n = await client.query<{ identity_id: string }>(
        `SELECT identity_id FROM notification WHERE entity_id = $1 AND type = 'appointment_patient_unconfirmed'`,
        [id]
      );
      expect(n.rows.map((r) => r.identity_id)).toContain(s.practitionerIdentityId);
    });
  });

  it("'can't come' → nothing the day before", async () => {
    const a = await admin();
    const s = await setup();
    const start = visitStart();
    const id = await book(a.auth, s, start);
    await RunAppointmentRemindersForTenant(TENANT_SLUG, ORIGIN, localHourDaysBefore(start, MX, 2, 10));
    await respond(id, "cannot_attend");
    await RunAppointmentRemindersForTenant(TENANT_SLUG, ORIGIN, localHourDaysBefore(start, MX, 1, 10));
    expect(emailsFor(id).map((e) => e.kind)).toEqual(["booked", "ask"]);
  });

  it("a reschedule clears the stamps: the new time is asked about again", async () => {
    const a = await admin();
    const s = await setup();
    const start = visitStart();
    const id = await book(a.auth, s, start);
    await RunAppointmentRemindersForTenant(TENANT_SLUG, ORIGIN, localHourDaysBefore(start, MX, 2, 10));

    const moved = new Date(new Date(start).getTime() + 14 * 86_400_000).toISOString();
    const res = await request(app).patch(`/api/v1/appointments/${id}`).set("Authorization", a.auth).send({ start_at: moved });
    expect(res.status).toBe(200);
    expect(emailsFor(id).at(-1)?.kind).toBe("rescheduled");

    await RunAppointmentRemindersForTenant(TENANT_SLUG, ORIGIN, localHourDaysBefore(moved, MX, 2, 10));
    expect(emailsFor(id).at(-1)?.kind).toBe("ask");
  });

  it("the job endpoint needs the internal job secret", async () => {
    const res = await request(app).post("/api/v1/appointments/jobs/reminders").send({});
    expect(res.status).toBe(401);
  });

  it("off (APPOINTMENT_REMINDERS unset): the booking email asks right away, as before", async () => {
    delete process.env.APPOINTMENT_REMINDERS;
    const a = await admin();
    const s = await setup();
    const id = await book(a.auth, s, visitStart());
    const [booking] = emailsFor(id);
    expect(booking?.links.confirm).toMatch(/\/a\?r=confirm#/);
    expect(booking?.confirmLater).toBe(false);
  });
});
