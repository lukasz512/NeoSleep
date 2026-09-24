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
