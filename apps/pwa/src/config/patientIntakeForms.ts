import type AppIcon from "../components/AppIcon.vue";
import { documentLabelKey } from "../utils/documentLabels";

type AppIconName = InstanceType<typeof AppIcon>["$props"]["name"];

/**
 * Icon per patient intake form key (NEO-54). The keys are @neo/documents
 * templateKeys plus "polysomnography", which the API always appends last
 * (a sleep_study record, not a document template). A key with no entry
 * here (a newly added template) falls back to the generic file icon.
 */
const INTAKE_FORM_ICONS: Record<string, AppIconName> = {
  informedConsent: "form-consent",
  medicalHistory: "form-history",
  stopBang: "form-screening",
  oralExam: "specialty-dentist",
  historiaEndo: "form-history",
  polysomnography: "nav-sleep-studies",
};

export function intakeFormIcon(key: string): AppIconName {
  return INTAKE_FORM_ICONS[key] ?? "file";
}

/**
 * i18n key of the short clinical abbreviation shown in the patient list's
 * Forms cell (NEO-57): CI (consentimiento informado), AM (medical history),
 * EO (oral exam), HC (Historia Clínica),
 * SB (STOP-BANG), PSG (polysomnography) — terms clinicians already use, so
 * the row reads like a chart, not an icon row. Keys not listed here fall
 * back to initials of the form's own label (see PatientIntakeForms.vue).
 */
const INTAKE_FORM_ABBR_KEYS: Record<string, string> = {
  informedConsent: "app.patients.forms.abbr.informedConsent",
  medicalHistory: "app.patients.forms.abbr.medicalHistory",
  oralExam: "app.patients.forms.abbr.oralExam",
  historiaEndo: "app.patients.forms.abbr.historiaEndo",
  stopBang: "app.patients.forms.abbr.stopBang",
  polysomnography: "app.patients.forms.abbr.polysomnography",
};

export function intakeFormAbbrKey(key: string): string | undefined {
  return INTAKE_FORM_ABBR_KEYS[key];
}

/** Tiles per row in the patient list's Documents / Studies cells — at most 2 rows (NEO-221; mirrored in PatientIntakeForms.vue's grid). */
export const INTAKE_TILES_PER_ROW = 3;

type Translate = (key: string) => string;

/** The form's own title, or its key when the template has none. */
export function intakeFormLabel(t: Translate, key: string): string {
  // Same fallback as DocumentsView's documentLabel(): te() misses these flat dotted keys, so compare t()'s output instead.
  const labelKey = documentLabelKey(key);
  const translated = labelKey ? t(labelKey) : "";
  return translated && translated !== labelKey ? translated : key;
}

/** Clinical abbreviation (CI / HC / SB / PSG), or initials of the form's label for a template without one. */
export function intakeFormAbbr(t: Translate, key: string): string {
  const abbrKey = intakeFormAbbrKey(key);
  const translated = abbrKey ? t(abbrKey) : "";
  return translated && translated !== abbrKey ? translated : initialsAbbr(intakeFormLabel(t, key));
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
