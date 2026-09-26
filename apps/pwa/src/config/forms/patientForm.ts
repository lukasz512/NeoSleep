import type { FormDerive, FormFieldDef, FormFieldOption } from "../../types/formField";
import { apiFetch } from "../../composables/useApi";
import { useConfigStore } from "../../stores/config";
import { useAuthStore } from "../../stores/auth";
import { identityFields, GENDERED_SALUTATIONS, salutationMarket, type SalutationMarket } from "./identityFields";
import { loadTerritoryOptions } from "./territoryOptions";
import { useSpecialtyLabel } from "../../composables/useSpecialtyLabel";

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
interface PractitionerOptionRow {
  id: string;
  name: string;
  primary_specialty?: string | null;
  institution?: string | null;
}

/** "Specialty · Clinic" under each doctor in the picker, so two similar names can be told apart. */
function practitionerOption(p: PractitionerOptionRow, specialtyLabel: (code?: string | null) => string): FormFieldOption {
  const subtitle = [specialtyLabel(p.primary_specialty), p.institution ?? ""].filter(Boolean).join(" · ");
  return { title: p.name, value: p.id, ...(subtitle ? { subtitle } : {}) };
}

async function loadPractitionerOptions(form?: Record<string, unknown>): Promise<FormFieldOption[]> {
  const configStore = useConfigStore();
  if (configStore.options.specialties.length === 0) {
    await configStore.loadOptions();
  }
  const specialtyLabel = useSpecialtyLabel();
  const res = await apiFetch("/api/v1/practitioner?limit=-1", { handleErrors: false });
  const json = res.ok
    ? ((await res.json()) as { items?: PractitionerOptionRow[] })
    : { items: [] };
  const options = (json.items ?? []).map((p) => practitionerOption(p, specialtyLabel));

  const currentId = typeof form?.practitioner_id === "string" ? form.practitioner_id.trim() : "";
  if (currentId && !options.some((o) => o.value === currentId)) {
    const hcpRes = await apiFetch(`/api/v1/practitioner/${currentId}`, { handleErrors: false });
    if (hcpRes.ok) {
      const hcp = (await hcpRes.json()) as PractitionerOptionRow;
      options.push(practitionerOption(hcp, specialtyLabel));
    }
  }

  return options;
}

/**
 * Same range the API enforces (commands/patient.ts normalizeDateOfBirth):
 * 1900-01-01 up to today, so a typo like year 0001 is caught before Save.
 * The date input hands over "YYYY-MM-DD", which compares as a string.
 */
function dateOfBirthInRange(v: unknown): true | string {
  if (typeof v !== "string" || !v) return true;
  const today = new Date().toISOString().slice(0, 10);
  return v >= "1900-01-01" && v <= today ? true : "app.formRenderer.validation.server.date_of_birth";
}

const identity = identityFields();
identity[0] = { ...identity[0], key: "salutation" };

// Same set as the identities.gender CHECK constraint. Required for patients
// (the list's "F · 47 y" line depends on it); doctors never ask for either.
const GENDER_OPTIONS: FormFieldOption[] = [
  { title: "app.patients.form.genderFemale", value: "female", symbol: "♀" },
  { title: "app.patients.form.genderMale", value: "male", symbol: "♂" },
  { title: "app.patients.form.genderOther", value: "other", secondary: true },
  { title: "app.patients.form.genderPreferNot", value: "prefer_not_to_say", secondary: true },
];

/** Keyed without case or the trailing dot, so a typed "dra" counts as "Dra." too. */
function salutationKey(v: unknown): string {
  return typeof v === "string" ? v.trim().toLowerCase().replace(/\.$/, "") : "";
}

interface SalutationSexMaps {
  sexOf: Record<string, "male" | "female">;
  forSex: Record<"male" | "female", Record<string, string>>;
}

const SALUTATION_MAPS = {} as Record<SalutationMarket, SalutationSexMaps>;
for (const market of Object.keys(GENDERED_SALUTATIONS) as SalutationMarket[]) {
  const maps: SalutationSexMaps = { sexOf: {}, forSex: { male: {}, female: {} } };
  for (const { male, female } of GENDERED_SALUTATIONS[market]) {
    maps.sexOf[salutationKey(male)] = "male";
    maps.sexOf[salutationKey(female)] = "female";
    maps.forSex.male[salutationKey(female)] = male;
    maps.forSex.female[salutationKey(male)] = female;
  }
  SALUTATION_MAPS[market] = maps;
}

