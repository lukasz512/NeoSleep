import type { FormFieldDef, FormFieldOption } from "../../types/formField";
import { loadTerritoryOptions } from "./territoryOptions";

/**
 * Territory (geographic hierarchy) entity config for the generic FormRenderer.
 *
 * `code` is a short per-level slug (e.g. "mx", "cdmx", "polanco") — the
 * breadcrumb shown on PatientDetailView.vue's "Región" row joins each
 * ancestor's `code` with "/". See migrations/020_territory_hierarchy.sql for
 * why this differs from the compound style ("PL-MZ") the table originally
 * documented.
 */

// Active markets per CLAUDE.md — extend here as new countries launch.
const COUNTRY_OPTIONS: FormFieldOption[] = [
  { title: "PL", value: "PL" },
  { title: "MX", value: "MX" },
];

const KIND_OPTIONS: FormFieldOption[] = [
  { title: "user.territories.form.kindCountry", value: "country" },
  { title: "user.territories.form.kindRegion", value: "region" },
  { title: "user.territories.form.kindCity", value: "city" },
  { title: "user.territories.form.kindVillage", value: "village" },
  { title: "user.territories.form.kindDistrict", value: "district" },
];

export const territoryFormFields: FormFieldDef[] = [
  {
    key: "name",
    type: "text",
    labelKey: "user.territories.form.name",
    required: true,
    cols: 6,
  },
  {
    key: "code",
    type: "text",
    labelKey: "user.territories.form.code",
    hint: "user.territories.form.codeHint",
    cols: 6,
  },
  {
    key: "kind",
    type: "select",
    labelKey: "user.territories.form.kind",
    options: KIND_OPTIONS,
    default: "region",
    required: true,
    cols: 6,
  },
  {
    key: "country_code",
    type: "select",
    labelKey: "user.territories.form.countryCode",
    options: COUNTRY_OPTIONS,
    required: true,
    cols: 6,
  },
  {
    key: "parent_id",
    type: "autocomplete",
    labelKey: "user.territories.form.parent",
    options: loadTerritoryOptions,
  },
];
