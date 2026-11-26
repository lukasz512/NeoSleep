import type { FormFieldDef, FormFieldOption } from "../../types/formField";
import { useAuthStore } from "../../stores/auth";
import { useConfigStore } from "../../stores/config";

/**
 * Country + language of an identity (CORE-261). identities.language is the one
 * source of the language of every email and notification the person gets, so
 * the field is visible and editable on the user, HCP and patient forms. A
 * doctor who is also a user is one identity: a change on one screen shows on
 * the other.
 *
 * Who may change them is enforced by the API (admin, manager, a patient's
 * doctor); the fields are hidden for everyone else so nobody sees a control
 * that would answer 403.
 */

/** Languages the app can write mail and notifications in (packages/i18n locale ids). */
export const LANGUAGE_OPTIONS: FormFieldOption[] = [
  { title: "app.language.en", value: "en" },
  { title: "app.language.pl", value: "pl" },
  { title: "app.language.mx", value: "mx" },
];

/** Same mapping as the API's localeForCountry: PL -> pl, MX -> mx, anything else en. */
export function languageForCountry(country: string | null | undefined): string {
  const code = (country ?? "").trim().toUpperCase();
  if (code === "PL") return "pl";
  if (code === "MX") return "mx";
  return "en";
}

/** Roles that may change a person's country and language (mirrors the API check). */
export function canEditLocale(): boolean {
  const role = useAuthStore().user?.role;
  return role === "admin" || role === "manager" || role === "doctor";
}

async function loadRegionOptions(): Promise<FormFieldOption[]> {
  const configStore = useConfigStore();
  if (configStore.options.regions.length === 0) {
    await configStore.loadOptions();
  }
  return configStore.regionItems;
}

/** The visible Country field. */
export function countryField(labelKey: string): FormFieldDef {
  return {
    key: "region",
    section: "territory",
    type: "autocomplete",
    labelKey,
    options: loadRegionOptions,
    hint: "app.localeFields.countryHint",
    hidden: () => !canEditLocale(),
    cols: 6,
  };
}

/** The visible Language field. */
export function languageField(labelKey: string): FormFieldDef {
  return {
    key: "language",
    section: "territory",
    type: "select",
    labelKey,
    options: LANGUAGE_OPTIONS,
    hint: "app.localeFields.languageHint",
    default: () => languageForCountry(useAuthStore().user?.region),
    hidden: () => !canEditLocale(),
    cols: 6,
  };
}
