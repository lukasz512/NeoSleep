import type { PoolClient } from "pg";
import { DatabaseError } from "../errors.js";
import { formatOptionalDisplayName } from "../utils/personName.js";
import type { AppointmentPatientResponse } from "./appointment.js";

/**
 * CORE-25: the patient's personal link in appointment emails, the data the
 * email needs, and the patient's "no more appointment emails" choice.
 * Only the sha256 of a link token is stored (migration 043).
 */

/**
 * Stores the hash of the token the next email carries; any older link stops working.
 * A reschedule clears the patient's earlier answer and the CORE-116 schedule stamps,
 * so the new time is asked about again; `stamp` records which scheduled steps this
 * email itself covers (set to now()).
 */
export async function setAppointmentPatientToken(
  client: PoolClient,
  appointmentId: string,
  tokenHash: string,
  expiresAt: Date,
  opts: { clearResponse: boolean; stamp?: { confirmRequest?: boolean; dayBefore?: boolean; todayReminder?: boolean } }
): Promise<void> {
  const sets = ["patient_token_hash = $2", "patient_token_expires_at = $3"];
  // CORE-113 part 2: a reschedule clears today_reminder_sent_at too — the new time gets its own 2-hour reminder.
  if (opts.clearResponse) sets.push("patient_response = NULL", "patient_responded_at = NULL", "patient_response_note = NULL", "confirm_request_sent_at = NULL", "day_before_sent_at = NULL", "today_reminder_sent_at = NULL");
  if (opts.stamp?.confirmRequest) sets.push("confirm_request_sent_at = now()");
  if (opts.stamp?.dayBefore) sets.push("day_before_sent_at = now()");
  if (opts.stamp?.todayReminder) sets.push("today_reminder_sent_at = now()");
  try {
    await client.query(`UPDATE appointment SET ${sets.join(", ")} WHERE id = $1`, [appointmentId, tokenHash, expiresAt]);
  } catch (err) {
    throw new DatabaseError("setAppointmentPatientToken", err);
  }
}

/** Records scheduled steps done without an email (already answered / "can't come"). */
export async function stampAppointmentSchedule(client: PoolClient, appointmentId: string, stamp: { confirmRequest?: boolean; dayBefore?: boolean }): Promise<void> {
  const sets = [
    ...(stamp.confirmRequest ? ["confirm_request_sent_at = COALESCE(confirm_request_sent_at, now())"] : []),
    ...(stamp.dayBefore ? ["day_before_sent_at = COALESCE(day_before_sent_at, now())"] : []),
  ];
  if (!sets.length) return;
  try {
    await client.query(`UPDATE appointment SET ${sets.join(", ")} WHERE id = $1`, [appointmentId]);
  } catch (err) {
    throw new DatabaseError("stampAppointmentSchedule", err);
  }
}

export interface AppointmentScheduleRow {
  id: string;
  start_at: string;
  timezone: string;
  status: "scheduled";
  patient_response: AppointmentPatientResponse | null;
  confirm_request_sent_at: string | null;
  day_before_sent_at: string | null;
  /** CORE-113 part 2: when the 2-hour "Su cita es hoy" reminder went out. */
  today_reminder_sent_at: string | null;
}

/**
 * CORE-116 / CORE-113 part 2: visits in the next 3 days with a scheduled step
 * still open — confirm / day-before (CORE-116) or the 2-hour reminder — locked
 * for this transaction (SKIP LOCKED — two overlapping ticks never take the same row).
 */
export async function lockAppointmentsWithOpenSchedule(client: PoolClient, now: Date): Promise<AppointmentScheduleRow[]> {
  try {
    const { rows } = await client.query<Omit<AppointmentScheduleRow, "start_at" | "confirm_request_sent_at" | "day_before_sent_at" | "today_reminder_sent_at"> & {
      start_at: Date;
      confirm_request_sent_at: Date | null;
      day_before_sent_at: Date | null;
      today_reminder_sent_at: Date | null;
    }>(
      `SELECT id, start_at, timezone, status, patient_response, confirm_request_sent_at, day_before_sent_at, today_reminder_sent_at
         FROM appointment
        WHERE status = 'scheduled' AND deleted_at IS NULL
          AND start_at > $1 AND start_at < $1 + interval '3 days'
          AND (confirm_request_sent_at IS NULL OR day_before_sent_at IS NULL OR today_reminder_sent_at IS NULL)
        ORDER BY start_at
        FOR UPDATE SKIP LOCKED`,
      [now]
    );
    return rows.map((r) => ({
      ...r,
      start_at: r.start_at.toISOString(),
      confirm_request_sent_at: r.confirm_request_sent_at?.toISOString() ?? null,
      day_before_sent_at: r.day_before_sent_at?.toISOString() ?? null,
      today_reminder_sent_at: r.today_reminder_sent_at?.toISOString() ?? null,
    }));
  } catch (err) {
    throw new DatabaseError("lockAppointmentsWithOpenSchedule", err);
  }
}

