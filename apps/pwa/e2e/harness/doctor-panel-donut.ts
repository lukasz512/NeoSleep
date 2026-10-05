/**
 * DB-free harness for e2e/doctor-panel-ring.spec.ts — served only by the Vite dev
 * server. Mounts the real DoctorPanel; its three requests are answered in the page
 * (window.fetch stub) after `?delay=` ms (default 400), so the skeleton shows first.
 */
import { createApp, defineComponent, h } from "vue";
import { createPinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import vuetify, { lightTheme } from "../../src/plugins/vuetify";
import { i18n } from "../../src/plugins/i18n";
import "../../src/styles/theme.scss";
import DoctorPanel from "../../src/components/doctorPanel/DoctorPanel.vue";

vuetify.theme.change(lightTheme);

const delay = Number(new URLSearchParams(location.search).get("delay") ?? 400);

const BODIES: Record<string, unknown> = {
  "/api/v1/doctor-panel/actions": { enabled: true, items: [] },
  "/api/v1/doctor-panel/summary": {
    enabled: true,
    stages: { intake: 6, study: 0, results: 1, plan: 2, treatment: 0 },
    incomplete: [],
  },
  "/api/v1/appointments": { items: [] },
};

window.fetch = async (input: RequestInfo | URL) => {
  const path = new URL(String(input instanceof Request ? input.url : input), location.origin).pathname;
  await new Promise((resolve) => setTimeout(resolve, delay));
  return new Response(JSON.stringify(BODIES[path] ?? {}), { status: 200, headers: { "Content-Type": "application/json" } });
};

const Stub = { render: () => null };
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: "/", name: "dashboard", component: DoctorPanel },
    ...["patients", "calendar", "treatment-plans"].map((name) => ({ path: `/${name}`, name, component: Stub })),
    { path: "/patients/:id", name: "patient-detail", component: Stub },
  ],
});

const Harness = defineComponent({
  setup() {
    return () => h("div", { "data-testid": "harness", style: "padding:0 16px;background:#fff" }, [h(DoctorPanel)]);
  },
});

void router.push("/").then(() => createApp(Harness).use(createPinia()).use(router).use(i18n).use(vuetify).mount("#app"));
