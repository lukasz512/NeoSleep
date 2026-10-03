import type { PoolClient } from "pg";
import {
  withTenant,
  getAppointmentById,
  getAppointmentEmailContext,
  getAppointmentIdByPatientTokenHash,
  getIdentityIdForUser,
  getPractitionerById,
  insertAuditLog,
  isAppointmentEmailOptedOut,
  setAppointmentPatientResponse,
  setAppointmentPatientToken,
  upsertNotificationPreference,
  APPOINTMENT_PATIENT_RESPONSES,
  type Appointment,
  type AppointmentEmailContext,
  type AppointmentPatientResponse,
} from "../db.js";
import { insertPatientEmailSend } from "../db/patientEmailSend.js";
import { AppError, ConflictError, ValidationError } from "../errors.js";
import { sendAppointmentPatientEmail, type AppointmentEmailKind } from "../mailer.js";
import { notify } from "../notifications/notify.js";
import { emailT } from "@neo/email";
import { RESEND_FROM_EMAIL } from "../env.js";
import { generateToken } from "../utils/generateToken.js";
import { hashToken } from "../utils/hashToken.js";
import { maskEmail } from "../utils/maskEmail.js";
import { patientEmailLocale } from "../utils/patientEmailLocale.js";
import { buildAppointmentIcs, googleCalendarLink, outlookCalendarLink } from "../utils/ics.js";

/**
 * CORE-25 / CORE-26 — the patient's side of an appointment (decision form
 * calendar-r1, 2026-10-03):
 *   - every booking, reschedule and cancellation emails the patient: date,
 *     time, clinic, doctor and how to reach the clinic (no medical data),
 *     with an .ics invitation that updates the patient's own calendar;
 *   - sent now, before the consents epic, as an organizational email
 *     (legal basis "contract", recorded in the audit log), with a one-click
 *     stop link that turns off operational emails for that patient;
 *   - "Confirm" / "I can't come" on a personal link; "I can't come" notifies
 *     the doctor and whoever booked. Changing the time stays a phone call or
 *     an email to the clinic — self-service comes later.
 * The email goes out after the appointment's transaction commits; a failed
 * send never undoes a booking.
 */

/** Links keep working 30 days after the visit — long enough for a late "stop emails". */
const LINK_TTL_AFTER_VISIT_MS = 30 * 24 * 3_600_000;
/** SEQUENCE must grow with every update of the same UID; seconds since 2026 does, and fits a 32-bit int for decades. */
const SEQUENCE_EPOCH_MS = Date.UTC(2026, 0, 1);

export class AppointmentLinkInvalidError extends AppError {
  constructor() {
    super("This link is no longer valid", "LINK_INVALID", 410);
  }
}

export class AppointmentNotOpenError extends ConflictError {
  constructor() {
    super("This appointment can no longer be confirmed or declined", "APPOINTMENT_NOT_OPEN");
  }
}

