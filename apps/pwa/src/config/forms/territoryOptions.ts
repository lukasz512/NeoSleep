import type { FormFieldOption } from "../../types/formField";
import { apiFetch } from "../../composables/useApi";

/**
 * Shared territory-picker option loader — used by territoryForm.ts's own
 * "parent territory" field (admin CRUD) and patientForm.ts's "territory_id"
 * assignment field (which node of the hierarchy this patient belongs to).
 * Kept in one place rather than duplicated per consumer since both hit the
 * same endpoint with the same option shape.
 */
export interface TerritoryOptionRow {
  id: string;
  name: string;
  code: string | null;
  kind: string;
  country_code: string;
}

export async function loadTerritoryOptions(): Promise<FormFieldOption[]> {
  const res = await apiFetch("/api/v1/territory?limit=-1", { handleErrors: false });
  if (!res.ok) return [];
  const json = (await res.json()) as { items?: TerritoryOptionRow[] };
  return (json.items ?? []).map((t) => ({
    title: t.code ? `${t.name} (${t.code}) — ${t.country_code}` : `${t.name} — ${t.country_code}`,
    value: t.id,
  }));
}
