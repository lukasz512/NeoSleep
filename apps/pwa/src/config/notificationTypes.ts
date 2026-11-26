import type AppIcon from "../components/AppIcon.vue";

type AppIconName = InstanceType<typeof AppIcon>["$props"]["name"];

/**
 * How each notification type looks in the bell's list (CORE-4): its icon and
 * the tint of the icon tile. The copy is in i18n
 * (`notificationCenter.types.<type>`), the events themselves in the API's
 * catalog (apps/api/src/notifications/catalog.ts). An unknown type falls back
 * to the bell.
 *
 * Tones follow what the row is about: an appointment, an order/treatment, a
 * form, a person; "attention" marks events that need someone to act.
 */
export type NotificationTone = "appointment" | "order" | "form" | "person" | "attention" | "neutral";

export interface NotificationTypeView {
  icon: AppIconName;
  tone: NotificationTone;
}

export const NOTIFICATION_TYPE_VIEWS: Readonly<Record<string, NotificationTypeView>> = {
  appointment_booked: { icon: "calendar-clock", tone: "appointment" },
  appointment_rescheduled: { icon: "calendar-clock", tone: "appointment" },
  appointment_cancelled: { icon: "x-circle", tone: "appointment" },
  appointment_patient_cannot_attend: { icon: "user-x", tone: "attention" },
  appointment_patient_unconfirmed: { icon: "alert-triangle", tone: "attention" },
  appointment_patient_no_email: { icon: "mail", tone: "appointment" },
  partner_order_status_changed: { icon: "nav-treatment-plans", tone: "order" },
  device_order_placed: { icon: "nav-treatment-plans", tone: "order" },
  questionnaire_submitted: { icon: "form-screening", tone: "form" },
  practitioner_invite_accepted: { icon: "nav-hcp", tone: "person" },
  problem_report_received: { icon: "feedback", tone: "neutral" },
  problem_report_new: { icon: "feedback", tone: "attention" },
  problem_report_in_progress: { icon: "feedback", tone: "neutral" },
  problem_report_closed: { icon: "check-circle", tone: "neutral" },
};

const FALLBACK: NotificationTypeView = { icon: "bell", tone: "neutral" };

export function notificationTypeView(type: string): NotificationTypeView {
  return NOTIFICATION_TYPE_VIEWS[type] ?? FALLBACK;
}
