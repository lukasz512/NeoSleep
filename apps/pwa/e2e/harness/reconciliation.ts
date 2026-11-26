/**
 * DB-free harness for the device-order reconciliation card (NEO-218) — served
 * only by the Vite dev server, never part of `vite build`. Mounts the real
 * DeviceOrderReconciliationCard; the API is answered in the page (window.fetch
 * stub), the same way as order-wizard.ts. Example data only (no real patients).
 * `?state=never|ok|mismatch|failed`, `?mode=counter` (manager), `?theme=dark`,
 * `?lang=pl|en` (default pl).
 */
import { createApp, h } from "vue";
import { createPinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import vuetify, { lightTheme, darkTheme } from "../../src/plugins/vuetify";
import { i18n, loadLocale } from "../../src/plugins/i18n";
import "../../src/styles/theme.scss";
import "../../src/styles/app-responsive.scss";
import DeviceOrderReconciliationCard from "../../src/components/DeviceOrderReconciliationCard.vue";

const params = new URLSearchParams(location.search);
vuetify.theme.change(params.get("theme") === "dark" ? darkTheme : lightTheme);
const lang = params.get("lang") ?? "pl";
if (lang === "pl" || lang === "mx") {
  await loadLocale(lang);
  i18n.global.locale.value = lang;
}
const state = params.get("state") ?? "mismatch";
const mode = params.get("mode") === "counter" ? "counter" : "full";

const finishedAt = "2026-10-04T13:00:05Z";
const item = (reason: string, externalId: string, extra: Record<string, unknown> = {}) => ({
  reason,
  externalId,
  treatmentPlanId: null,
  patientId: null,
  patientName: null,
  labStatus: "1",
  requestDate: "2026-10-03T17:33:29",
  drift: [],
  ...extra,
});
const RUNS: Record<string, unknown> = {
  never: { environment: "prod", counter: null, run: null },
  ok: {
    environment: "prod",
    counter: { status: "ok", matchLevel: 1, matched: 3, mismatches: 0, finishedAt },
    run: {
      id: "r-ok",
      trigger: "scheduled",
      status: "ok",
      summary: { oursSent: 3, labTotal: 4, matched: 3, mismatches: 0, info: 1, matchLevel: 1 },
      error: null,
      finished_at: finishedAt,
      items: [item("matched", "454120"), item("matched", "454121"), item("matched", "454122"), item("outside", "451661", { patientName: "Paciente Ejemplo", labStatus: "6", requestDate: "2026-08-20T19:50:51" })],
    },
  },
  mismatch: {
    environment: "prod",
    counter: { status: "mismatch", matchLevel: 0.6, matched: 3, mismatches: 2, finishedAt },
    run: {
      id: "r-mm",
      trigger: "scheduled",
      status: "mismatch",
      summary: { oursSent: 5, labTotal: 6, matched: 3, mismatches: 2, info: 2, matchLevel: 0.6 },
      error: null,
      finished_at: finishedAt,
      items: [
        item("matched", "454120"),
        item("matched", "454121"),
        item("matched", "454122"),
        item("field_drift", "454123", {
          patientId: "p-1",
          patientName: "Ana Ejemplo",
          drift: [
            { field: "protrusionMax", ours: "6", lab: "5" },
            { field: "deliveryAddress.postalCode", ours: "06600", lab: "06700" },
          ],
        }),
        item("missing_in_lab", "454124", { patientId: "p-2", patientName: "Luis Ejemplo", labStatus: null, requestDate: null }),
        item("test_order", "454013", { patientName: "Tester Patient 4" }),
        item("outside", "451661", { patientName: "Paciente Ejemplo", labStatus: "6", requestDate: "2026-08-20T19:50:51" }),
      ],
    },
  },
  failed: {
    environment: "prod",
    counter: { status: "failed", matchLevel: null, matched: 0, mismatches: 0, finishedAt },
    run: { id: "r-f", trigger: "manual", status: "failed", summary: { oursSent: 5 }, error: "order list answered 503", finished_at: finishedAt, items: [] },
  },
};
const latest = RUNS[state] ?? RUNS.mismatch;
const body = mode === "counter" ? { environment: "prod", counter: (latest as { counter: unknown }).counter } : latest;

const json = (b: unknown) => Promise.resolve(new Response(JSON.stringify(b), { status: 200, headers: { "Content-Type": "application/json" } }));
const realFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.includes("/api/v1/device-orders/reconciliation/latest")) return json(body);
  if (url.includes("/api/v1/device-orders/reconciliation/run")) return json({ environment: "prod", run: (latest as { run: unknown }).run });
  return realFetch(input, init);
};

const Stub = { render: () => null };
const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/:p(.*)*", component: Stub }] });

const style = document.createElement("style");
style.textContent = `body { margin: 0; padding: 16px; background: rgb(var(--v-theme-background)); } #app { max-width: 960px; }`;
document.head.append(style);

createApp({ render: () => h(DeviceOrderReconciliationCard, { mode }) }).use(createPinia()).use(router).use(vuetify).use(i18n).mount("#app");
document.getElementById("boot-splash")?.remove();
