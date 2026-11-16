import { computed } from "vue";
import { apiFetch } from "./useApi";
import { fieldErrorsFromResponse, type FieldErrors } from "./useFormErrors";
import { useAuthStore } from "../stores/auth";

/** GET/POST/PATCH /api/v1/appointments — see apps/api/src/db/appointment.ts (NEO-27, ADR-026). */
export interface Appointment {
  id: string;
  patient_id: string;
  patient_name: string | null;
  patient_first_name: string | null;
  patient_last_name: string | null;
  practitioner_id: string;
  practitioner_name: string | null;
  practitioner_first_name: string | null;
  practitioner_last_name: string | null;
  organization_id: string | null;
  organization_name: string | null;
  sleep_study_id: string | null;
  treatment_plan_id: string | null;
  created_by_user_id: string;
  type: string;
  status: AppointmentStatus;
  start_at: string;
  end_at: string;
  timezone: string;
  location_type: string;
  notes: string | null;
  /** The patient's answer from the appointment email (CORE-25); cleared when the appointment moves. */
  patient_response?: AppointmentPatientResponse | null;
  patient_responded_at?: string | null;
  /** NEO-254: the day/time the patient suggested with "I can't come". */
  patient_response_note?: string | null;
  /** NEO-254: for the call / WhatsApp buttons when the patient can't come. */
  patient_phone?: string | null;
  /** NEO-254: 'patient_cannot_attend' when cancelled after the patient declined. */
  cancel_reason?: "patient_cannot_attend" | null;
  /** CORE-116: when the patient was asked to confirm — set + no answer = "waiting for the patient". */
  confirm_request_sent_at?: string | null;
}

/** The patient's answer at a glance: their reply, "awaiting" once asked without a reply (CORE-116), or nothing. */
export type AppointmentResponseState = AppointmentPatientResponse | "awaiting";

export function appointmentResponseState(a: { status: string; patient_response?: AppointmentPatientResponse | null; confirm_request_sent_at?: string | null }): AppointmentResponseState | null {
  if (a.status !== "scheduled") return null;
  return a.patient_response ?? (a.confirm_request_sent_at ? "awaiting" : null);
}

export type AppointmentPatientResponse = "confirmed" | "cannot_attend";

export type AppointmentStatus = "scheduled" | "completed" | "cancelled" | "no_show";

export const APPOINTMENT_DURATIONS = [15, 30, 45, 60, 90, 120] as const;
/** Łukasz, 2026-09-26: a visit is an hour unless changed (slots come later). */
export const DEFAULT_APPOINTMENT_DURATION = 60;

/** Status → theme color, shared by the agenda, the list and the detail chip. */
export const APPOINTMENT_STATUS_COLOR: Record<AppointmentStatus, string> = {
  scheduled: "primary",
  completed: "success",
  cancelled: "grey",
  no_show: "warning",
};

/** Why the API refused (403 `reason`, apps/api/src/errors.ts ForbiddenReason) — one message each, see FORBIDDEN_MESSAGE_KEYS. */
export type AppointmentForbiddenReason =
  | "OUTSIDE_TERRITORY"
  | "NOT_BOOKER"
  | "CLINICAL_FIELDS"
  | "CANNOT_CLOSE"
  | "OTHER_DOCTOR"
  | "NOT_OWN_PATIENT"
  | "ROLE_NOT_ALLOWED";

/** i18n key per refusal (CORE-224): "outside your region" only when the territory check said so. */
export const FORBIDDEN_MESSAGE_KEYS: Record<AppointmentForbiddenReason, string> = {
  OUTSIDE_TERRITORY: "user.appointments.form.outsideScope",
  NOT_BOOKER: "user.appointments.form.notBooker",
  CLINICAL_FIELDS: "user.appointments.form.clinicalStaffOnly",
  CANNOT_CLOSE: "user.appointments.form.cannotClose",
  OTHER_DOCTOR: "user.appointments.form.otherDoctor",
  NOT_OWN_PATIENT: "user.appointments.form.onlyOwnPatients",
  ROLE_NOT_ALLOWED: "user.appointments.form.notAllowed",
};

/** The message for a 403: its own when the API named a known reason, the neutral one otherwise. */
export function forbiddenMessageKey(reason: string | null): string {
  return (reason && FORBIDDEN_MESSAGE_KEYS[reason as AppointmentForbiddenReason]) || "user.appointments.form.notAllowed";
}

async function forbiddenReasonFromResponse(res: Response): Promise<string | null> {
  try {
    const body = (await res.json()) as { reason?: unknown };
    return typeof body.reason === "string" ? body.reason : null;
  } catch {
    // benign: a 403 without a JSON body names no reason — the neutral message covers it.
    return null;
  }
}

/** Result of a write — `conflict` = the doctor's slot is taken (409), `forbidden` = outside the caller's rights (403). */
export interface AppointmentWriteResult {
  ok: boolean;
  conflict: boolean;
  forbidden: boolean;
  /** The API's reason for a 403, null when it gave none. */
  forbiddenReason: string | null;
  appointment: Appointment | null;
  /** A 400 naming a payload key (e.g. `duration_minutes`) — the form marks that field (NEO-109). */
  fieldErrors: FieldErrors | null;
}

async function write(path: string, method: "POST" | "PATCH", body: Record<string, unknown>): Promise<AppointmentWriteResult> {
  const res = await apiFetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    handleErrors: false, // callers show one toast/inline message per failure
  });
  const appointment = res.ok ? ((await res.json()) as Appointment) : null;
  const fieldErrors = res.ok ? null : await fieldErrorsFromResponse(res);
  const forbidden = res.status === 403;
  const forbiddenReason = forbidden ? await forbiddenReasonFromResponse(res) : null;
  return { ok: res.ok, conflict: res.status === 409, forbidden, forbiddenReason, appointment, fieldErrors };
}

/**
 * Role rules mirrored from the API (commands/appointment.ts) so the UI only
 * offers what will succeed — the API stays the authority.
 */
export function useAppointments() {
  const authStore = useAuthStore();
  const role = computed(() => authStore.user?.role ?? null);

  /** rep / KAM / MSL: book and cancel their own bookings, never see notes or close visits. */
  const isFieldForce = computed(() => role.value === "rep" || role.value === "kam" || role.value === "msl");
  const isDoctor = computed(() => role.value === "doctor");
  /** NeoCRM support reads the calendar and writes nothing (API: middleware/supportAllowlist.ts). */
  const canBook = computed(() => role.value !== "support");
  const canClose = computed(() => !!role.value && canBook.value && !isFieldForce.value);

  function canChange(appointment: Appointment): boolean {
    if (!canBook.value) return false;
    return !isFieldForce.value || appointment.created_by_user_id === authStore.user?.id;
  }

  function create(body: {
    patient_id: string;
    practitioner_id?: string;
    /** Clinic wall-clock "YYYY-MM-DDTHH:mm"; the API converts it in the clinic's zone (CORE-120). */
    start_local: string;
    duration_minutes: number;
    notes?: string;
    treatment_plan_id?: string;
    /** CORE-132: the booker confirmed that a doctor outside the patient's care team gets the record. */
    grant_access?: boolean;
  }): Promise<AppointmentWriteResult> {
    return write("/api/v1/appointments", "POST", body);
  }

  function update(id: string, body: Record<string, unknown>): Promise<AppointmentWriteResult> {
    return write(`/api/v1/appointments/${id}`, "PATCH", body);
  }

  return { isFieldForce, isDoctor, canBook, canClose, canChange, create, update };
}
