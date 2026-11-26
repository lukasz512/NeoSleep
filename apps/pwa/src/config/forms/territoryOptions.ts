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

/** Country of every territory the pickers have loaded, so a form can derive region and language from the chosen one (CORE-261). */
const territoryCountries = new Map<string, string>();

/** Country code of a loaded territory, or "" for a global/unknown one. */
export function countryOfTerritory(id: unknown): string {
  return typeof id === "string" ? (territoryCountries.get(id) ?? "") : "";
}

/**
 * @param kinds Restrict to these hierarchy levels. Private — kept separate
 *   from the two exported loaders below so each keeps the plain
 *   `() => Promise<FormFieldOption[]>` shape FormRenderer's `options` field
 *   expects (it calls this with the live form state as an argument; a
 *   loader that takes its own required params can't be wired up directly
 *   the same way — see loadScopeTerritoryOptions below for a fixed-kinds one).
 */
async function fetchTerritoryOptions(kinds?: string[]): Promise<FormFieldOption[]> {
  const query = (kinds ?? []).map((k) => `kind=${encodeURIComponent(k)}`).join("&");
  const res = await apiFetch(`/api/v1/territory?limit=-1${query ? `&${query}` : ""}`, { handleErrors: false });
  if (!res.ok) return [];
  const json = (await res.json()) as { items?: TerritoryOptionRow[] };
  for (const t of json.items ?? []) {
    // A global territory has no country of its own: it must not set a region or language.
    territoryCountries.set(t.id, t.kind === "global" ? "" : t.country_code);
  }
  return (json.items ?? []).map((t) => ({
    title: t.kind === "global" ? t.name : (t.code ? `${t.name} (${t.code}) — ${t.country_code}` : `${t.name} — ${t.country_code}`),
    value: t.id,
  }));
}

/** Full unrestricted hierarchy — territoryForm.ts's own "parent territory"
 *  field (admin CRUD) and patientForm.ts/hcpForm.ts/hcoForm.ts's own
 *  territory_id assignment field (which node this record belongs to). */
export async function loadTerritoryOptions(): Promise<FormFieldOption[]> {
  return fetchTerritoryOptions();
}

/** Country or "everywhere" only — a user's own RBAC access scope
 *  (userForm.ts) is coarse, unlike Patient/HCP/HCO's own territory_id. */
export async function loadScopeTerritoryOptions(): Promise<FormFieldOption[]> {
  return fetchTerritoryOptions(["country", "global"]);
}
