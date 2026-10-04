/**
 * DB-free harness for e2e/notification-center.spec.ts (CORE-4) — served only
 * by the Vite dev server, never part of `vite build`. Mounts the real AppShell
 * with the real bell (AppNotificationCenter) next to an avatar, and answers
 * the notification API from fixtures, so a real browser can check what jsdom
 * can't: the glass card lands on the bell, fits the phone and scrolls its list.
 *
 * `?theme=dark` · `?open=1` (opens the bell once the router is ready) · `?lang=pl|mx`
 */
import { createApp, defineComponent, h, nextTick, onMounted } from "vue";
import { createPinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import { VApp, VAvatar } from "vuetify/components";
import vuetify, { darkTheme, lightTheme } from "../../src/plugins/vuetify";
import { i18n } from "../../src/plugins/i18n";
import "../../src/styles/theme.scss";
import "../../src/styles/app-responsive.scss";
import "../../src/styles/page-transitions.css";
import { AppShell } from "@neo/ui";
import AppIcon, { type AppIconName } from "../../src/components/AppIcon.vue";
import AppNotificationCenter from "../../src/components/AppNotificationCenter.vue";
import { useNotificationCenter } from "../../src/composables/useNotificationCenter";

const params = new URLSearchParams(location.search);
const theme = params.get("theme") === "dark" ? darkTheme : lightTheme;
vuetify.theme.change(theme);
document.documentElement.setAttribute("data-theme", theme);
const lang = params.get("lang");
if (lang === "pl" || lang === "mx") i18n.global.locale.value = lang;

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString();
const daysFromNow = (d: number, hour: number) => {
  const at = new Date();
  at.setDate(at.getDate() + d);
  at.setHours(hour, 30, 0, 0);
  return at.toISOString();
};

// Fictional people only. The API joins subject_name/subject_at at read time (CORE-4 D1).
const row = (id: string, type: string, title: string, created: string, extra: Record<string, unknown> = {}) => ({
  id,
  type,
  title,
  body: "Open NeoSleep to see the details.",
  entity_type: null,
  entity_id: null,
  action_url: "/appointments",
  read_at: null,
  created_at: created,
  group_count: 1,
  subject_name: null,
  subject_at: null,
  actions: [],
  ...extra,
});

const ITEMS = [
  row("n1", "appointment_patient_cannot_attend", "A patient can't come to an appointment", minutesAgo(12), {
    subject_name: "Mariana Ruiz",
    subject_at: daysFromNow(1, 10),
    actions: [
      { kind: "call", href: "tel:+525512345678" },
      { kind: "reschedule", href: "/appointments" },
    ],
  }),
  row("n2", "questionnaire_submitted", "Questionnaire submitted", minutesAgo(48), { subject_name: "Jorge Peña", group_count: 3, action_url: "/patients" }),
  row("n3", "appointment_booked", "New appointment booked", minutesAgo(190), { subject_name: "Lucía Herrera", subject_at: daysFromNow(3, 9) }),
  row("n4", "device_order_placed", "Device order placed", minutesAgo(60 * 26), { subject_name: "Andrés Molina", read_at: minutesAgo(60 * 20), action_url: "/patients" }),
  row("n5", "practitioner_invite_accepted", "Doctor joined the platform", minutesAgo(60 * 30), { subject_name: "Dra. Elena Torres", read_at: minutesAgo(60 * 29), action_url: "/hcp" }),
  row("n6", "appointment_rescheduled", "Appointment rescheduled", minutesAgo(60 * 72), { subject_name: "Sofía Ramírez", subject_at: daysFromNow(2, 16), read_at: minutesAgo(60 * 70) }),
];

const realFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.includes("/api/v1/notification")) {
    const unread = url.includes("filter=unread");
    const items = unread ? ITEMS.filter((n) => !n.read_at) : ITEMS;
    const body = url.includes("unread-count") ? { count: 3 } : { items, total: items.length };
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }));
  }
  return realFetch(input, init);
};

const NAV = [
  ["dashboard", "Dashboard"],
  ["appointments", "Visits"],
  ["patients", "Patients"],
  ["hcp", "Doctors"],
] as const;
const navItems = NAV.map(([name, label]) => ({ path: `/${name}`, label, name }));
const Stub = { render: () => null };
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: "/", redirect: "/dashboard" }, ...navItems.map((i) => ({ path: i.path, component: Stub })), { path: "/:p(.*)*", component: Stub }],
});

const Harness = defineComponent({
  setup() {
    useNotificationCenter().unreadCount.value = 3;
    onMounted(async () => {
      await router.isReady();
      await nextTick();
      if (params.get("open")) document.querySelector<HTMLElement>(".notif-center__bell")?.click();
    });
    return () =>
      h(VApp, { class: "layout-root" }, () =>
        h(
          AppShell,
          { navItems, menuLabel: "Modules", moreLabel: "More", closeLabel: "Close", bottomNavShowLabels: true, sheet: true },
          {
            "app-bar-start": () => h("span", { class: "harness-logo" }, "NeoSleep"),
            "app-bar-actions": () =>
              h("div", { class: "harness-actions" }, [
                h(AppNotificationCenter),
                h(VAvatar, { size: 32, color: "primary", class: "harness-avatar" }, () => "AN"),
              ]),
            "nav-icon": ({ item }: { item: { name?: string } }) => h(AppIcon, { name: `nav-${item.name}` as AppIconName }),
            default: () =>
              h("div", { class: "harness-sheet" }, [
                h("h1", { class: "harness-title" }, "Today"),
                h("div", { class: "harness-hero" }, [h("small", "Visits this week"), h("b", "14 / 20")]),
                ...["Visit 09:00", "Visit 10:30", "Visit 12:00", "Visit 14:15", "Visit 16:00"].map((t) => h("div", { class: "harness-card" }, t)),
              ]),
          },
        ),
      );
  },
});

const style = document.createElement("style");
style.textContent = `
  .harness-logo { font-weight: 700; font-size: 17px; color: rgb(var(--v-theme-primary)); padding-inline-start: 8px; }
  .harness-actions { display: flex; align-items: center; gap: 8px; padding-inline-end: 8px; }
  .harness-sheet { margin: 0 8px 12px; padding: 16px; border-radius: 16px; background: var(--pwa-sheet); box-shadow: var(--pwa-sheet-shadow); display: grid; gap: 10px; }
  .harness-title { font-size: 22px; margin: 0 0 4px; }
  .harness-hero { border-radius: 16px; padding: 16px; color: #fff; background: linear-gradient(135deg, #128f83, #0b5d63 60%, #c98a1b 130%); display: grid; }
  .harness-hero b { font-size: 26px; }
  .harness-card { padding: 14px; border-radius: 14px; background: rgb(var(--v-theme-surface-container-low)); }
`;
document.head.appendChild(style);

document.getElementById("boot-splash")?.remove();
createApp(Harness).use(createPinia()).use(router).use(vuetify).use(i18n).mount("#app");
