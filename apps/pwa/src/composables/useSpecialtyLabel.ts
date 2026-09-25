import { useConfigStore } from "../stores/config";

/**
 * Specialty code (practitioner.primary_specialty, e.g. "dentist") → the
 * tenant's translated label from the `specialty` lookups. The one place this
 * mapping lives — HCP lists/details and every "doctor + specialty" cell
 * (NEO-57) go through it. Falls back to the raw code when the lookup has no
 * entry, and to "" when there is no code at all.
 */
export function useSpecialtyLabel() {
  const configStore = useConfigStore();
  return (code?: string | null): string => {
    if (!code) return "";
    return configStore.specialtyItems.find((o) => o.value === code)?.title ?? code;
  };
}
