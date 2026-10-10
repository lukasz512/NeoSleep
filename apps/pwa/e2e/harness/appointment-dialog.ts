/**
 * DB-free harness for e2e/appointment-dialog.spec.ts (CORE-132) — served only
 * by the Vite dev server, never part of `vite build`. Mounts the real
 * AppointmentDialog for a fixed patient, booked by an admin with a fixed
 * doctor; the API is answered in the page (window.fetch stub).
 * `?doctor=team` books with a doctor already on the patient's care team,
 * `?doctor=unknown` makes the team list fail and the API refuse the booking (CORE-138),
 * anything else books with one outside it. `?lang=pl|mx|en`, `?theme=dark`.
 */
import { createApp, defineComponent, h } from "vue";
import { createPinia } from "pinia";
import vuetify, { lightTheme, darkTheme } from "../../src/plugins/vuetify";
import { i18n, loadLocale } from "../../src/plugins/i18n";
import "../../src/styles/theme.scss";
import "../../src/styles/app-responsive.scss";
import AppointmentDialog from "../../src/components/AppointmentDialog.vue";
import { useAuthStore } from "../../src/stores/auth";

const params = new URLSearchParams(location.search);
vuetify.theme.change(params.get("theme") === "dark" ? darkTheme : lightTheme);
const lang = params.get("lang");
if (lang === "pl" || lang === "mx") {
  await loadLocale(lang);
  i18n.global.locale.value = lang;
}
const onTeam = params.get("doctor") === "team";
/** CORE-138: the team list fails to load and the API then refuses the booking without grant_access. */
const teamUnknown = params.get("doctor") === "unknown";

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
const realFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (teamUnknown && url.includes("/care-team")) return json({ error: "unavailable" }, 503);
  if (teamUnknown && init?.method === "POST" && /\/api\/v1\/appointments$/.test(url)) {
    return json({ error: "grant_access must be confirmed", code: "VALIDATION_ERROR", field: "grant_access" }, 400);
  }
  if (url.includes("/care-team")) return json(onTeam ? [{ practitioner_id: "h-1" }, { practitioner_id: "h-2" }] : [{ practitioner_id: "h-1" }]);
  if (url.includes("/booking-zone")) return json({ timezone: "America/Mexico_City" });
  if (url.includes("/api/v1/")) return json({ items: [] });
  return realFetch(input, init);
};

const Harness = defineComponent({
  setup() {
    return () =>
      h(AppointmentDialog, {
        modelValue: true,
        patient: { id: "p-1", name: "María Fernanda López Ruiz", practitioner_id: "h-1" },
        practitioner: { id: "h-2", name: "Dra. Lucía Fernández Ortega" },
        // Always tomorrow 15:00 UTC: a fixed date turned into "can't be in the past" on 2026-10-10.
        startAt: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + 1, 15)).toISOString(),
      });
  },
});

const style = document.createElement("style");
style.textContent = `body { margin: 0; background: rgb(var(--v-theme-surface)); }`;
document.head.append(style);

const pinia = createPinia();
useAuthStore(pinia).user = { id: "u-1", email: "qa@neosleepcare.com", role: "admin" } as NonNullable<ReturnType<typeof useAuthStore>["user"]>;
createApp(Harness).use(pinia).use(vuetify).use(i18n).mount("#app");
document.getElementById("boot-splash")?.remove();
