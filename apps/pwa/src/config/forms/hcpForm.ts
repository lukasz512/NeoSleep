import type { FormFieldDef, FormFieldOption } from "../../types/formField";
import { apiFetch } from "../../composables/useBffApi";
import { useConfigStore } from "../../stores/config";
import { useAuthStore } from "../../stores/auth";
import { identityFields } from "./identityFields";

/**
 * Practitioner (HCP) entity config for the generic FormRenderer. Reuses the
 * shared Identity block (prefix key overridden to "salutation" — see
 * patientForm.ts's comment, same DB-layer naming convention applies here).
 *
 * Clinic (`organization_id`) picks the practitioner's primary workplace. It's
 * a `combobox` (not a plain `autocomplete`) so a rep can also type a clinic
 * name that doesn't exist yet — see isKnownOrganization()/isCreatingNew()
 * below: once the typed value stops matching any loaded organization, the
 * field's label/color flip to signal "this creates a new clinic" and the
 * `new_organization.*` fields (a trimmed-down HCO form) become visible.
 * The host view (LeadDetailView.vue/LeadsView.vue's onContactSubmit) is
 * responsible for actually creating that organization first via
 * POST /api/v1/organization, then submitting the practitioner with the
 * returned id — see isCreatingNewOrganization()'s export.
 *
 * `primary_specialty`'s options depend on the chosen clinic: that clinic's
 * own `organization.specialties` (in stored order) are listed first, then
 * the rest of the tenant's specialty vocabulary — and the first inherited
 * one is auto-selected if the field is still empty (apps/pwa/src/composables/
 * useFormRenderer.ts's `dependsOn`/`autoSelectFirstIfEmpty`).
 *
 * `region` is hidden and kept in sync live with the selected clinic's own
 * region via the `hcpFormDerive` hook passed as FormRenderer's `derive` prop
 * — not a static open-time default, since the user can change clinics before
 * submitting. For a newly-typed clinic (no id yet), it instead follows
 * `new_organization.region` once that field is filled in.
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

/**
 * Matches the combobox's current value against the loaded clinic list — by
 * id (picked from the dropdown) or, as a safety net against accidental
 * duplicates, by exact case-insensitive name (typed free text that happens
 * to already exist, e.g. a lead's institution name pre-filling this field —
 * see moveToContactsInitialData in LeadDetailView.vue/LeadsView.vue).
 */
function isKnownOrganization(value: unknown): { id: string; name: string; region: string } | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return organizationsCache.find(
    (o) => o.id === value || o.name.toLowerCase() === value.trim().toLowerCase(),
  );
}

/**
 * True once the rep has typed a clinic name that matches nothing on file —
 * drives the organization_id field's label/color and the new_organization.*
 * fields' visibility. Exported so the host view's submit handler can decide
 * whether to create the organization first (see the file header comment).
 */
export function isCreatingNewOrganization(form: Record<string, unknown>): boolean {
  const value = form.organization_id;
  if (typeof value !== "string" || !value.trim()) return false;
  return !isKnownOrganization(value);
}

export function hcpFormDerive(form: Record<string, unknown>): Partial<Record<string, unknown>> | void {
  const orgId = form.organization_id as string | undefined;
  const known = isKnownOrganization(orgId);
  if (known) return { region: known.region };

  const newOrg = form.new_organization as { org_region?: string } | undefined;
  if (newOrg?.org_region) return { region: newOrg.org_region };
}

// DB CHECK constraint organization_type_check — mirrors hcoForm.ts's ORG_TYPES.
async function loadNewOrgTypeOptions() {
  const configStore = useConfigStore();
  if (configStore.options.organization_types.length === 0) {
    await configStore.loadOptions();
  }
  return configStore.institutionTypeItems;
}

async function loadNewOrgRegionOptions() {
  const configStore = useConfigStore();
  if (configStore.options.regions.length === 0) {
    await configStore.loadOptions();
  }
  return configStore.regionItems;
}

async function loadSpecialtyOptionsInheritedFirst(form: Record<string, unknown>): Promise<FormFieldOption[]> {
  const configStore = useConfigStore();
  if (configStore.options.specialties.length === 0) {
    await configStore.loadOptions();
  }
  const base = configStore.specialtyItems;

  const orgId = form.organization_id as string | undefined;
  // Skip the round-trip while the rep is still typing a not-yet-existing
  // clinic name — dependsOn re-fires on every keystroke, and a freshly
  // typed name is never a real organization id to look up.
  if (!orgId || isCreatingNewOrganization(form)) return base;

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
    type: "combobox",
    labelKey: (form) => (isCreatingNewOrganization(form) ? "user.hcp.form.clinicNew" : "user.hcp.form.clinic"),
    color: (form) => (isCreatingNewOrganization(form) ? "success" : undefined),
    required: true,
    options: loadOrganizationOptions,
    avatarEntityType: "hco",
    cols: 12,
  },
  {
    // Prefixed org_* — useFormRenderer's form state is a flat object keyed
    // by bare `key` regardless of `nestUnder`, so a plain "region"/"phone"
    // here would silently collide with the practitioner's own hidden
    // `region` field and identityFields()' `phone` field below.
    key: "org_type",
    type: "select",
    labelKey: "user.hco.form.type",
    options: loadNewOrgTypeOptions,
    hidden: (form) => !isCreatingNewOrganization(form),
    nestUnder: "new_organization",
    cols: 6,
  },
  {
    key: "org_region",
    type: "autocomplete",
    labelKey: "user.hco.form.region",
    options: loadNewOrgRegionOptions,
    hidden: (form) => !isCreatingNewOrganization(form),
    nestUnder: "new_organization",
    cols: 6,
  },
  {
    key: "org_address_line1",
    type: "text",
    labelKey: "user.hco.form.addressLine1",
    hidden: (form) => !isCreatingNewOrganization(form),
    nestUnder: "new_organization",
    cols: 12,
  },
  {
    key: "org_city",
    type: "text",
    labelKey: "user.hco.form.city",
    hidden: (form) => !isCreatingNewOrganization(form),
    nestUnder: "new_organization",
    cols: 6,
  },
  {
    key: "org_postal_code",
    type: "text",
    labelKey: "user.hco.form.postalCode",
    hidden: (form) => !isCreatingNewOrganization(form),
    nestUnder: "new_organization",
    cols: 6,
  },
  {
    key: "org_phone",
    type: "phone",
    labelKey: "user.hco.form.phone",
    icon: "phone",
    hidden: (form) => !isCreatingNewOrganization(form),
    nestUnder: "new_organization",
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
