import type { FormFieldDef, FormFieldOption } from "../../types/formField";
import { apiFetch } from "../../utils/api";
import { useConfigStore } from "../../stores/config";
import { useAuthStore } from "../../stores/auth";
import { identityFields } from "./identityFields";

/**
 * Practitioner (HCP) entity config for the generic FormRenderer. Reuses the
 * shared Identity block (prefix key overridden to "salutation" — see
 * patientForm.ts's comment, same DB-layer naming convention applies here).
 *
 * Clinic (`organization_id`) picks the practitioner's primary workplace.
 * `primary_specialty`'s options depend on the chosen clinic: that clinic's
 * own `organization.specialties` (in stored order) are listed first, then
 * the rest of the tenant's specialty vocabulary — and the first inherited
 * one is auto-selected if the field is still empty (apps/pwa/src/composables/
 * useFormRenderer.ts's `dependsOn`/`autoSelectFirstIfEmpty`).
 *
 * `region` is hidden and kept in sync live with the selected clinic's own
 * region via the `hcpFormDerive` hook passed as FormRenderer's `derive` prop
 * — not a static open-time default, since the user can change clinics before
 * submitting.
 */

const INFLUENCE_TIER_OPTIONS = [
  { title: "A", value: "A" },
  { title: "B", value: "B" },
  { title: "C", value: "C" },
  { title: "D", value: "D" },
];

/** Populated by loadOrganizationOptions(), read synchronously by hcpFormDerive
 *  so selecting a clinic doesn't need a second network round-trip for region. */
let organizationsCache: { id: string; name: string; region: string }[] = [];

async function loadOrganizationOptions(): Promise<FormFieldOption[]> {
  const res = await apiFetch("/api/v1/organization?limit=-1", { handleErrors: false });
  if (!res.ok) return [];
  const json = (await res.json()) as { items?: { id: string; name: string; region?: string }[] };
  organizationsCache = (json.items ?? []).map((o) => ({ id: o.id, name: o.name, region: o.region ?? "" }));
  return organizationsCache.map((o) => ({ title: o.name, value: o.id }));
}

export function hcpFormDerive(form: Record<string, unknown>): Partial<Record<string, unknown>> | void {
  const orgId = form.organization_id as string | undefined;
  if (!orgId) return;
  const org = organizationsCache.find((o) => o.id === orgId);
  if (!org) return;
  return { region: org.region };
}

async function loadSpecialtyOptionsInheritedFirst(form: Record<string, unknown>): Promise<FormFieldOption[]> {
  const configStore = useConfigStore();
  if (configStore.options.specialties.length === 0) {
    await configStore.loadOptions();
  }
  const base = configStore.specialtyItems;

  const orgId = form.organization_id as string | undefined;
  if (!orgId) return base;

  const res = await apiFetch(`/api/v1/organization/${orgId}`, { handleErrors: false });
  if (!res.ok) return base;
  const org = (await res.json()) as { specialties?: string[] };
  const inherited = org.specialties ?? [];
  if (inherited.length === 0) return base;

  const inheritedOptions = inherited.map(
    (v) => base.find((o) => o.value === v) ?? { title: v, value: v },
  );
  const rest = base.filter((o) => !inherited.includes(o.value as string));
  return [...inheritedOptions, ...rest];
}

const identity = identityFields();
identity[0] = { ...identity[0], key: "salutation" };

export const hcpFormFields: FormFieldDef[] = [
  ...identity,
  {
    key: "organization_id",
    type: "autocomplete",
    labelKey: "user.hcp.form.clinic",
    options: loadOrganizationOptions,
    cols: 12,
  },
  {
    key: "primary_specialty",
    type: "autocomplete",
    labelKey: "user.hcp.form.specialty",
    options: loadSpecialtyOptionsInheritedFirst,
    dependsOn: ["organization_id"],
    autoSelectFirstIfEmpty: true,
    cols: 6,
  },
  {
    key: "influence_tier",
    type: "select",
    labelKey: "user.hcp.form.influenceTier",
    options: INFLUENCE_TIER_OPTIONS,
    default: "A",
    cols: 6,
  },
  {
    key: "region",
    type: "text",
    labelKey: "user.hcp.form.region",
    hidden: true,
  },
  {
    key: "language",
    type: "text",
    labelKey: "user.hcp.form.language",
    hidden: true,
    default: () => useAuthStore().user?.language ?? "en",
  },
  {
    key: "primary",
    type: "text",
    labelKey: "user.hcp.form.nationalId",
    icon: "id-card",
    nestUnder: "national_ids",
    cols: 12,
  },
  {
    key: "linkedin",
    type: "text",
    labelKey: "user.hcp.form.linkedin",
    icon: "linkedin",
    nestUnder: "social_links",
    cols: 6,
  },
  {
    key: "instagram",
    type: "text",
    labelKey: "user.hcp.form.instagram",
    icon: "instagram",
    nestUnder: "social_links",
    cols: 6,
  },
  {
    key: "facebook",
    type: "text",
    labelKey: "user.hcp.form.facebook",
    icon: "facebook",
    nestUnder: "social_links",
    cols: 6,
  },
  {
    key: "google",
    type: "text",
    labelKey: "user.hcp.form.googleLink",
    icon: "map-pin",
    nestUnder: "social_links",
    cols: 6,
  },
];
