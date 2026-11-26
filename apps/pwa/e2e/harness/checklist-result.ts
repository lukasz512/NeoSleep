/**
 * DB-free harness for the questionnaire result block (ChecklistResult) — served
 * only by the Vite dev server, never part of `vite build`. Three fixed records
 * stacked: an oral exam with every finding + skeletal class, a mixed oral exam,
 * and a medical history with an "other" note. `?theme=dark`, `?lang=pl|mx|en`.
 */
import { createApp, defineComponent, h } from "vue";
import { createPinia } from "pinia";
import vuetify, { lightTheme, darkTheme } from "../../src/plugins/vuetify";
import { i18n, loadLocale } from "../../src/plugins/i18n";
import "../../src/styles/theme.scss";
import "../../src/styles/app-responsive.scss";
import ChecklistResult from "../../src/components/questionnaire/ChecklistResult.vue";
import type { ChecklistHistoryEntry, ChecklistRecord } from "../../src/composables/usePatientChecklist";

const params = new URLSearchParams(location.search);
vuetify.theme.change(params.get("theme") === "dark" ? darkTheme : lightTheme);
const lang = params.get("lang");
if (lang === "pl" || lang === "mx") {
  await loadLocale(lang);
  i18n.global.locale.value = lang;
}

const entry = (id: string, record: Partial<ChecklistRecord>): ChecklistHistoryEntry =>
  ({ id, type: "record", created_at: "2026-10-05T10:00:00Z", source: "staff", by: null, record }) as ChecklistHistoryEntry;

const ENTRIES = [
  entry("all", {
    kind: "oral_exam",
    has_bruxism: true,
    has_narrow_palate: true,
    has_geographic_tongue: true,
    has_xerostomia: true,
    is_mouth_breather: true,
    has_missing_teeth: true,
    has_periodontal_disease: true,
    skeletal_class: "II",
  }),
  entry("mixed", {
    kind: "oral_exam",
    has_bruxism: true,
    has_narrow_palate: false,
    has_geographic_tongue: false,
    has_xerostomia: false,
    is_mouth_breather: true,
    has_missing_teeth: false,
    has_periodontal_disease: true,
    skeletal_class: "I",
  }),
  entry("history", { kind: "medical_history", has_diabetes: true, has_hypertension: true, has_anemia: false, has_smoking: false, medical_history_other: "Asma" }),
];

const CARD = "padding:16px;border:1px solid rgba(var(--v-border-color),var(--v-border-opacity));border-radius:12px;background:rgb(var(--v-theme-surface))";

const Harness = defineComponent({
  setup() {
    return () =>
      h(
        "main",
        { style: "display:grid;gap:16px;padding:16px;max-width:640px" },
        ENTRIES.map((e) => h("section", { "data-case": e.id, style: CARD }, [h(ChecklistResult, { entry: e })]))
      );
  },
});

createApp(Harness).use(createPinia()).use(vuetify).use(i18n).mount("#app");
// Same as dialog-header.ts: the boot splash vite.config.ts injects isn't dismissed here.
document.getElementById("boot-splash")?.remove();
