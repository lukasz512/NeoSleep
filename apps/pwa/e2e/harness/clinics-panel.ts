/**
 * DB-free harness for the doctor's clinics (affiliations) panel (NEO-17,
 * shown to admin since NEO-210) — served only by the Vite dev server, never
 * part of `vite build`. Mounts the real PractitionerClinicsPanel as an admin;
 * the API is answered in the page (window.fetch stub). Example data only.
 * `?theme=dark`, `?lang=pl|en|mx` (default mx).
 */
import { createApp, h } from "vue";
import { createPinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import vuetify, { lightTheme, darkTheme } from "../../src/plugins/vuetify";
import { i18n, loadLocale } from "../../src/plugins/i18n";
import "../../src/styles/theme.scss";
import "../../src/styles/app-responsive.scss";
import PractitionerClinicsPanel from "../../src/components/practitioner/PractitionerClinicsPanel.vue";
import { useAuthStore } from "../../src/stores/auth";
import type { OrganizationAffiliation } from "../../src/types/practitionerOrganization";

const params = new URLSearchParams(location.search);
vuetify.theme.change(params.get("theme") === "dark" ? darkTheme : lightTheme);
const lang = params.get("lang") ?? "mx";
if (lang === "pl" || lang === "mx") {
  await loadLocale(lang);
  i18n.global.locale.value = lang;
}

const organizations: OrganizationAffiliation[] = [
  { id: "aff-1", organization_id: "org-1", name: "Centro Dental Ejemplo", type: "clinic", address_line1: "Calle Ejemplo 10", city: "Ciudad de México", role: null, is_primary: true },
  { id: "aff-2", organization_id: "org-2", name: "Clínica Ejemplo Norte", type: "clinic", address_line1: "Av. Ejemplo 200", city: "Toluca", role: null, is_primary: false },
];

const json = (b: unknown) => Promise.resolve(new Response(JSON.stringify(b), { status: 200, headers: { "Content-Type": "application/json" } }));
const realFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.includes("/api/v1/organization")) {
    return json({ data: [{ id: "org-3", name: "Hospital Ejemplo Sur" }, ...organizations.map((o) => ({ id: o.organization_id, name: o.name }))], total: 3 });
  }
  return realFetch(input, init);
};

const Stub = { render: () => null };
const router = createRouter({ history: createMemoryHistory(), routes: [
  { path: "/hco/:id", name: "hco-detail", component: Stub },
  { path: "/:p(.*)*", component: Stub },
] });

const style = document.createElement("style");
style.textContent = `body { margin: 0; padding: 16px; background: rgb(var(--v-theme-background)); } #app { max-width: 560px; }`;
document.head.append(style);

const pinia = createPinia();
const app = createApp({
  render: () => h(PractitionerClinicsPanel, { practitionerId: "pr-1", organizations, myPrimaryOrganizationId: null }),
});
app.use(pinia).use(router).use(vuetify).use(i18n);
useAuthStore(pinia).user = { id: "u1", email: "admin@example.com", role: "admin", name: "Admin Ejemplo" } as never;
app.mount("#app");
document.getElementById("boot-splash")?.remove();