function validTokenShape(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

/** What a command hands its route: the email to send once the transaction has committed. */
export interface AppointmentPatientEmailPlan {
  appointmentId: string;
  kind: AppointmentEmailKind;
  token: string;
  /** users.id of whoever booked / changed it — null for system changes. */
  sentBy: string | null;
}

/** Collects emails a command wants sent after commit (CreateAppointmentCommand / UpdateAppointmentCommand). */
export interface AppointmentEffects {
  patientEmails: AppointmentPatientEmailPlan[];
}

export function newAppointmentEffects(): AppointmentEffects {
  return { patientEmails: [] };
}

/** Inside the appointment's transaction: a fresh link for the email about to go out. A reschedule clears the patient's earlier answer. */
export async function planAppointmentPatientEmail(
  client: PoolClient,
  appointment: Appointment,
  kind: AppointmentEmailKind,
  sentBy: string | null
): Promise<AppointmentPatientEmailPlan> {
  const token = generateToken();
  const expiresAt = new Date(new Date(appointment.end_at).getTime() + LINK_TTL_AFTER_VISIT_MS);
  await setAppointmentPatientToken(client, appointment.id, hashToken(token), expiresAt, { clearResponse: kind === "rescheduled" });
  return { appointmentId: appointment.id, kind, token, sentBy };
}

export type AppointmentEmailOutcome = "sent" | "no_email" | "opted_out" | "not_configured" | "failed";

/** Phone from the clinic; email from the clinic, else the tenant's support address. */
export function appointmentContact(context: AppointmentEmailContext): { phone: string | null; email: string | null } {
  return { phone: context.organization_phone, email: context.organization_email ?? context.tenant_support_email };
}

export function appointmentLinks(frontendOrigin: string, token: string): { confirm: string; cannotAttend: string; optOut: string } {
  // Token in the #fragment: never sent to any server, never in an access log.
  return {
    confirm: `${frontendOrigin}/a?r=confirm#${token}`,
    cannotAttend: `${frontendOrigin}/a?r=cannot#${token}`,
    optOut: `${frontendOrigin}/a?r=stop#${token}`,
  };
}

/** After commit. Never throws: the booking stands whatever happens to the email. */
export async function deliverAppointmentPatientEmail(tenantSlug: string, plan: AppointmentPatientEmailPlan, frontendOrigin: string): Promise<AppointmentEmailOutcome> {
  try {
    const prepared = await withTenant(tenantSlug, async (client) => {
      const appointment = await getAppointmentById(client, plan.appointmentId);
      const context = await getAppointmentEmailContext(client, plan.appointmentId);
      if (!appointment || !context) return { outcome: "failed" as const };
      if (await isAppointmentEmailOptedOut(client, context.patient_identity_id)) return { outcome: "opted_out" as const };
      if (!context.patient_email) {
        if (plan.kind === "booked" && plan.sentBy) {
          const booker = await getIdentityIdForUser(client, plan.sentBy);
          if (booker) await notify(client, { type: "appointment_patient_no_email", recipients: [booker], entityId: appointment.id });
        }
        return { outcome: "no_email" as const };
      }
      return { outcome: "ready" as const, appointment, context, email: context.patient_email };
    });
    if (prepared.outcome !== "ready") return prepared.outcome;

    const { appointment, context, email } = prepared;
    const locale = patientEmailLocale(context.patient_language, context.patient_region);
    const cancelled = plan.kind === "cancelled";
    const contact = appointmentContact(context);
    const links = appointmentLinks(frontendOrigin, plan.token);
    const clinicName = context.organization_name ?? emailT(locale, "email.questionnaireLink.yourClinic");
    const summary = `${emailT(locale, "publicAppointment.title")} · ${clinicName}`;
    const contactLine = [contact.phone, contact.email].filter(Boolean).join(" · ");
    const description = contactLine ? `${emailT(locale, "email.appointment.contactToChange", { clinic: clinicName })} ${contactLine}` : null;
    const location = appointment.location_type === "online" ? appointment.online_url : context.organization_address;
    const calendar = { startAt: appointment.start_at, endAt: appointment.end_at, summary, location, description };

    const providerMessageId = await sendAppointmentPatientEmail(
      email,
      { title: context.patient_salutation, firstName: context.patient_first_name, lastName: context.patient_last_name, language: locale, region: context.patient_region },
      {
        kind: plan.kind,
        startAt: appointment.start_at,
        endAt: appointment.end_at,
        timezone: appointment.timezone,
        clinicName: context.organization_name,
        clinicAddress: context.organization_address,
        clinicMapsUrl: context.organization_maps_url,
        visitInstructions: context.organization_visit_instructions,
        doctorName: context.practitioner_name,
        onlineUrl: appointment.location_type === "online" ? appointment.online_url : null,
        contact,
        links: {
          confirm: cancelled ? null : links.confirm,
          cannotAttend: cancelled ? null : links.cannotAttend,
          optOut: links.optOut,
          google: cancelled ? null : googleCalendarLink(calendar),
          outlook: cancelled ? null : outlookCalendarLink(calendar),
        },
        ics: {
          method: cancelled ? "CANCEL" : "REQUEST",
          content: buildAppointmentIcs({
            ...calendar,
            appointmentId: appointment.id,
            sequence: Math.floor((Date.now() - SEQUENCE_EPOCH_MS) / 1000),
            method: cancelled ? "CANCEL" : "REQUEST",
            organizer: { name: clinicName, email: contact.email ?? RESEND_FROM_EMAIL ?? "no-reply@neosleepcare.com" },
            attendeeEmail: email,
          }),
        },
      },
      { tenant: tenantSlug, kind: "appointment" }
    );
    if (!providerMessageId) return "not_configured";

    await withTenant(tenantSlug, async (client) => {
      await insertPatientEmailSend(client, {
        patientId: appointment.patient_id,
        sentBy: plan.sentBy,
        kind: "appointment",
        appointmentId: appointment.id,
        sentToMasked: maskEmail(email),
        providerMessageId,
      });
      await insertAuditLog(client, {
        user_id: plan.sentBy,
        action: "notify",
        entity_type: "Appointment",
        entity_id: appointment.id,
        entity_after: { patient_id: appointment.patient_id, channel: "email", sent_to: maskEmail(email), kind: plan.kind },
        // Organizational email about a service the patient booked (calendar-r1 D2) — not marketing, no consent needed; the stop link still honours an objection.
        legal_basis: "contract",
        metadata: { purpose: `appointment_${plan.kind}` },
      });
    });
    return "sent";
  } catch (err) {
    console.error(`[appointmentPatient] ${plan.kind} email for appointment ${plan.appointmentId} not sent:`, err);
    return "failed";
  }
}

// ---------------------------------------------------------------------------
// The patient's link (/a in the PWA) — no login, the token is the key
// ---------------------------------------------------------------------------

export interface PublicAppointment {
  status: Appointment["status"];
  /** The visit has started or is over — nothing left to answer. */
  past: boolean;
  start_at: string;
  end_at: string;
  timezone: string;
  clinic_name: string | null;
  clinic_address: string | null;
  doctor_name: string | null;
  online_url: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  patient_response: AppointmentPatientResponse | null;
  opted_out: boolean;
  /** The patient's language, so the page speaks it. */
  locale: string;
}

export interface PublicAppointmentMeta {
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
}

async function appointmentForToken(client: PoolClient, token: string, forUpdate: boolean): Promise<{ appointment: Appointment; context: AppointmentEmailContext }> {
  if (!validTokenShape(token)) throw new AppointmentLinkInvalidError();
  const id = await getAppointmentIdByPatientTokenHash(client, hashToken(token), { forUpdate });
  const appointment = id ? await getAppointmentById(client, id) : null;
  const context = id ? await getAppointmentEmailContext(client, id) : null;
  if (!appointment || !context) throw new AppointmentLinkInvalidError();
  return { appointment, context };
}

function isOpen(appointment: Appointment): boolean {
  return appointment.status === "scheduled" && new Date(appointment.start_at).getTime() > Date.now();
}

async function toPublic(client: PoolClient, appointment: Appointment, context: AppointmentEmailContext): Promise<PublicAppointment> {
  const contact = appointmentContact(context);
  return {
    status: appointment.status,
    past: new Date(appointment.start_at).getTime() <= Date.now(),
    start_at: appointment.start_at,
    end_at: appointment.end_at,
    timezone: appointment.timezone,
    clinic_name: context.organization_name,
    clinic_address: context.organization_address,
    doctor_name: context.practitioner_name,
    online_url: appointment.location_type === "online" ? appointment.online_url : null,
    contact_phone: contact.phone,
    contact_email: contact.email,
    patient_response: appointment.patient_response,
    opted_out: await isAppointmentEmailOptedOut(client, context.patient_identity_id),
    locale: patientEmailLocale(context.patient_language, context.patient_region),
  };
}

export async function GetPublicAppointmentQuery(client: PoolClient, token: string): Promise<PublicAppointment> {
  const { appointment, context } = await appointmentForToken(client, token, false);
  return toPublic(client, appointment, context);
}

export async function RespondPublicAppointmentCommand(client: PoolClient, token: string, response: string, meta: PublicAppointmentMeta): Promise<PublicAppointment> {
  if (!APPOINTMENT_PATIENT_RESPONSES.includes(response as AppointmentPatientResponse)) {
    throw new ValidationError(`response must be one of ${APPOINTMENT_PATIENT_RESPONSES.join(", ")}`, "response");
  }
  const answer = response as AppointmentPatientResponse;
  const { appointment, context } = await appointmentForToken(client, token, true);
  if (!isOpen(appointment)) throw new AppointmentNotOpenError();

  if (appointment.patient_response !== answer) {
    await setAppointmentPatientResponse(client, appointment.id, answer);
    await insertAuditLog(client, {
      user_id: null,
      action: "update",
      entity_type: "Appointment",
      entity_id: appointment.id,
      entity_before: { patient_response: appointment.patient_response },
      entity_after: { patient_response: answer },
      user_ip: meta.ip,
      user_agent: meta.userAgent,
      request_id: meta.requestId,
      metadata: { actor: "patient", via: "appointment_link" },
    });
    if (answer === "cannot_attend") {
      const practitioner = await getPractitionerById(client, appointment.practitioner_id);
      const booker = await getIdentityIdForUser(client, appointment.created_by_user_id);
      await notify(client, {
        type: "appointment_patient_cannot_attend",
        recipients: [practitioner?.identity_id, booker].filter((id): id is string => Boolean(id)),
        entityId: appointment.id,
        meta: { start_at: appointment.start_at, timezone: appointment.timezone, patient_id: appointment.patient_id },
      });
    }
  }
  const after = await getAppointmentById(client, appointment.id);
  return toPublic(client, after ?? appointment, context);
}

/** "Stop appointment emails": operational email off for this patient. Works on any live link, cancelled or past included. */
export async function OptOutPublicAppointmentCommand(client: PoolClient, token: string, meta: PublicAppointmentMeta): Promise<PublicAppointment> {
  const { appointment, context } = await appointmentForToken(client, token, false);
  if (!(await isAppointmentEmailOptedOut(client, context.patient_identity_id))) {
    await upsertNotificationPreference(client, context.patient_identity_id, { category: "operational", channel: "email", enabled: false });
    await insertAuditLog(client, {
      user_id: null,
      action: "update",
      entity_type: "Patient",
      entity_id: appointment.patient_id,
      entity_after: { appointment_emails: "stopped" },
      user_ip: meta.ip,
      user_agent: meta.userAgent,
      request_id: meta.requestId,
      metadata: { actor: "patient", via: "appointment_link", appointment_id: appointment.id },
    });
  }
  return toPublic(client, appointment, context);
}
