import type { FormFieldDef } from "../../types/formField";
import { PHONE_MIN_DIGITS, phoneDigitCount } from "../../utils/phone";
import { useAuthStore } from "../../stores/auth";

/**
 * Shared "Identity" field group — prefix+first name, last name, email, phone —
 * reused by every entity where a person is created/edited (lead, patient,
 * practitioner/HCP, user). Organization/HCO has no person and does not use this.
 *
 * Exported as a factory (not a plain constant array) so every consumer gets
 * its own fresh FormFieldDef objects rather than aliasing one shared array —
 * matches the "plain function, no params" convention already used by loaders
 * like userForm.ts's loadRegionOptions().
 */

// Same shape enforced server-side (see EMAIL_REGEX in apps/api/src/commands/*.ts)
// — kept in sync manually since the two runtimes don't share code.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Exported for the one other place outside FormRenderer that needs the same
 * email format check (OrthoApneaOrderWizard's alternative-address sub-form —
 * a bespoke multi-step form, not FormRenderer-driven, so it can't go through
 * rulesFor()'s automatic i18n-key translation and must translate the
 * returned key itself). Returns the raw i18n key on failure, same as before. */
export function emailFormatRule(v: unknown): true | string {
  const s = String(v ?? "").trim();
  if (!s) return true;
  return EMAIL_REGEX.test(s) || "app.identity.form.validation.emailInvalid";
}

function phoneMinDigitsRule(v: unknown): true | string {
  const s = String(v ?? "").trim();
  if (!s) return true;
  return phoneDigitCount(s) >= PHONE_MIN_DIGITS || "app.identity.form.validation.phoneMinDigits";
}

/**
 * The one email input used across the whole PWA — 'at' icon (with the
 * insert-@ helper button, see FormRenderer.vue's insertAtSign()) plus format
 * validation. `required` defaults to true (identityFields' usual case);
 * pass `false` for entities where an email is optional (e.g. hcoForm's
 * organization contact email).
 */
export function emailField(required = true): FormFieldDef {
  return {
    key: "email",
    type: "email",
    labelKey: "app.identity.form.email",
    required,
    placeholder: "app.identity.form.emailPlaceholder",
    icon: "at",
    rules: [emailFormatRule],
    cols: 12,
  };
}

const PREFIX_OPTIONS = [
  { title: "app.identity.form.prefixDr", value: "Dr." },
  { title: "app.identity.form.prefixDra", value: "Dra." },
  { title: "app.identity.form.prefixProf", value: "Prof." },
  { title: "app.identity.form.prefixProfa", value: "Profa." },
  { title: "app.identity.form.prefixLic", value: "Lic." },
  { title: "app.identity.form.prefixLicda", value: "Licda." },
  { title: "app.identity.form.prefixMgr", value: "Mgr." },
  { title: "app.identity.form.prefixSr", value: "Sr." },
  { title: "app.identity.form.prefixSra", value: "Sra." },
  { title: "app.identity.form.prefixPan", value: "Pan" },
  { title: "app.identity.form.prefixPani", value: "Pani" },
];

/**
 * Salutations follow the person's market, not the UI language: Polish ones
 * for PL (where Dr./Prof./Mgr. are the same for women and men, and only
 * Pan/Pani carry a sex), Spanish ones everywhere else (MX today).
 */
export type SalutationMarket = "pl" | "es";

const SALUTATIONS_BY_MARKET: Record<SalutationMarket, readonly string[]> = {
  pl: ["Pan", "Pani", "Dr.", "Prof.", "Mgr."],
  es: ["Dr.", "Dra.", "Prof.", "Profa.", "Lic.", "Licda.", "Sr.", "Sra."],
};

/**
 * Masculine/feminine forms of the same salutation, per market — the patient
 * form keeps salutation and sex in step through these (patientForm.ts's
 * patientFormDerive). Salutations missing here are the same for both sexes.
 */
export const GENDERED_SALUTATIONS: Record<SalutationMarket, readonly { male: string; female: string }[]> = {
  pl: [{ male: "Pan", female: "Pani" }],
  es: [
    { male: "Dr.", female: "Dra." },
    { male: "Prof.", female: "Profa." },
    { male: "Lic.", female: "Licda." },
    { male: "Sr.", female: "Sra." },
  ],
};

/** The form's own country (patient/lead carry `country_code`), else the signed-in user's. */
export function salutationMarket(form: Record<string, unknown>): SalutationMarket {
  const own = typeof form.country_code === "string" ? form.country_code : "";
  const country = own || useAuthStore().user?.country_code || "";
  return country.toUpperCase() === "PL" ? "pl" : "es";
}

/** Raw prefix values only — utils/initials.ts strips these before deriving
 *  avatar initials from a full "Dra. Lorena González" identity name. */
export const SALUTATION_PREFIXES: readonly string[] = PREFIX_OPTIONS.map((o) => o.value);

export function identityFields(): FormFieldDef[] {
  return [
    {
      key: "title",
      type: "combobox",
      labelKey: "app.identity.form.prefix",
      options: PREFIX_OPTIONS,
      optionFilter: (o, form) => SALUTATIONS_BY_MARKET[salutationMarket(form)].includes(String(o.value)),
      cols: 2,
    },
    {
      key: "first_name",
      type: "text",
      labelKey: "app.identity.form.firstName",
      required: true,
      cols: 10,
    },
    {
      key: "last_name",
      type: "text",
      labelKey: "app.identity.form.lastName",
      required: true,
      cols: 12,
    },
    emailField(),
    {
      key: "phone",
      type: "phone",
      labelKey: "app.identity.form.phone",
      required: true,
      rules: [phoneMinDigitsRule],
      cols: 12,
    },
  ];
}
