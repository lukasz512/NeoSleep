/**
 * DB-free harness for e2e/patient-details.spec.ts (NEO-206) — served only by
 * the Vite dev server, never part of `vite build`. Mounts the real
 * DetailViewTabs with the real PatientDetailsTab in its Details pane, inside
 * a column as wide as the page gives it (720px max, like the detail view).
 * The summary API is answered in the page (window.fetch stub).
 * `?theme=dark`, `?lang=pl|mx|en`, `?summary=empty`, `?rep=1`.
 */
import { createApp, defineComponent, h, ref } from "vue";
import { createPinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import vuetify, { lightTheme, darkTheme } from "../../src/plugins/vuetify";
import { i18n, loadLocale } from "../../src/plugins/i18n";
import "../../src/styles/theme.scss";
import "../../src/styles/app-responsive.scss";
import DetailViewTabs from "../../src/components/DetailViewTabs.vue";
import PatientDetailsTab from "../../src/components/patient/PatientDetailsTab.vue";

const params = new URLSearchParams(location.search);
vuetify.theme.change(params.get("theme") === "dark" ? darkTheme : lightTheme);
const lang = params.get("lang");
if (lang === "pl" || lang === "mx") {
  await loadLocale(lang);
  i18n.global.locale.value = lang;
}
const empty = params.get("summary") === "empty";
const rep = params.get("rep") === "1";

const SUMMARY = empty
  ? { preferred_name: null, shipping_address: null, data_consent_at: null, data_consent_withdrawn_at: null, latest_study: null, device_order: null, next_appointment: null }
  : {
      preferred_name: "Mafer",
      shipping_address: { line1: "Av. Presidente Masaryk 111, Polanco V Sección", city: "Ciudad de México", postal_code: "11560" },
      data_consent_at: "2026-09-03T10:00:00Z",
      data_consent_withdrawn_at: null,
      latest_study: rep ? null : { id: "s-1", study_date: "2026-09-12", ahi_score: 22.4, spo2_nadir: 84, odi: 19, diagnosis_code: null },
      device_order: { status: "active", metadata: null, order_sync_status: "synced", appliance_delivered_at: null },
      next_appointment: { id: "a-1", start_at: "2026-10-09T15:30:00Z" },
    };

const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }));
const realFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.includes("/summary")) return json(SUMMARY);
  return realFetch(input, init);
};

const Stub = { render: () => null };
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: "/", component: Stub }, { path: "/hcp/:id", name: "hcp-detail", component: Stub }],
});

const TABS = [
  { value: "details", labelKey: "app.patients.detail.tabs.details" },
  { value: "notes", labelKey: "app.patients.detail.tabs.notes" },
  { value: "documents", labelKey: "app.patients.detail.tabs.documents" },
  { value: "studies", labelKey: "app.patients.detail.tabs.studies" },
  { value: "orthoapnea", labelKey: "app.patients.detail.tabs.orthoapnea" },
  { value: "history", labelKey: "app.patients.detail.tabs.history" },
];

const Harness = defineComponent({
  setup() {
    const tab = ref("details");
    return () =>
      h("main", { class: "harness-page" }, [
        h(
          DetailViewTabs,
          { modelValue: tab.value, tabs: TABS, "onUpdate:modelValue": (v: string) => (tab.value = v) },
          {
            details: () =>
              h(PatientDetailsTab, {
                patient: {
                  id: "p-1", email: "mafer.lopez.ruiz@correo-largo-ejemplo.mx", phone: "+52 55 1234 5678", status: "active", region: "mx",
                  territory_path: [{ id: "t1", name: "México", code: "mx", kind: "country" }, { id: "t2", name: "CDMX", code: "cdmx", kind: "city" }, { id: "t3", name: "Polanco", code: "polanco", kind: "zone" }],
                  practitioner_id: "h-1", practitioner_name: "Dr. Andrzej Testerski", practitioner_specialty: "dentist", practitioner_specialties: ["dentist"],
                  ahi_baseline: 18, cpap_device: null, medical_record: null, created_at: "2026-09-02T10:00:00Z",
                  diagnosis_code: empty ? null : { code: "G47.33", label: "Apnea obstructiva del sueño, moderada" },
                },
                canSeeStudies: !rep,
                "onOpen-tab": (v: string) => (tab.value = v),
              }),
          },
        ),
      ]);
  },
});

const style = document.createElement("style");
style.textContent = `
  body { margin: 0; background: rgb(var(--v-theme-surface)); color: rgb(var(--v-theme-on-surface)); }
  /* The phone chip row bleeds out by --page-gutter, so the page pads by exactly that, like AppLayout. */
  .harness-page { padding: 16px var(--page-gutter, 20px); max-width: 720px; }
`;
document.head.append(style);

createApp(Harness).use(createPinia()).use(router).use(vuetify).use(i18n).mount("#app");
// Same as dialog-header.ts: the boot splash vite.config.ts injects isn't dismissed here.
document.getElementById("boot-splash")?.remove();
