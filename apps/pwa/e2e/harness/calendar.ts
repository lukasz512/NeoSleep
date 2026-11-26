/**
 * DB-free harness for e2e/calendar.spec.ts (CORE-122) — served only by the
 * Vite dev server, never part of `vite build`. Mounts the real CalendarView
 * inside a sheet shaped like AppLayout's (padded, viewport-tall). The
 * /api/v1/calendar answer is built in the page (window.fetch stub): a week of
 * appointments and events around today, so the grid looks like a working week.
 * `?theme=dark`, `?lang=pl|mx|en`, `?header=1` adds AppLayout's page-header row (title + actions slot, CORE-153).
 */
import { createApp, defineComponent, h, ref } from "vue";
import { createPinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import vuetify, { lightTheme, darkTheme } from "../../src/plugins/vuetify";
import { i18n, loadLocale } from "../../src/plugins/i18n";
import "../../src/styles/theme.scss";
import "../../src/styles/app-responsive.scss";
import CalendarView from "../../src/views/CalendarView.vue";
import { providePageHeader, PAGE_HEADER_ACTIONS_ID } from "../../src/composables/usePageHeader";

const params = new URLSearchParams(location.search);
vuetify.theme.change(params.get("theme") === "dark" ? darkTheme : lightTheme);
const lang = params.get("lang");
if (lang === "pl" || lang === "mx") {
  await loadLocale(lang);
  i18n.global.locale.value = lang;
}

const PATIENTS = ["María González", "Juan Pérez Ortega", "Ana Lucía Torres", "Carlos Méndez", "Sofía Ramírez", "Luis Hernández", "Patricia Flores", "Roberto Castillo"];
const EVENTS = ["Visita Clínica Del Valle", "Llamada Dra. Lorena", "Sesión clínica", "Congreso SMMS"];

function at(dayOffset: number, hour: number, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d;
}

const items: unknown[] = [];
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
for (let offset = -10; offset <= 30; offset++) {
  const weekday = at(offset, 12).getDay();
  if (weekday === 0) continue;
  const count = weekday === 6 ? 1 : 2 + ((offset + 40) % 3);
  for (let i = 0; i < count; i++) {
    const hour = 9 + ((offset * 7 + i * 3 + 40) % 9);
    const minute = (offset + i) % 2 ? 30 : 0;
    const start = at(offset, hour, minute);
    const end = new Date(start.getTime() + (i % 3 === 0 ? 60 : 45) * 60_000);
    const id = `a-${offset}-${i}`;
    items.push({
      kind: "appointment",
      id,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      data: {
        id, patient_id: `p-${i}`, patient_name: PATIENTS[(offset + 20 + i) % PATIENTS.length], practitioner_id: "doc-1",
        practitioner_name: "Dra. Lorena Ruiz", organization_name: "Consultorio Polanco", start_at: start.toISOString(), end_at: end.toISOString(),
        timezone: zone, status: end.getTime() < Date.now() ? "completed" : "scheduled",
      },
    });
  }
  if (weekday !== 6 && (offset + 40) % 2 === 0) {
    const start = at(offset, 10 + ((offset + 40) % 5), 30);
    const end = new Date(start.getTime() + 90 * 60_000);
    const id = `e-${offset}`;
    items.push({
      kind: "encounter",
      id,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      data: {
        id, start_at: start.toISOString(), end_at: end.toISOString(), type: (offset + 40) % 4 === 0 ? "video" : "visit", status: "scheduled",
        location: "Clínica Del Valle", metadata: { title: EVENTS[(offset + 40) % EVENTS.length] },
      },
    });
  }
}

// CORE-139: `?clinic=mx` adds today's evening visits at a Mexico City clinic (UTC-6, no DST),
// to view from a browser in Europe — they used to fall between two device-day fetches.
if (params.get("clinic") === "mx") {
  const mxDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
  for (const [i, time] of ["17:00", "18:30", "19:30"].entries()) {
    const start = new Date(`${mxDay}T${time}:00-06:00`);
    const end = new Date(start.getTime() + 45 * 60_000);
    const id = `mx-${i}`;
    items.push({
      kind: "appointment", id, start_at: start.toISOString(), end_at: end.toISOString(),
      data: {
        id, patient_id: `p-mx-${i}`, patient_name: `${PATIENTS[i]} (MX ${time})`, practitioner_id: "doc-1",
        practitioner_name: "Dra. Lorena Ruiz", organization_name: "Consultorio Polanco", start_at: start.toISOString(), end_at: end.toISOString(),
        timezone: "America/Mexico_City", status: "scheduled",
      },
    });
  }
}

const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }));
const realFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.includes("/api/v1/calendar")) {
    const q = new URL(url, location.href).searchParams;
    const from = new Date(q.get("start") ?? 0).getTime();
    const to = new Date(q.get("end") ?? 0).getTime();
    return json({ items: items.filter((it) => {
      const t = new Date((it as { start_at: string }).start_at).getTime();
      return t >= from && t < to;
    }) });
  }
  return realFetch(input, init);
};

const Stub = { render: () => null };
const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/:any(.*)*", component: Stub }] });

const withHeader = params.get("header") === "1";
const Harness = defineComponent({
  setup() {
    providePageHeader(ref(withHeader));
    const header = withHeader
      ? [h("div", { class: "harness-header" }, [h("h1", { class: "harness-title" }, "Calendario"), h("div", { id: PAGE_HEADER_ACTIONS_ID, class: "harness-actions" })])]
      : [];
    return () => h("main", { class: "harness-sheet" }, [...header, h(CalendarView)]);
  },
});

const style = document.createElement("style");
style.textContent = `
  body { margin: 0; background: var(--pwa-desk, #ebeeed); color: rgb(var(--v-theme-on-surface)); }
  /* Shaped like AppLayout's content sheet: padded, rounded, at least the viewport tall. */
  .harness-sheet { --layout-card-inset: 16px; display: flex; flex-direction: column; box-sizing: border-box; margin: 12px;
    min-height: calc(100dvh - 24px); padding: var(--layout-card-inset); background: var(--pwa-sheet); border-radius: var(--pwa-sheet-radius, 16px);
    box-shadow: var(--pwa-sheet-shadow); }
  .harness-sheet > * { flex: 1 1 auto; min-height: 0; }
  /* Stand-in for AppLayout's page-header row: title left, actions slot right. */
  .harness-sheet > .harness-header { flex: 0 0 auto; display: flex; align-items: center; min-height: 48px; margin-bottom: 16px; }
  .harness-title { margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.01em; }
  .harness-actions { flex: 1 1 auto; display: flex; justify-content: flex-end; align-items: center; gap: 8px; }
`;
document.head.append(style);

createApp(Harness).use(createPinia()).use(router).use(vuetify).use(i18n).mount("#app");
// Same as dialog-header.ts: the boot splash vite.config.ts injects isn't dismissed here.
document.getElementById("boot-splash")?.remove();
