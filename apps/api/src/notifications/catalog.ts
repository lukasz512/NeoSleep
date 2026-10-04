/**
 * Notification event catalog (NEO-134, ADR-027 §1).
 *
 * One entry per notification.type. Producers never write titles or channels
 * themselves — notify() reads them from here, so every event of a type gets
 * the same category, priority, channels and PHI-free copy.
 *
 * Copy lives in packages/i18n (`notify.<type>.title` / `.body`) and is
 * rendered in the recipient's language. It must never contain patient data:
 * push, email and SMS are read on lock screens and in inboxes NeoSleep does
 * not control (ADR-012 compliance note). catalog.spec.ts enforces it — the
 * only placeholder a template may use is {count}.
 *
 * Adding a type: add the entry here, the keys to en.json first (then pl/mx),
 * and check its category against ADR-012's opt-out table.
 */

export type NotificationCategory = "security" | "legal" | "operational" | "marketing";
export type NotificationPriority = "normal" | "high";
export type NotificationChannel = "in_app" | "push" | "email" | "sms" | "whatsapp";

/**
 * In-app quick actions (CORE-4 D2). Only events that need someone to act get
 * them; the bell pins those under "Needs action". Never sent by push or email.
 *   call       — phone the patient (tel: link, number joined at read time)
 *   reschedule — open the appointments screen to find a new time
 */
export type NotificationActionKind = "call" | "reschedule";

export interface NotificationAction {
  kind: NotificationActionKind;
  href: string;
}

/**
 * Ids only — never names or clinical values. Used to build deep links.
 * notify() always passes `entityId` (the event's own record) next to the
 * producer's own params.
 */
export type NotificationLinkParams = Readonly<Record<string, string | null | undefined>>;

export interface NotificationEventDefinition {
  category: NotificationCategory;
  /** Operational only (time-based); never derived from clinical values — ADR-027 §7. */
  priority: NotificationPriority;
  /** In-app is always included by notify(); list the others. */
  channels: readonly NotificationChannel[];
  /** Unread in-app after this many minutes → email (worker, NEO-136). null = never escalates. */
  escalateAfterMin: number | null;
  /** PWA route the bell item opens. */
  link: (params: NotificationLinkParams) => string | null;
  /** notification.entity_type written for this event. */
  entityType: string;
  /** In-app quick actions, in button order (CORE-4). Omit for one-tap rows. */
  actions?: readonly NotificationActionKind[];
}

/** CORE-117: Citas merged into the Calendario screen — /appointments still redirects there, but new links point straight at it. */
/** CORE-4: the visit itself — CalendarView opens `?appointment=<id>` in its detail dialog. */
const appointmentLink = (p: NotificationLinkParams): string =>
  p.entityId ? `/calendar?appointment=${encodeURIComponent(p.entityId)}` : "/calendar";
const patientLink = (p: NotificationLinkParams): string | null => (p.patientId ? `/patients/${p.patientId}` : null);
/** NEO-195: the patient's sleep-study tab, where a submitted questionnaire shows up. */
const patientStudiesLink = (p: NotificationLinkParams): string | null => (p.patientId ? `/patients/${p.patientId}?tab=studies` : null);
/** NEO-196: the doctor's own HCP record. */
const practitionerLink = (p: NotificationLinkParams): string | null => (p.practitionerId ? `/hcp/${p.practitionerId}` : null);
/** NEO-197: the patient's OrthoApnea tab, where the placed order shows up. */
const patientOrthoapneaLink = (p: NotificationLinkParams): string | null => (p.patientId ? `/patients/${p.patientId}?tab=orthoapnea` : null);

