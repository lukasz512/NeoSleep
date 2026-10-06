/**
 * DB-free harness for the History tab (EntityHistoryPanel, CORE-160) —
 * served only by the Vite dev server, never part of `vite build`. The API is
 * answered in the page (window.fetch stub). Example data only.
 * `?state=before` = what the API returned before CORE-160 (fields stripped,
 * no author); default = after. `?theme=dark`, `?lang=pl|en|mx` (default mx).
 */
import { createApp, h } from "vue";
import { createPinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import vuetify, { lightTheme, darkTheme } from "../../src/plugins/vuetify";
import { i18n, loadLocale } from "../../src/plugins/i18n";
import "../../src/styles/theme.scss";
import "../../src/styles/app-responsive.scss";
import EntityHistoryPanel from "../../src/components/EntityHistoryPanel.vue";
import { useAuthStore } from "../../src/stores/auth";

const params = new URLSearchParams(location.search);
vuetify.theme.change(params.get("theme") === "dark" ? darkTheme : lightTheme);
const lang = params.get("lang") ?? "mx";
if (lang === "pl" || lang === "mx") {
  await loadLocale(lang);
  i18n.global.locale.value = lang;
}
const before = params.get("state") === "before";

const today = new Date();
const at = (hour: number, minute: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate(), hour, minute).toISOString();
const staff = { user_id: "u1", user_name: "Admin Ejemplo" };
const entry = (id: string, created_at: string, action: string, entity_type: string, entity_after: Record<string, unknown> | null, extra: Record<string, unknown> = {}) => ({
  id, created_at, user_id: null, user_name: null, action, entity_type, entity_id: `${id}-entity`, entity_before: null, entity_after, actor: null, ...extra,
});

const entries = before
  ? [
      entry("e1", at(18, 40), "update", "Appointment", null),
      entry("e2", at(18, 41), "update", "Patient", null),
      entry("e3", at(12, 5), "create", "Consent", null),
      entry("e4", at(11, 30), "create", "PatientCareTeam", null, staff),
      entry("e5", at(9, 15), "create", "Appointment", { start_at: at(10, 0), status: "scheduled" }, staff),
    ]
  : [
      entry("e1", at(18, 40), "update", "Appointment", { patient_response: "confirmed" }, { entity_before: { patient_response: null }, actor: "patient" }),
      entry("e2", at(18, 41), "update", "Patient", { appointment_emails: "stopped" }, { actor: "patient" }),
      entry("e3", at(12, 5), "create", "Consent", { purpose: "informedConsent" }, { actor: "patient" }),
      entry("e4", at(11, 30), "create", "PatientCareTeam", { practitioner: "Dra. Ana Ejemplo", source: "manual" }, staff),
      entry("e5", at(9, 15), "create", "Appointment", { start_at: at(10, 0), status: "scheduled" }, staff),
    ];
entries.sort((a, b) => b.created_at.localeCompare(a.created_at));

const realFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.includes("/history")) {
    return Promise.resolve(new Response(JSON.stringify({ entries, lead_source: null }), { status: 200, headers: { "Content-Type": "application/json" } }));
  }
  return realFetch(input, init);
};

const Stub = { render: () => null };
const router = createRouter({ history: createMemoryHistory(), routes: [
  { path: "/users/:id", name: "user-detail", component: Stub },
  { path: "/:p(.*)*", component: Stub },
] });

const style = document.createElement("style");
style.textContent = `body { margin: 0; padding: 16px; background: rgb(var(--v-theme-background)); } #app { max-width: 560px; }`;
document.head.append(style);

const pinia = createPinia();
const app = createApp({ render: () => h(EntityHistoryPanel, { endpoint: "/patient/p1/history" }) });
app.use(pinia).use(router).use(vuetify).use(i18n);
useAuthStore(pinia).user = { id: "u1", email: "admin@example.com", role: "admin", name: "Admin Ejemplo" } as never;
app.mount("#app");
document.getElementById("boot-splash")?.remove();
