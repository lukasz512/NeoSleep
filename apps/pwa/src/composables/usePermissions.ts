import { computed } from "vue";
import { useAuthStore } from "../stores/auth";

/**
 * Central RBAC read model for the PWA — mirrors the backend requireRole()
 * gates on organization/practitioner/patient routes (see apps/api/src/routes/).
 * Any change here must be mirrored server-side; a frontend-only check is
 * decoration, not security.
 */
export function usePermissions() {
  const authStore = useAuthStore();
  const role = computed(() => authStore.user?.role);

  // Doctor is the only role excluded from editing HCO/HCP master data —
  // everyone else on staff (admin/manager/kam/msl/rep) maintains these
  // records as part of their day-to-day field work.
  const canEditOrganizations = computed(() => !!role.value && role.value !== "doctor");
  const canEditPractitioners = computed(() => !!role.value && role.value !== "doctor");
  // No role is excluded from editing patients — doctors manage their own
  // patients' clinical data same as everyone else.
  const canEditPatients = computed(() => !!role.value);
  const isAdmin = computed(() => role.value === "admin");
  /** A doctor works on their own patients (CORE-104): the record's practitioner is them. */
  const isDoctor = computed(() => role.value === "doctor");

  return { canEditOrganizations, canEditPractitioners, canEditPatients, isAdmin, isDoctor };
}