/** The appointment a live link points to, or null (unknown, expired, deleted). */
export async function getAppointmentIdByPatientTokenHash(client: PoolClient, tokenHash: string, opts: { forUpdate?: boolean } = {}): Promise<string | null> {
  try {
    const { rows } = await client.query<{ id: string }>(
      `SELECT id FROM appointment
        WHERE patient_token_hash = $1 AND patient_token_expires_at > now() AND deleted_at IS NULL
        ${opts.forUpdate ? "FOR UPDATE" : ""}`,
      [tokenHash]
    );
    return rows[0]?.id ?? null;
  } catch (err) {
    throw new DatabaseError("getAppointmentIdByPatientTokenHash", err);
  }
}

/** `note`: the day/time the patient suggests with "I can't come" (NEO-254); null for any other answer. */
export async function setAppointmentPatientResponse(client: PoolClient, appointmentId: string, response: AppointmentPatientResponse, note: string | null = null): Promise<void> {
  try {
    await client.query(
      `UPDATE appointment SET patient_response = $2, patient_responded_at = now(), patient_response_note = $3, updated_at = now() WHERE id = $1`,
      [appointmentId, response, note]
    );
  } catch (err) {
    throw new DatabaseError("setAppointmentPatientResponse", err);
  }
}

/** Everything an appointment email shows: no notes, no study, no treatment (ADR-027 §6). */
export interface AppointmentEmailContext {
  patient_identity_id: string;
  patient_email: string | null;
  patient_language: string | null;
  patient_region: string | null;
  patient_salutation: string | null;
  patient_first_name: string | null;
  patient_last_name: string | null;
  practitioner_name: string | null;
  organization_name: string | null;
  organization_phone: string | null;
  organization_email: string | null;
  /** "Av. Reforma 1, 06600 Ciudad de México" — null when the clinic has no address. */
  organization_address: string | null;
  /** The clinic's Google Maps link, if it set one — else directions are searched by address. */
  organization_maps_url: string | null;
  /** The clinic's “what to bring” text (organization.visit_instructions). */
  organization_visit_instructions: string | null;
  /** app_config.support_email — the contact when the clinic has neither phone nor email. */
  tenant_support_email: string | null;
}

export async function getAppointmentEmailContext(client: PoolClient, appointmentId: string): Promise<AppointmentEmailContext | null> {
  try {
    const { rows } = await client.query<Omit<AppointmentEmailContext, "practitioner_name" | "organization_address"> & {
      practitioner_salutation: string | null;
      practitioner_first_name: string | null;
      practitioner_last_name: string | null;
      address_line1: string | null;
      postal_code: string | null;
      city: string | null;
      google_link: string | null;
      visit_instructions: string | null;
    }>(
      `SELECT pi.id AS patient_identity_id, pi.email AS patient_email, pi.language AS patient_language, pi.region AS patient_region,
              pi.title AS patient_salutation, pi.first_name AS patient_first_name, pi.last_name AS patient_last_name,
              di.title AS practitioner_salutation, di.first_name AS practitioner_first_name, di.last_name AS practitioner_last_name,
              o.name AS organization_name, o.phone AS organization_phone, o.email AS organization_email,
              o.address_line1, o.postal_code, o.city, o.google_link, o.visit_instructions,
              (SELECT support_email FROM app_config LIMIT 1) AS tenant_support_email
         FROM appointment a
         JOIN patient p ON a.patient_id = p.id
         JOIN identities pi ON p.identity_id = pi.id
         JOIN practitioner d ON a.practitioner_id = d.id
         JOIN identities di ON d.identity_id = di.id
         LEFT JOIN organization o ON a.organization_id = o.id
        WHERE a.id = $1`,
      [appointmentId]
    );
    const row = rows[0];
    if (!row) return null;
    const cityLine = [row.postal_code, row.city].filter((v) => v?.trim()).join(" ");
    const address = [row.address_line1, cityLine].filter((v) => v?.trim()).join(", ");
    return {
      patient_identity_id: row.patient_identity_id,
      patient_email: row.patient_email,
      patient_language: row.patient_language,
      patient_region: row.patient_region,
      patient_salutation: row.patient_salutation,
      patient_first_name: row.patient_first_name,
      patient_last_name: row.patient_last_name,
      practitioner_name: formatOptionalDisplayName({ salutation: row.practitioner_salutation, first_name: row.practitioner_first_name, last_name: row.practitioner_last_name }),
      organization_name: row.organization_name,
      organization_phone: row.organization_phone?.trim() || null,
      organization_email: row.organization_email?.trim() || null,
      organization_address: address || null,
      organization_maps_url: row.google_link?.trim() || null,
      organization_visit_instructions: row.visit_instructions?.trim() || null,
      tenant_support_email: row.tenant_support_email?.trim() || null,
    };
  } catch (err) {
    throw new DatabaseError("getAppointmentEmailContext", err);
  }
}

/** Appointment emails are "operational / email" in notification_preference (migration 039); the patient's "stop" link turns that off. */
export async function isAppointmentEmailOptedOut(client: PoolClient, identityId: string): Promise<boolean> {
  try {
    const { rows } = await client.query<{ enabled: boolean }>(
      `SELECT enabled FROM notification_preference WHERE identity_id = $1 AND category = 'operational' AND channel = 'email'`,
      [identityId]
    );
    return rows[0]?.enabled === false;
  } catch (err) {
    throw new DatabaseError("isAppointmentEmailOptedOut", err);
  }
}
