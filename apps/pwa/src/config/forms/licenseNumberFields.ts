import type { FormFieldDef } from "../../types/formField";
import { isValidLicenseNumber, licenseCountryForRegion } from "@documents-browser";

/**
 * Professional licence number fields — PL "numer PWZ" / MX "cédula
 * profesional" (NEO-51). Two sibling fields rather than one, because
 * FormFieldRule only receives the field's own value (types/formField.ts) and
 * the two countries validate differently; each field is shown only when the
 * form's `region` matches its country. Validation is the same code the API
 * runs (packages/documents/src/browser/licenseNumber.ts).
 *
 * The keys are the literal `national_ids` JSONB keys ("pwz"/"cedula") — the
 * same keys practitioner.national_ids stores, so `nestUnder: "national_ids"`
 * round-trips without a mapping layer.
 */

function regionIs(country: "PL" | "MX") {
  return (form: Record<string, unknown>) =>
    licenseCountryForRegion(typeof form.region === "string" ? form.region : null) === country;
}

function pwzRule(v: unknown): true | string {
  const s = String(v ?? "").trim();
  if (!s) return true;
  return isValidLicenseNumber("PL", s) || "app.identity.form.validation.pwzInvalid";
}

function cedulaRule(v: unknown): true | string {
  const s = String(v ?? "").trim();
  if (!s) return true;
  return isValidLicenseNumber("MX", s) || "app.identity.form.validation.cedulaInvalid";
}

export function licenseNumberFields(options: {
  nestUnder: string;
  required?: boolean;
  /** Extra hide condition on top of the region check (e.g. patient-type leads). */
  hiddenWhen?: (form: Record<string, unknown>) => boolean;
}): FormFieldDef[] {
  const extraHidden = options.hiddenWhen ?? (() => false);
  const isPl = (form: Record<string, unknown>) => regionIs("PL")(form) && !extraHidden(form);
  const isMx = (form: Record<string, unknown>) => regionIs("MX")(form) && !extraHidden(form);
  return [
    {
      key: "pwz",
      type: "text",
      labelKey: "app.identity.form.pwz",
      hint: "app.identity.form.pwzHint",
      icon: "id-card",
      nestUnder: options.nestUnder,
      hidden: (form) => !isPl(form),
      required: (form) => Boolean(options.required) && isPl(form),
      rules: [pwzRule],
      cols: 12,
    },
    {
      key: "cedula",
      type: "text",
      labelKey: "app.identity.form.cedula",
      hint: "app.identity.form.cedulaHint",
      icon: "id-card",
      nestUnder: options.nestUnder,
      hidden: (form) => !isMx(form),
      required: (form) => Boolean(options.required) && isMx(form),
      rules: [cedulaRule],
      cols: 12,
    },
  ];
}
