/**
 * DB-free harness for e2e/patient-details.spec.ts (NEO-206) — served only by
 * the Vite dev server, never part of `vite build`. Mounts the real
 * DetailViewTabs with the real PatientDetailsTab in its Details pane, inside
 * a column as wide as the page gives it (720px max, like the detail view).
 * The summary API is answered in the page (window.fetch stub).
 * `?theme=dark`, `?lang=pl|mx|en`, `?summary=empty`, `?rep=1`, `?role=admin|manager|rep|doctor`
 * (care team actions, CORE-132).
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
import { useAuthStore } from "../../src/stores/auth";
import { useConfigStore } from "../../src/stores/config";

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

// CORE-132: the care team — primary doctor, an ENT added by a visit, the former primary doctor.
const CARE_TEAM = [
  { practitioner_id: "h-1", name: "Dr. Andrzej Testerski", primary_specialty: "dentist", specialties: ["dentist"], primary: true, source: null, appointment_id: null, added_by_name: null, added_at: null },
  { practitioner_id: "h-2", name: "Dra. Lucía Fernández Ortega", primary_specialty: "ent", specialties: ["ent"], primary: false, source: "appointment", appointment_id: "a-1", added_by_name: "Ana Coordinadora", added_at: "2026-10-04T10:00:00Z" },
  { practitioner_id: "h-3", name: "Dr. Marco Ruiz", primary_specialty: "sleep_medicine", specialties: ["sleep_medicine"], primary: false, source: "former_primary", appointment_id: null, added_by_name: "Admin NeoSleep", added_at: "2026-09-20T10:00:00Z" },
];

const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }));
const realFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.includes("/summary")) return json(SUMMARY);
  if (url.includes("/care-team")) return json(CARE_TEAM);
  if (url.endsWith("/version")) return json({ version: "v1" });
  // NEO-237's ATM card: unstubbed, its 401 signs the harness user out and the care team loses its actions.
  if (url.includes("/clinical-records")) return json({ records: [] });
  if (url.includes("/api/v1/practitioner")) return json({ items: [{ id: "h-4", name: "Dr. Pablo Ortiz" }] });
  if (url.includes("/clinical-records")) return json({ records: [] });
  // Any other API call answers empty: a real request gets 401, and a 401 signs the harness user out (role gone).
  if (url.includes("/api/")) return json({ items: [] });
  return realFetch(input, init);
};

const Stub = { render: () => null };
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: "/", component: Stub }, { path: "/hcp/:id", name: "hcp-detail", component: Stub }, { path: "/calendar", name: "calendar", component: Stub }],
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

const pinia = createPinia();
const role = params.get("role") ?? (rep ? "rep" : null);
if (role) useAuthStore(pinia).user = { id: "u-1", email: "qa@neosleepcare.com", role } as NonNullable<ReturnType<typeof useAuthStore>["user"]>;
// The tenant's specialty lookup, so the care team rows show labels, not codes.
useConfigStore(pinia).options = {
  regions: [],
  organization_types: [],
  specialties: [
    { key: "dentist", value: "Dentista" },
    { key: "ent", value: "Otorrinolaringología" },
    { key: "sleep_medicine", value: "Medicina del sueño" },
  ],
} as ReturnType<typeof useConfigStore>["options"];

createApp(Harness).use(pinia).use(router).use(vuetify).use(i18n).mount("#app");
// Same as dialog-header.ts: the boot splash vite.config.ts injects isn't dismissed here.
document.getElementById("boot-splash")?.remove();
