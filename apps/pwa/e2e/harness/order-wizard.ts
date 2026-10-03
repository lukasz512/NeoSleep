/**
 * DB-free harness for the device order wizard (NEO-213 / CORE-95) — served
 * only by the Vite dev server, never part of `vite build`. Mounts the real
 * OrthoApneaOrderWizard open on a patient; the API is answered in the page
 * (window.fetch stub), the same way as patient-aside.ts.
 * `?theme=dark`, `?lang=pl|en` (default mx), `?hco=incomplete` (the doctor's
 * clinic has no phone or postal code), `?hco=none` (no clinic at all),
 * `?role=doctor` (signed in as the doctor: no step 1, NEO-210).
 */
import { createApp, defineComponent, h, ref } from "vue";
import { createPinia } from "pinia";
import { useAuthStore } from "../../src/stores/auth";
import { createRouter, createMemoryHistory } from "vue-router";
import vuetify, { lightTheme, darkTheme } from "../../src/plugins/vuetify";
import { i18n, loadLocale } from "../../src/plugins/i18n";
import "../../src/styles/theme.scss";
import "../../src/styles/app-responsive.scss";
import OrthoApneaOrderWizard from "../../src/components/patient/OrthoApneaOrderWizard.vue";

const params = new URLSearchParams(location.search);
vuetify.theme.change(params.get("theme") === "dark" ? darkTheme : lightTheme);
const lang = params.get("lang") ?? "mx";
if (lang === "pl" || lang === "mx") {
  await loadLocale(lang);
  i18n.global.locale.value = lang;
}

const HCO = {
  organizationId: "org-1",
  name: "Clínica Dental Reforma",
  address: "Av. Paseo de la Reforma 222, Col. Juárez",
  city: "Ciudad de México",
  postalCode: "06600",
  countryCode: "MX",
  phone: "+52 55 1234 5678",
  email: "recepcion@clinicareforma.mx",
};
const hcoMode = params.get("hco");
const context =
  hcoMode === "none"
    ? { delivery: null, deliveryIssues: [{ path: "delivery", code: "required" }] }
    : hcoMode === "incomplete"
      ? {
          delivery: { ...HCO, phone: "", postalCode: "" },
          deliveryIssues: [
            { path: "delivery.postalCode", code: "required" },
            { path: "delivery.phone", code: "required" },
          ],
        }
      : { delivery: HCO, deliveryIssues: [] };

const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }));
const realFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.includes("/api/v1/partners/orthoapnea/products")) {
    return json({ items: [{ id: 3, code: "002", nameEs: "NOA", category: "APNEA_SNORE" }, { id: 4, code: "003", nameEs: "NOA TMJ", category: "APNEA_SNORE" }] });
  }
  if (url.includes("/api/v1/practitioner")) return json({ items: [{ id: "hcp-1", name: "Dr. Andrzej Testerski" }] });
  if (url.includes("/api/v1/patient/")) return json({ id: "p-1", practitioner_id: "hcp-1", region: "MX" });
  if (url.includes("/api/v1/device-orders/context")) return json({ ...context, dentistId: "hcp-1", minDesiredDate: "2026-10-19", rulesVersion: "2026-10-03.1" });
  return realFetch(input, init);
};

const Stub = { render: () => null };
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: "/", component: Stub },
    { path: "/hcp/:id", name: "hcp-detail", component: Stub },
    { path: "/hco/:id", name: "hco-detail", component: Stub },
  ],
});

const Harness = defineComponent({
  setup() {
    // Opened after mount: the wizard loads doctors/products/context on its closed → open transition.
    const open = ref(false);
    setTimeout(() => (open.value = true), 0);
    return () =>
      h(OrthoApneaOrderWizard, {
        modelValue: open.value,
        "onUpdate:modelValue": (v: boolean) => (open.value = v),
        patientId: "p-1",
        sleepStudyId: "s-1",
        draftPlan: null,
      });
  },
});

const style = document.createElement("style");
style.textContent = `body { margin: 0; background: rgb(var(--v-theme-surface)); }`;
document.head.append(style);

const pinia = createPinia();
// `?role=doctor`: a doctor skips step 1 and orders for their own clinic (NEO-210).
useAuthStore(pinia).$patch({ user: { id: "u-1", email: "doctor@example.com", role: params.get("role") ?? "admin" } as never });
createApp(Harness).use(pinia).use(router).use(vuetify).use(i18n).mount("#app");
// Same as dialog-header.ts: the boot splash vite.config.ts injects isn't dismissed here.
document.getElementById("boot-splash")?.remove();
