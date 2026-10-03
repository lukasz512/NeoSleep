/**
 * DB-free harness for e2e/patient-aside.spec.ts (NEO-203) — served only by the
 * Vite dev server, never part of `vite build`. Mounts the real
 * PatientAsidePanel in a stand-in for ItemDetailLayout's #aside column (320px,
 * sticky, capped at the window height, as in ItemDetailLayout.vue) with a
 * worst-case patient: 8 checklist items, a long diagnosis and a long note.
 * Whether all of that fits one window is layout that only a real browser
 * computes. The API is answered in the page (window.fetch stub).
 * `?theme=dark`, `?lang=pl|mx|en`, `?done=1` (nothing left for the patient),
 * `?tab=documents`.
 */
import { createApp, defineComponent, h } from "vue";
import { createPinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import vuetify, { lightTheme, darkTheme } from "../../src/plugins/vuetify";
import { i18n, loadLocale } from "../../src/plugins/i18n";
import "../../src/styles/theme.scss";
import "../../src/styles/app-responsive.scss";
import PatientAsidePanel from "../../src/components/patient/PatientAsidePanel.vue";

const params = new URLSearchParams(location.search);
vuetify.theme.change(params.get("theme") === "dark" ? darkTheme : lightTheme);
const lang = params.get("lang");
if (lang === "pl" || lang === "mx") {
  await loadLocale(lang);
  i18n.global.locale.value = lang;
}
const done = params.get("done") === "1";

function item(key: string, group: string, status: string, qr = true, label = key) {
  return {
    key, templateKey: key, label, fillMode: group === "consent" ? "consent" : "patient", group,
    category: group === "results" ? "study" : "document", status, completed_at: null, history: [], pending_request_id: null,
    actions: { qr, fill: null, form: null, print: true, upload: true },
  };
}
const ITEMS = [
  item("informedConsent", "consent", done ? "done" : "pending_patient"),
  item("medicalHistory", "patient", "done"),
  item("stopBang", "patient", done ? "done" : "missing"),
  item("oralExam", "doctor", "done", false),
  item("historiaEndo", "doctor", "done", false),
  item("polysomnography", "results", "done", false),
  // Tenant-defined extras (no i18n key): the admin manifest label is shown.
  item("titration", "results", "missing", false, "Titulación del dispositivo"),
  item("followUp", "results", "missing", false, "Poligrafía de control"),
];
const NOTE = {
  id: "n1", entity_type: "patient", entity_id: "p-1", author_id: "u-1", author_name: "Dra. López", created_at: "2026-09-28T10:00:00Z",
  body: "Paciente refiere ronquidos fuertes, la pareja confirma pausas. Agendar PSG antes de la toma de impresiones. Revisar si trae estudio previo; si no, pedir polisomnografía tipo III y valorar ortodoncia antes del dispositivo.",
};

const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }));
const realFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.includes("/api/v1/note?")) return json({ items: [NOTE, { ...NOTE, id: "n2" }, { ...NOTE, id: "n3" }] });
  if (url.includes("/checklist")) {
    const doneCount = ITEMS.filter((i) => i.status === "done").length;
    return json({ items: ITEMS, other_uploads: [], pending_requests: [], expired_request: null, summary: { done: doneCount, total: ITEMS.length } });
  }
  if (url.includes("/api/v1/treatment-plan?")) return json({ items: [] });
  return realFetch(input, init);
};

const Stub = { render: () => null };
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: "/", component: Stub }, { path: "/hcp/:id", name: "hcp-detail", component: Stub }],
});

const Harness = defineComponent({
  setup() {
    return () =>
      h("div", { class: "harness-page" }, [
        h("div", { class: "harness-main" }),
        h("aside", { class: "harness-aside", "data-testid": "aside" }, [
          h(PatientAsidePanel, {
            patient: {
              id: "p-1", status: "active", ahi_baseline: 22, cpap_device: null, practitioner_id: "h-1", practitioner_name: "Dra. Laura Cuicas",
              diagnosis_code: { code: "G47.33", label: "Apnea obstructiva del sueño del adulto, moderada" },
            },
            canSeeStudies: true,
            activeTab: params.get("tab") ?? "details",
          }),
        ]),
      ]);
  },
});

// Same geometry as ItemDetailLayout: a 720px column + a 320px aside, 32px apart; the aside is
// sticky 16px from the top and never taller than the window (.view-item__aside).
const style = document.createElement("style");
style.textContent = `
  body { margin: 0; background: rgb(var(--v-theme-surface)); color: rgb(var(--v-theme-on-surface)); }
  .harness-page { display: grid; grid-template-columns: 720px 320px; gap: 32px; padding: 16px 24px; align-items: start; }
  .harness-main { height: 1400px; border-radius: 12px; background: rgba(var(--v-theme-on-surface), 0.03); }
  .harness-aside { position: sticky; top: 16px; max-height: calc(100dvh - 32px); overflow-y: auto; }
`;
document.head.append(style);

createApp(Harness).use(createPinia()).use(router).use(vuetify).use(i18n).mount("#app");
// Same as dialog-header.ts: the boot splash vite.config.ts injects isn't dismissed here.
document.getElementById("boot-splash")?.remove();
