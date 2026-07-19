import type { FormFieldDef } from "../../types/formField";
import { PHONE_MIN_DIGITS, phoneDigitCount } from "../../utils/phone";

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

function emailFormatRule(v: unknown): true | string {
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
  { title: "app.identity.form.prefixLic", value: "Lic." },
  { title: "app.identity.form.prefixMgr", value: "Mgr." },
  { title: "app.identity.form.prefixSr", value: "Sr." },
  { title: "app.identity.form.prefixSra", value: "Sra." },
];

export function identityFields(): FormFieldDef[] {
  return [
    {
      key: "title",
      type: "combobox",
      labelKey: "app.identity.form.prefix",
      options: PREFIX_OPTIONS,
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
