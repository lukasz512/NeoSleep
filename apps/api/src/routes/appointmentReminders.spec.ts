import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
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
const { withTenant, withPlatform, insertStaffUser, insertPatient, insertPractitioner, insertOrganization } = await import("../db.js");
const { insertDocumentContentVersion, getCurrentDocumentContentVersion } = await import("../db/documentContent.js");
const { signAuthToken } = await import("../utils/jwt.js");
const { RunAppointmentRemindersForTenant, RunAppointmentRemindersAllTenants } = await import("../commands/appointmentReminders.js");
const { localHourDaysBefore, todayReminderDueAt } = await import("../utils/appointmentSchedule.js");

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

/**
 * Always mid-afternoon clinic (MX) time, so the 2-hour-before mark sits
 * safely inside the 08:00–20:00 window — visitStart()'s broad random hour
 * range can otherwise land the clamp right on the visit's own start (that
 * edge case is covered on its own by appointmentSchedule.spec.ts).
 */
let todaySlot = 0;
function visitStartAfternoon(): string {
  todaySlot += 1;
  return new Date(Date.UTC(2034, 5, 1, 20) + todaySlot * 11 * 86_400_000).toISOString(); // 20:00 UTC = 14:00 Mexico City
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

/**
 * CORE-113 part 2 (decision form consent-visit-r1): on top of the CORE-116
 * schedule, a last "Su cita es hoy" email goes out 2 hours before the visit
 * with the patient's still-unsigned informed consent — same rules as the
 * booking email's consentToSign(): no link to a shared address, no link once
 * signed (the reminder itself still goes out either way). Stamped so a
 * retried tick never sends it twice.
 */
describe("the 2-hour 'today' reminder with the unsigned consent link (CORE-113 part 2)", () => {
  let seeded: { id: string; previousId: string | null } | null = null;
  beforeAll(async () => {
    seeded = await withPlatform(async (client) => {
      const previous = await getCurrentDocumentContentVersion(client, "informedConsent", "mx");
      const version = await insertDocumentContentVersion(client, {
        templateKey: "informedConsent",
        locale: "mx",
        contentHtml: "<p>Autorizo el tratamiento. {legalEntityName}</p>",
        createdByUserId: "00000000-0000-0000-0000-000000000000",
        createdByName: "QA",
        createdByEmail: "qa@neosleepcare.com",
        createdByTenantSlug: TENANT_SLUG,
        changeNote: "seeded by routes/appointmentReminders.spec.ts (CORE-113 part 2)",
      });
      return { id: version.id, previousId: previous?.id ?? null };
    });
  }, 15000);

  afterAll(async () => {
    if (!seeded) return;
    const { id, previousId } = seeded;
    await withPlatform(async (client) => {
      await client.query(`DELETE FROM platform.document_content_version WHERE id = $1`, [id]);
      if (previousId) await client.query(`UPDATE platform.document_content_version SET is_current = true WHERE id = $1`, [previousId]);
    });
  });

  beforeEach(() => {
    sendMock.mockClear();
    process.env.APPOINTMENT_REMINDERS = "on";
  });
  afterEach(() => {
    delete process.env.APPOINTMENT_REMINDERS;
  });

  /** Settles the 2-day ask (confirmed) and the day-before reminder, so only the 2-hour step is left open; returns the moment it becomes due. */
  async function stepToTwoHoursBefore(id: string, start: string): Promise<Date> {
    await RunAppointmentRemindersForTenant(TENANT_SLUG, ORIGIN, localHourDaysBefore(start, MX, 2, 10));
    await respond(id, "confirmed");
    await RunAppointmentRemindersForTenant(TENANT_SLUG, ORIGIN, localHourDaysBefore(start, MX, 1, 10));
    return todayReminderDueAt(start, MX); // the 2-hours-before mark, clamped to 08:00–20:00 clinic time (CORE-113 Done-when)
  }

  it("due within 2 hours, unsigned, own address: a 'today' email with the consent link; a later tick never resends it", async () => {
    const a = await admin();
    const s = await setup();
    const start = visitStartAfternoon();
    const id = await book(a.auth, s, start);
    const dueAt = await stepToTwoHoursBefore(id, start);

    await RunAppointmentRemindersForTenant(TENANT_SLUG, ORIGIN, new Date(dueAt.getTime() - 3_600_000));
    expect(emailsFor(id).map((e) => e.kind)).toEqual(["booked", "ask", "reminder"]); // more than 2h away: nothing yet

    await RunAppointmentRemindersForTenant(TENANT_SLUG, ORIGIN, dueAt);
    const today = emailsFor(id).at(-1);
    expect(today?.kind).toBe("today");
    expect(today?.consent?.link).toMatch(/\/q#[A-Za-z0-9_-]{43}$/);
    expect(today?.links.confirm).toBeNull();
    expect(today?.links.cannotAttend).toBeNull();

    await RunAppointmentRemindersForTenant(TENANT_SLUG, ORIGIN, new Date(dueAt.getTime() + 5 * 60_000));
    expect(emailsFor(id).map((e) => e.kind)).toEqual(["booked", "ask", "reminder", "today"]); // idempotent — no resend
  });

  it("an address shared with another identity: the 'today' email still goes out, without a link", async () => {
    const a = await admin();
    const s = await setup();
    const sharedEmail = `qa-rem-shared-${uniqueSuffix()}@example.org`;
    await withTenant(TENANT_SLUG, (client) =>
      client.query(`UPDATE identities SET email = $2 WHERE id = (SELECT identity_id FROM patient WHERE id = $1)`, [s.patientId, sharedEmail])
    );
    await withTenant(TENANT_SLUG, async (client) => {
      const otherDoc = await insertPractitioner(client, { first_name: "Ana", last_name: `Doc2-${uniqueSuffix()}`, email: `qa-rem-doc2-${uniqueSuffix()}@neosleepcare.com` });
      await insertPatient(client, { first_name: "Otro", last_name: `Pac2-${uniqueSuffix()}`, practitioner_id: otherDoc.id, email: sharedEmail, region: "MX" });
    });
    const start = visitStartAfternoon();
    const id = await book(a.auth, s, start);
    const dueAt = await stepToTwoHoursBefore(id, start);

    await RunAppointmentRemindersForTenant(TENANT_SLUG, ORIGIN, dueAt);
    const today = emailsFor(id).at(-1);
    expect(today?.kind).toBe("today");
    expect(today?.consent).toEqual({ link: null });
  });

  it("an already-signed consent: the 'today' reminder still goes out, without a link", async () => {
    const a = await admin();
    const s = await setup();
    await withTenant(TENANT_SLUG, (client) =>
      client.query(
        `INSERT INTO consent (entity_type, entity_id, legal_basis, jurisdiction, purpose, granted_at, metadata)
         VALUES ('patient', $1, 'consent', 'MX', 'informedConsent', now(), jsonb_build_object('content_version_id', $2::text))`,
        [s.patientId, seeded!.id]
      )
    );
    const start = visitStartAfternoon();
    const id = await book(a.auth, s, start);
    const dueAt = await stepToTwoHoursBefore(id, start);

    await RunAppointmentRemindersForTenant(TENANT_SLUG, ORIGIN, dueAt);
    const today = emailsFor(id).at(-1);
    expect(today?.kind).toBe("today");
    expect(today?.consent).toBeNull();
  });

  it("a cancelled appointment: nothing is sent at the 2-hour mark", async () => {
    const a = await admin();
    const s = await setup();
    const start = visitStartAfternoon();
    const id = await book(a.auth, s, start);
    const dueAt = await stepToTwoHoursBefore(id, start);
    await request(app).patch(`/api/v1/appointments/${id}`).set("Authorization", a.auth).send({ status: "cancelled" });
    sendMock.mockClear();

    await RunAppointmentRemindersForTenant(TENANT_SLUG, ORIGIN, dueAt);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("the flag off: the scheduled job (all tenants) does nothing", async () => {
    delete process.env.APPOINTMENT_REMINDERS;
    const result = await RunAppointmentRemindersAllTenants(new Date());
    expect(result).toEqual({ enabled: false, tenants: {}, tenantsFailed: 0 });
    expect(sendMock).not.toHaveBeenCalled();
  });
});
