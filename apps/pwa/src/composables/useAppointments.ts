import { computed } from "vue";
import { apiFetch } from "./useApi";
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
}

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

/** Result of a write — `conflict` = the doctor's slot is taken (409), `forbidden` = outside the caller's rights (403). */
export interface AppointmentWriteResult {
  ok: boolean;
  conflict: boolean;
  forbidden: boolean;
  appointment: Appointment | null;
}

async function write(path: string, method: "POST" | "PATCH", body: Record<string, unknown>): Promise<AppointmentWriteResult> {
  const res = await apiFetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    handleErrors: false, // callers show one toast/inline message per failure
  });
  const appointment = res.ok ? ((await res.json()) as Appointment) : null;
  return { ok: res.ok, conflict: res.status === 409, forbidden: res.status === 403, appointment };
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
  const canClose = computed(() => !!role.value && !isFieldForce.value);

  function canChange(appointment: Appointment): boolean {
    return !isFieldForce.value || appointment.created_by_user_id === authStore.user?.id;
  }

  function create(body: {
    patient_id: string;
    practitioner_id?: string;
    start_at: string;
    duration_minutes: number;
    notes?: string;
    treatment_plan_id?: string;
  }): Promise<AppointmentWriteResult> {
    return write("/api/v1/appointments", "POST", body);
  }

  function update(id: string, body: Record<string, unknown>): Promise<AppointmentWriteResult> {
    return write(`/api/v1/appointments/${id}`, "PATCH", body);
  }

  return { isFieldForce, isDoctor, canClose, canChange, create, update };
}
