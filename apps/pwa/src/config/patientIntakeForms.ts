import type AppIcon from "../components/AppIcon.vue";

type AppIconName = InstanceType<typeof AppIcon>["$props"]["name"];

/**
 * Icon per patient intake form key (NEO-54). The keys are @neo/documents
 * templateKeys plus "polysomnography", which the API always appends last
 * (a sleep_study record, not a document template). A key with no entry
 * here (a newly added template) falls back to the generic file icon.
 */
const INTAKE_FORM_ICONS: Record<string, AppIconName> = {
  informedConsent: "form-consent",
  historiaEndo: "form-history",
  stopBang: "form-screening",
  polysomnography: "nav-sleep-studies",
};

export function intakeFormIcon(key: string): AppIconName {
  return INTAKE_FORM_ICONS[key] ?? "file";
}

/**
 * i18n key of the short clinical abbreviation shown in the patient list's
 * Forms cell (NEO-57): CI (consentimiento informado), HE (Historia Endo),
 * SB (STOP-BANG), PSG (polysomnography) — terms clinicians already use, so
 * the row reads like a chart, not an icon row. Keys not listed here fall
 * back to initials of the form's own label (see PatientIntakeForms.vue).
 */
const INTAKE_FORM_ABBR_KEYS: Record<string, string> = {
  informedConsent: "app.patients.forms.abbr.informedConsent",
  historiaEndo: "app.patients.forms.abbr.historiaEndo",
  stopBang: "app.patients.forms.abbr.stopBang",
  polysomnography: "app.patients.forms.abbr.polysomnography",
};

export function intakeFormAbbrKey(key: string): string | undefined {
  return INTAKE_FORM_ABBR_KEYS[key];
}

/** "Informed consent" -> "IC"; at most 3 letters, for templates without an abbreviation of their own. */
export function initialsAbbr(label: string): string {
  return label
    .split(/[\s\-_/]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .join("")
    .slice(0, 3);
}
