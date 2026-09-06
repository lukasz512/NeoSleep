import type { FormFieldDef, FormFieldOption } from "../../types/formField";
import { apiFetch } from "../../composables/useApi";
import { useConfigStore } from "../../stores/config";
import { identityFields } from "./identityFields";

/**
 * Patient entity config for the generic FormRenderer. Reuses the shared
 * Identity block, but overrides its prefix field's key from "title" to
 * "salutation" — apps/api/src/db/patient.ts's write path names this field
 * "salutation" at the JS layer (mapped internally onto identities.title),
 * matching PractitionerForm's existing convention. Each identityFields()
 * call returns fresh field-def objects, so overriding one key here doesn't
 * affect any other entity's copy.
 */

// DB CHECK constraint patient_status_check (infrastructure/db/schema-snapshot.sql).
// Colors mirror PatientsView.vue's statusColor() so the pill reads the same
// here as it does in the patient list/detail views.
const STATUS_OPTIONS: FormFieldOption[] = [
  { title: "app.patients.filters.statusActive", value: "active", color: "success" },
  { title: "app.patients.filters.statusFollowUp", value: "follow_up", color: "warning" },
  { title: "app.patients.filters.statusDischarged", value: "discharged", color: "default" },
];

async function loadRegionOptions() {
  const configStore = useConfigStore();
  if (configStore.options.regions.length === 0) {
    await configStore.loadOptions();
  }
  return configStore.regionItems;
}

/**
 * The bulk `?limit=-1` fetch below is still capped at the API's page-size
 * ceiling (see MAX_LIMIT in apps/api/src/routes/utils.ts) and sorted by
 * most-recently-created, so an HCP older than that cutoff can be missing
 * from it entirely — the picker then has nothing to match this patient's
 * already-saved practitioner_id against and falls back to showing the raw
 * id. Fetching that one record directly whenever the bulk list doesn't
 * already contain it keeps the display correct regardless of how many HCPs
 * exist (see the identical fix for organization_id in hcpForm.ts).
 */
async function loadPractitionerOptions(form?: Record<string, unknown>): Promise<FormFieldOption[]> {
  const res = await apiFetch("/api/v1/practitioner?limit=-1", { handleErrors: false });
  const json = res.ok
    ? ((await res.json()) as { items?: { id: string; name: string }[] })
    : { items: [] };
  const options = (json.items ?? []).map((p) => ({ title: p.name, value: p.id }));

  const currentId = typeof form?.practitioner_id === "string" ? form.practitioner_id.trim() : "";
  if (currentId && !options.some((o) => o.value === currentId)) {
    const hcpRes = await apiFetch(`/api/v1/practitioner/${currentId}`, { handleErrors: false });
    if (hcpRes.ok) {
      const hcp = (await hcpRes.json()) as { id: string; name: string };
      options.push({ title: hcp.name, value: hcp.id });
    }
  }

  return options;
}

const identity = identityFields();
identity[0] = { ...identity[0], key: "salutation" };

export const patientFormFields: FormFieldDef[] = [
  ...identity,
  {
    key: "practitioner_id",
    type: "autocomplete",
    labelKey: "app.patients.form.practitioner",
    placeholder: "app.patients.form.practitionerPlaceholder",
    // VAutocomplete/VSelect treat a "" modelValue as an already-set custom
    // value (wrapped into a length-1 internal array), which suppresses the
    // placeholder even when nothing is actually selected — seeding null
    // instead (skipped by Vuetify's own internal transform) is what makes
    // an unset field register as empty and actually show the placeholder.
    default: null,
    options: loadPractitionerOptions,
    icon: "nav-hcp",
    avatarEntityType: "hcp",
    cols: 12,
  },
  {
    key: "status",
    type: "select",
    labelKey: "app.patients.form.status",
    options: STATUS_OPTIONS,
    default: "active",
    cols: 6,
  },
  {
    key: "region",
    type: "autocomplete",
    labelKey: "app.patients.form.region",
    options: loadRegionOptions,
    cols: 6,
  },
  {
    key: "ahi_baseline",
    type: "number",
    labelKey: "app.patients.form.ahiBaseline",
    cols: 6,
  },
  {
    key: "cpap_device",
    type: "text",
    labelKey: "app.patients.form.cpapDevice",
    cols: 6,
  },
  {
    key: "medical_record",
    type: "text",
    labelKey: "app.patients.form.medicalRecord",
    cols: 12,
  },
];
