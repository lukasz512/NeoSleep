/**
 * DB-free harness for e2e/device-orders.spec.ts (NEO-217) — served only by the
 * Vite dev server, never part of `vite build`. Mounts the real
 * PatientOrthoApneaPanel (Dispositivo tab) with three orders: the newest one
 * in the state picked by `?case=ordered|draft|attention|received` (default
 * ordered), then a received and a cancelled one. The API is answered in the
 * page (window.fetch stub). `?theme=dark`, `?lang=pl|mx|en`, `?role=rep`
 * (default admin, who gets the ⋯ menu), `?comments=tp-1` (opened from the
 * Panel link), `?view=dashboard` (the admin Panel's comments card instead).
 */
import { createApp, defineComponent, h } from "vue";
import { createPinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import vuetify, { lightTheme, darkTheme } from "../../src/plugins/vuetify";
import { i18n, loadLocale } from "../../src/plugins/i18n";
import "../../src/styles/theme.scss";
import "../../src/styles/app-responsive.scss";
import { useAuthStore } from "../../src/stores/auth";
import PatientOrthoApneaPanel from "../../src/components/patient/PatientOrthoApneaPanel.vue";
import DeviceOrderCommentsCard from "../../src/components/dashboard/DeviceOrderCommentsCard.vue";

const params = new URLSearchParams(location.search);
vuetify.theme.change(params.get("theme") === "dark" ? darkTheme : lightTheme);
const lang = params.get("lang");
if (lang === "pl" || lang === "mx") {
  await loadLocale(lang);
  i18n.global.locale.value = lang;
}
const newest = params.get("case") ?? "ordered";

const DENTIST = {
  dentist_id: "h-1", dentist_name: "Dra. Lorena Alejandra González Pimentel", dentist_specialty: null, dentist_specialties: [],
};
function plan(id: string, over: Record<string, unknown>) {
  return {
    id, ...DENTIST, appointment_at: null, scan_ordered_at: null, scan_received_at: null, scan_file_url: null,
    appliance_ordered_at: null, appliance_delivered_at: null, notes: null, status: "initiated", metadata: null,
    order_number: null, order_sync_status: null, order_sent_at: null,
    created_at: "2026-10-01T09:00:00Z", updated_at: "2026-10-03T10:42:00Z", ...over,
  };
}
const FIRST: Record<string, Record<string, unknown>> = {
  ordered: { order_number: "454012", order_sync_status: "synced", order_sent_at: "2026-10-03T10:42:00Z" },
  draft: { metadata: { orthoapneaDraft: { step: 2 } } },
  attention: { order_sync_status: "failed", order_sent_at: "2026-10-03T10:42:00Z" },
  received: { order_number: "454012", order_sync_status: "synced", order_sent_at: "2026-10-03T10:42:00Z", status: "completed", appliance_delivered_at: "2026-10-14" },
};
const PLANS = [
  plan("tp-1", FIRST[newest] ?? FIRST.ordered!),
  plan("tp-2", {
    order_number: "453880", order_sync_status: "synced", order_sent_at: "2026-09-13T12:00:00Z", status: "completed",
    appliance_delivered_at: "2026-09-24", created_at: "2026-09-12T09:00:00Z",
  }),
  plan("tp-3", {
    ...DENTIST, dentist_name: "Dr. Mario Salas Vega", order_number: "452117", order_sync_status: "synced",
    order_sent_at: "2026-07-20T12:00:00Z", status: "cancelled", created_at: "2026-07-19T09:00:00Z", updated_at: "2026-08-02T09:00:00Z",
  }),
];
const NOTE = {
  id: "n1", entity_type: "treatment_plan", entity_id: "tp-1", author_id: "u-1", author_name: "Ana Ruiz", created_at: "2026-10-03T10:40:00Z",
  body: "Paciente prefiere color transparente.",
};

/** The admin Panel's list (`?view=dashboard`): newest first, across patients. */
const RECENT = [
  { ...NOTE, id: "c1", treatment_plan_id: "tp-1", patient_id: "p-1", patient_name: "María Fernanda Ríos Ochoa", order_number: "454012", created_at: "2026-10-03T16:05:00Z", body: "El laboratorio pide confirmar la mordida constructiva antes del lunes; llamar a la Dra. González." },
  { ...NOTE, id: "c2", treatment_plan_id: "tp-9", patient_id: "p-2", patient_name: "José Luis Hernández", order_number: "453990", author_name: "Dra. Lorena González", created_at: "2026-10-02T11:20:00Z", body: "OK, confirmado." },
  { ...NOTE, id: "c3", treatment_plan_id: "tp-8", patient_id: "p-3", patient_name: "Carmen Aguilar Soto", order_number: null, created_at: "2026-09-30T09:00:00Z", body: "Paciente prefiere color transparente." },
];

const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }));
const realFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.includes("/api/v1/treatment-plan?")) return json({ items: PLANS, total: PLANS.length });
  if (url.includes("/sleep-study-ref")) return json({ id: "ss-1" });
  if (url.includes("/api/v1/note/device-orders/recent")) return json({ items: RECENT });
  if (url.includes("/comments") || url.includes("/api/v1/note")) return json({ items: [NOTE], total: 1 });
  return realFetch(input, init);
};

const Stub = { render: () => null };
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: "/", component: Stub },
    { path: "/hcp/:id", name: "hcp-detail", component: Stub },
    { path: "/patients/:id", name: "patient-detail", component: Stub },
  ],
});
// `?comments=tp-1` stands in for the Panel link's query on the patient page.
await router.push({ path: "/", query: params.get("comments") ? { comments: params.get("comments")! } : {} });

const Harness = defineComponent({
  setup() {
    const view = params.get("view") === "dashboard" ? h(DeviceOrderCommentsCard) : h(PatientOrthoApneaPanel, { patientId: "p-1" });
    return () => h("main", { class: "harness-main", "data-testid": "panel" }, [view]);
  },
});

// The patient detail's content column: up to 720px, 16px gutters on a phone.
const style = document.createElement("style");
style.textContent = `
  body { margin: 0; background: rgb(var(--v-theme-surface)); color: rgb(var(--v-theme-on-surface)); }
  .harness-main { max-width: 720px; padding: 16px; }
`;
document.head.append(style);

const pinia = createPinia();
const auth = useAuthStore(pinia);
auth.user = { id: "u-1", email: "qa@example.com", name: "QA", role: params.get("role") ?? "admin" } as typeof auth.user;

createApp(Harness).use(pinia).use(router).use(vuetify).use(i18n).mount("#app");
// Same as dialog-header.ts: the boot splash vite.config.ts injects isn't dismissed here.
document.getElementById("boot-splash")?.remove();