export const NOTIFICATION_TYPES = [
  "appointment_booked",
  "appointment_rescheduled",
  "appointment_cancelled",
  "appointment_patient_cannot_attend",
  "appointment_patient_no_email",
  "appointment_patient_unconfirmed",
  "partner_order_status_changed",
  "questionnaire_submitted",
  "practitioner_invite_accepted",
  "device_order_placed",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_CATALOG: Readonly<Record<NotificationType, NotificationEventDefinition>> = {
  appointment_booked: {
    category: "operational",
    priority: "normal",
    channels: ["in_app", "push"],
    escalateAfterMin: 30,
    link: appointmentLink,
    entityType: "Appointment",
  },
  appointment_rescheduled: {
    category: "operational",
    priority: "normal",
    channels: ["in_app", "push"],
    escalateAfterMin: 30,
    link: appointmentLink,
    entityType: "Appointment",
  },
  appointment_cancelled: {
    category: "operational",
    priority: "normal",
    channels: ["in_app", "push"],
    escalateAfterMin: 30,
    link: appointmentLink,
    entityType: "Appointment",
  },
  /** The patient pressed "I can't come" in the appointment email (CORE-25) — the clinic finds a new time. */
  appointment_patient_cannot_attend: {
    category: "operational",
    priority: "normal",
    channels: ["in_app", "push"],
    escalateAfterMin: 30,
    link: appointmentLink,
    entityType: "Appointment",
    actions: ["call", "reschedule"],
  },
  /** CORE-116: the day before the visit the patient still hasn't confirmed (asked again) — the clinic calls or frees the slot. */
  appointment_patient_unconfirmed: {
    category: "operational",
    priority: "normal",
    channels: ["in_app", "push"],
    escalateAfterMin: null,
    link: appointmentLink,
    entityType: "Appointment",
    actions: ["call", "reschedule"],
  },
  /** Booked, but the patient has no email on file — whoever booked tells them another way (CORE-25). */
  appointment_patient_no_email: {
    category: "operational",
    priority: "normal",
    channels: ["in_app"],
    escalateAfterMin: null,
    link: appointmentLink,
    entityType: "Appointment",
  },
  partner_order_status_changed: {
    category: "operational",
    priority: "normal",
    channels: ["in_app", "push"],
    escalateAfterMin: null,
    link: patientLink,
    entityType: "TreatmentPlan",
  },
  questionnaire_submitted: {
    category: "operational",
    priority: "normal",
    channels: ["in_app", "push"],
    escalateAfterMin: null,
    link: patientStudiesLink,
    entityType: "QuestionnaireRequest",
  },
  practitioner_invite_accepted: {
    category: "operational",
    priority: "normal",
    channels: ["in_app", "push"],
    escalateAfterMin: null,
    link: practitionerLink,
    entityType: "Practitioner",
  },
  device_order_placed: {
    category: "operational",
    priority: "normal",
    channels: ["in_app", "push"],
    escalateAfterMin: null,
    link: patientOrthoapneaLink,
    entityType: "TreatmentPlan",
  },
};

export function getEventDefinition(type: NotificationType): NotificationEventDefinition {
  return NOTIFICATION_CATALOG[type];
}

function isNotificationType(type: string): type is NotificationType {
  return (NOTIFICATION_TYPES as readonly string[]).includes(type);
}

/**
 * The quick actions an in-app row shows (CORE-4 D2): the catalog's list for
 * the type, turned into links. Call needs a phone number; without one it is
 * dropped. Reschedule opens the row's own link.
 */
export function resolveNotificationActions(
  type: string,
  ctx: { phone: string | null; actionUrl: string | null },
): NotificationAction[] {
  if (!isNotificationType(type)) return [];
  const result: NotificationAction[] = [];
  for (const kind of NOTIFICATION_CATALOG[type].actions ?? []) {
    if (kind === "call") {
      const digits = ctx.phone?.replace(/[^\d+]/g, "") ?? "";
      if (digits) result.push({ kind, href: `tel:${digits}` });
    } else if (ctx.actionUrl) {
      result.push({ kind, href: ctx.actionUrl });
    }
  }
  return result;
}

/**
 * The link an in-app row opens, rebuilt when the list is read (CORE-4): an
 * appointment event links to its own visit, also for rows stored before
 * deep links existed (their action_url is the bare calendar). Other types
 * keep the link stored at notify time — it carries params (patientId…) the
 * row alone can't rebuild.
 */
export function resolveNotificationLink(type: string, entityId: string | null, storedUrl: string | null): string | null {
  if (!isNotificationType(type) || !entityId) return storedUrl;
  const def = NOTIFICATION_CATALOG[type];
  return def.entityType === "Appointment" ? def.link({ entityId }) : storedUrl;
}

/** i18n keys for a type's copy. Grouped rows (group_count > 1) use the shared grouped body. */
export function copyKeys(type: NotificationType): { title: string; body: string } {
  return { title: `notify.${type}.title`, body: `notify.${type}.body` };
}

export const GROUPED_BODY_KEY = "notify.grouped.body";
