import { withTenant, getActiveTenantSlugs, tenantSlugFromHost, getAppointmentById, getIdentityIdForUser, getPractitionerById, lockAppointmentsWithOpenSchedule, stampAppointmentSchedule } from "../db.js";
import { FRONTEND_URLS } from "../env.js";
import { notify } from "../notifications/notify.js";
import { appointmentRemindersEnabled, scheduledAppointmentAction, todayReminderDue } from "../utils/appointmentSchedule.js";
import { deliverAppointmentPatientEmail, planAppointmentPatientEmail, type AppointmentEmailOutcome, type AppointmentPatientEmailPlan } from "./appointmentPatient.js";

/**
 * CORE-116 (decision form confirm-flow-r1): the scheduled side of the patient
 * flow, run every few minutes by .github/workflows/appointment-reminders.yml:
 *   - 2 days before at 10:00 clinic time → "please confirm";
 *   - the day before at 10:00 → reminder if confirmed, else asked again and
 *     the doctor + whoever booked get "patient hasn't confirmed".
 * CORE-113 part 2 adds an independent third step on the same tick: 2 hours
 * before the visit, a "Su cita es hoy" reminder carrying the still-unsigned
 * informed consent link (own stamp column, so a visit booked too late for
 * the two steps above — both already settled at booking time — still gets
 * it), clamped to the clinic's 08:00–20:00 local window (never sent outside
 * it — see utils/appointmentSchedule.ts's todayReminderDueAt()).
 * Each step is stamped in the same transaction that picks the row, before the
 * email goes out after commit, so a retried or overlapping tick never sends
 * twice (at-most-once: a crash between commit and send loses that one email,
 * the clinic still sees "sin confirmar" in Citas).
 */

export interface AppointmentRemindersTenantResult {
  confirmRequests: number;
  reminders: number;
  secondAsks: number;
  todayReminders: number;
  outcomes: Partial<Record<AppointmentEmailOutcome, number>>;
}

export interface AppointmentRemindersResult {
  enabled: boolean;
  tenants: Record<string, AppointmentRemindersTenantResult | { error: string }>;
  tenantsFailed: number;
}

export async function RunAppointmentRemindersForTenant(slug: string, frontendOrigin: string, now: Date = new Date()): Promise<AppointmentRemindersTenantResult> {
  const result: AppointmentRemindersTenantResult = { confirmRequests: 0, reminders: 0, secondAsks: 0, todayReminders: 0, outcomes: {} };
  const plans = await withTenant(slug, async (client) => {
    const due: AppointmentPatientEmailPlan[] = [];
    for (const row of await lockAppointmentsWithOpenSchedule(client, now)) {
      const action = scheduledAppointmentAction(row, now);
      let appointment = null;
      if (action === "stamp_confirm_request") {
        await stampAppointmentSchedule(client, row.id, { confirmRequest: true });
      } else if (action === "stamp_day_before") {
        await stampAppointmentSchedule(client, row.id, { confirmRequest: true, dayBefore: true });
      } else if (action) {
        appointment = await getAppointmentById(client, row.id);
        if (appointment) {
          if (action === "confirm_request") {
            due.push(await planAppointmentPatientEmail(client, appointment, "ask", null, { stamp: { confirmRequest: true } }, now));
            result.confirmRequests += 1;
          } else if (action === "reminder") {
            due.push(await planAppointmentPatientEmail(client, appointment, "reminder", null, { stamp: { confirmRequest: true, dayBefore: true } }, now));
            result.reminders += 1;
          } else {
            due.push(await planAppointmentPatientEmail(client, appointment, "ask", null, { stamp: { confirmRequest: true, dayBefore: true } }, now));
            result.secondAsks += 1;
            const practitioner = await getPractitionerById(client, appointment.practitioner_id);
            const booker = await getIdentityIdForUser(client, appointment.created_by_user_id);
            await notify(client, {
              type: "appointment_patient_unconfirmed",
              recipients: [...new Set([practitioner?.identity_id, booker].filter((id): id is string => Boolean(id)))],
              entityId: appointment.id,
              meta: { start_at: appointment.start_at, timezone: appointment.timezone, patient_id: appointment.patient_id },
            });
          }
        }
      }
      // CORE-113 part 2 — independent of the switch above: a visit less than
      // 2 hours out still gets its day-of reminder even when confirm_request
      // and day_before are both already stamped (e.g. a very late booking).
      if (todayReminderDue(row, now)) {
        appointment ??= await getAppointmentById(client, row.id);
        if (appointment) {
          due.push(await planAppointmentPatientEmail(client, appointment, "today", null, { stamp: { todayReminder: true } }, now));
          result.todayReminders += 1;
        }
      }
    }
    return due;
  });

  for (const plan of plans) {
    const outcome = await deliverAppointmentPatientEmail(slug, plan, frontendOrigin);
    result.outcomes[outcome] = (result.outcomes[outcome] ?? 0) + 1;
  }
  return result;
}

/** Every active tenant; one tenant's failure doesn't stop the others. Off (APPOINTMENT_REMINDERS unset) → does nothing. */
export async function RunAppointmentRemindersAllTenants(now: Date = new Date()): Promise<AppointmentRemindersResult> {
  if (!appointmentRemindersEnabled()) return { enabled: false, tenants: {}, tenantsFailed: 0 };
  const origin = FRONTEND_URLS[0] ?? "http://localhost:5173";
  const tenants: AppointmentRemindersResult["tenants"] = {};
  let tenantsFailed = 0;
  for (const slug of new Set([tenantSlugFromHost(""), ...(await getActiveTenantSlugs())])) {
    try {
      tenants[slug] = await RunAppointmentRemindersForTenant(slug, origin, now);
    } catch (err) {
      tenantsFailed += 1;
      tenants[slug] = { error: err instanceof Error ? err.message : String(err) };
      console.error(`[appointment-reminders] tenant '${slug}' failed:`, err);
    }
  }
  return { enabled: true, tenants, tenantsFailed };
}
