import { ref } from "vue";
import { apiFetch } from "./useApi";

/**
 * The per-tenant Doctor Panel switch (NEO-233, app_config.integrations.features.doctorPanel):
 * on in dev, off on prod until it is released. While it is off a doctor keeps /patients as home
 * and sees no Panel in the menu. Read once per signed-in user from GET /doctor-panel/actions.
 */
export const doctorPanelEnabled = ref(false);

let cache: { userId: string; result: Promise<boolean> } | null = null;

export function loadDoctorPanelEnabled(userId: string): Promise<boolean> {
  if (cache?.userId === userId) return cache.result;
  const result = apiFetch("/api/v1/doctor-panel/actions")
    .then(async (res) => (res.ok ? Boolean(((await res.json()) as { enabled?: boolean }).enabled) : false))
    .catch(() => false)
    .then((enabled) => {
      doctorPanelEnabled.value = enabled;
      return enabled;
    });
  cache = { userId, result };
  return result;
}

export function __resetDoctorPanelSwitchForTests(): void {
  cache = null;
  doctorPanelEnabled.value = false;
}