/**
 * Keeps salutation and sex in step, both ways, for the patient's market
 * (identityFields' GENDERED_SALUTATIONS): in MX Dr./Prof./Lic./Sr. ↔
 * Masculino and Dra./Profa./Licda./Sra. ↔ Femenino; in PL Pan ↔ Mężczyzna
 * and Pani ↔ Kobieta, while Dr./Prof./Mgr. stay as they are for both sexes.
 * Switching sex flips the salutation to its other form. Once sex is Otro /
 * Prefiero no decir it is a deliberate manual choice — the salutation no
 * longer moves it (and picking it leaves the salutation alone). A salutation
 * without a sex, or an empty one, never changes anything.
 */
export const patientFormDerive: FormDerive = (form, prev) => {
  const salutationChanged = salutationKey(form.salutation) !== salutationKey(prev.salutation);
  const sexChanged = form.gender !== prev.gender;
  if (salutationChanged === sexChanged) return;
  const maps = SALUTATION_MAPS[salutationMarket(form)];

  if (sexChanged) {
    if (form.gender !== "male" && form.gender !== "female") return;
    const salutation = maps.forSex[form.gender][salutationKey(form.salutation)];
    return salutation ? { salutation } : undefined;
  }

  if (form.gender === "other" || form.gender === "prefer_not_to_say") return;
  const sex = maps.sexOf[salutationKey(form.salutation)];
  return sex ? { gender: sex } : undefined;
};

export const patientFormFields: FormFieldDef[] = [
  ...identity,
  {
    key: "gender",
    section: "identity",
    type: "choice",
    labelKey: "app.patients.form.gender",
    options: GENDER_OPTIONS,
    default: null,
    required: true,
    cols: 6,
  },
  {
    key: "date_of_birth",
    section: "identity",
    type: "date",
    labelKey: "app.patients.form.dateOfBirth",
    default: null,
    required: true,
    rules: [dateOfBirthInRange],
    cols: 6,
  },
  {
    key: "practitioner_id",
    section: "clinical",
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
    section: "clinical",
    type: "select",
    labelKey: "app.patients.form.status",
    options: STATUS_OPTIONS,
    default: "active",
    cols: 6,
  },
  {
    key: "region",
    section: "territory",
    type: "autocomplete",
    labelKey: "app.patients.form.region",
    options: loadRegionOptions,
    cols: 6,
  },
  {
    key: "territory_id",
    section: "territory",
    type: "autocomplete",
    labelKey: "app.patients.form.territory",
    hint: "app.patients.form.territoryHint",
    default: null,
    options: loadTerritoryOptions,
    icon: "nav-territories",
    cols: 6,
  },
  // Always hidden, defaulted to the creating user's own country — same
  // pattern as hcoForm.ts's country_code field. Distinct from `region`
  // above (identities.region is a separate business/geography attribute,
  // see migration 013's comment) — this is what RBAC country-scoping
  // (middleware/requireScope.ts) actually filters on.
  {
    key: "country_code",
    section: "territory",
    type: "text",
    labelKey: "app.patients.form.countryCode",
    hidden: true,
    default: () => useAuthStore().user?.country_code ?? "",
  },
  {
    key: "ahi_baseline",
    section: "clinical",
    type: "number",
    labelKey: "app.patients.form.ahiBaseline",
    cols: 6,
  },
  {
    // TEXT column presented as a yes/no switch (see FormFieldDef.trueValue/
    // falseValue) — a rep just needs to record whether the patient has CPAP,
    // not the specific device model.
    key: "cpap_device",
    section: "clinical",
    type: "boolean",
    labelKey: "app.patients.form.cpapDevice",
    trueValue: "CPAP",
    falseValue: "",
    cols: 6,
  },
  {
    key: "medical_record",
    section: "clinical",
    type: "text",
    labelKey: "app.patients.form.medicalRecord",
    cols: 12,
  },
];
