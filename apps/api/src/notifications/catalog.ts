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

/** Ids only — never names or clinical values. Used to build deep links. */
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
}

const appointmentLink = (): string => "/appointments";
const patientLink = (p: NotificationLinkParams): string | null => (p.patientId ? `/patients/${p.patientId}` : null);

export const NOTIFICATION_TYPES = [
  "appointment_booked",
  "appointment_rescheduled",
  "appointment_cancelled",
  "appointment_patient_cannot_attend",
  "appointment_patient_no_email",
  "partner_order_status_changed",
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
};

export function getEventDefinition(type: NotificationType): NotificationEventDefinition {
  return NOTIFICATION_CATALOG[type];
}

/** i18n keys for a type's copy. Grouped rows (group_count > 1) use the shared grouped body. */
export function copyKeys(type: NotificationType): { title: string; body: string } {
  return { title: `notify.${type}.title`, body: `notify.${type}.body` };
}

export const GROUPED_BODY_KEY = "notify.grouped.body";
