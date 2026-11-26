import { computed, ref, type Ref } from "vue";
import { reportCaught, reportFailedResponse } from "@api";
import { apiFetch } from "./useApi";
import { useAuthStore } from "../stores/auth";

/** One HCP with access to the patient (GET /api/v1/patient/:id/care-team, CORE-132). */
export interface CareTeamMember {
  practitioner_id: string;
  name: string;
  primary_specialty: string | null;
  specialties: string[];
  primary: boolean;
  /** How they joined; null for the primary doctor. */
  source: "appointment" | "manual" | "former_primary" | null;
  appointment_id: string | null;
  added_by_name: string | null;
  added_at: string | null;
}

/** The endpoint answers an array; anything else (an old API, a proxy page) reads as no team. */
function toMembers(body: unknown): CareTeamMember[] {
  return Array.isArray(body) ? (body as CareTeamMember[]) : [];
}

/**
 * The patient's care team: the primary doctor plus every HCP who got access
 * (by a visit, by hand, or as a former primary doctor). Role rules mirror
 * commands/careTeam.ts (D3) so the card only offers what will succeed:
 * admin and manager add and remove, the field force only adds, a doctor neither.
 */
export function usePatientCareTeam(patientId: Ref<string>) {
  const authStore = useAuthStore();
  const role = computed(() => authStore.user?.role ?? null);
  const canAdd = computed(() => !!role.value && role.value !== "doctor");
  const canRemove = computed(() => role.value === "admin" || role.value === "manager");

  const members = ref<CareTeamMember[]>([]);
  const loading = ref(false);
  const saving = ref(false);

  const path = () => `/api/v1/patient/${patientId.value}/care-team`;

  async function load(): Promise<void> {
    const id = patientId.value;
    loading.value = true;
    try {
      // Quiet on failure: the card still shows the primary doctor row.
      const res = await apiFetch(path(), { handleErrors: false });
      if (id !== patientId.value) return;
      if (res.ok) members.value = toMembers(await res.json());
      else await reportFailedResponse(res, { where: "usePatientCareTeam.load", path: "/api/v1/patient/:id/care-team" });
    } catch (err) {
      reportCaught(err, { where: "usePatientCareTeam.load" });
    } finally {
      loading.value = false;
    }
  }

  /** A failed write shows apiFetch's own error toast. */
  async function write(method: "POST" | "DELETE", practitionerId: string): Promise<boolean> {
    const id = patientId.value;
    saving.value = true;
    try {
      const res = method === "POST"
        ? await apiFetch(path(), { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ practitioner_id: practitionerId }) })
        : await apiFetch(`${path()}/${practitionerId}`, { method });
      if (!res.ok || id !== patientId.value) return false;
      members.value = toMembers(await res.json());
      return true;
    } catch (err) {
      reportCaught(err, { where: "usePatientCareTeam.write" });
      return false;
    } finally {
      saving.value = false;
    }
  }

  return {
    members,
    loading,
    saving,
    canAdd,
    canRemove,
    load,
    add: (practitionerId: string) => write("POST", practitionerId),
    remove: (practitionerId: string) => write("DELETE", practitionerId),
  };
}
