/**
 * DB-free harness for e2e/mobile-nav.spec.ts (NEO-161) — served only by the
 * Vite dev server, never part of `vite build`. Mounts the real AppShell
 * (floating bottom pill + module capsule) and the real account menu with a
 * long feed of cards, so a real browser can check what jsdom can't: the pill
 * floats over scrolling content, "Close" sits exactly where "More" was, and
 * the capsule/card land where they should.
 *
 * The theme comes from the real theme store (CORE-163), so the account
 * menu's Light/Dark/Auto buttons switch it exactly as in the app.
 *
 * `?theme=dark` · `?open=account` (opens the account menu once the router is ready)
 * · `?labels=long` (CORE-91: the longest real module names in the pill's row).
 */
import { createApp, defineComponent, h, nextTick, onMounted, ref, watch } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { useThemeStore, type ThemePreference } from "@stores";
import { createRouter, createMemoryHistory } from "vue-router";
import { VApp, VAvatar } from "vuetify/components";
import vuetify, { darkTheme, lightTheme } from "../../src/plugins/vuetify";
import { i18n } from "../../src/plugins/i18n";
import "../../src/styles/theme.scss";
import "../../src/styles/app-responsive.scss";
import "../../src/styles/page-transitions.css";
import "@brand/transitions.css";
import { AppShell } from "@neo/ui";
import AppIcon, { type AppIconName } from "../../src/components/AppIcon.vue";
import AppAccountMenu from "../../src/layouts/components/AppAccountMenu.vue";
import AppUserMenuPanel from "../../src/layouts/components/AppUserMenuPanel.vue";
import { MENU_AVATAR_SIZE } from "../../src/composables/useGlassPopoverMotion";

const params = new URLSearchParams(location.search);
const themeParam = params.get("theme");
try {
  if (themeParam === "dark" || themeParam === "light") localStorage.setItem("neosleep-theme", themeParam);
  else localStorage.removeItem("neosleep-theme");
} catch {
  // benign: storage blocked — the store falls back to the OS theme.
}
const pinia = createPinia();
setActivePinia(pinia);
const themeStore = useThemeStore();
// Same Vuetify side effect as composables/useLayoutState.ts.
watch(() => themeStore.mode, (m) => vuetify.theme.change(m === "dark" ? darkTheme : lightTheme), { immediate: true, flush: "sync" });

const NAV = [
  ["dashboard", "Dashboard"],
  ["appointments", "Visits"],
  ["hcp", "Doctors"],
  ["patients", "Patients"],
  ["hco", "Clinics"],
  ["leads", "Leads"],
  ["sleep-studies", "Studies"],
  ["planner", "Planner"],
  ["presentations", "Presentations"],
  ["resources", "Resources"],
  ["territories", "Territories"],
] as const;
// CORE-91: the old EN "Appointments" wrapped mid-word in the pill's row; MX "Tratamientos" is as long.
const LONG_LABELS: Record<string, string> = { appointments: "Appointments", hcp: "Tratamientos" };
const longLabels = params.get("labels") === "long";
const navItems = NAV.map(([name, label]) => ({ path: `/${name}`, label: (longLabels && LONG_LABELS[name]) || label, name }));

const Stub = { render: () => null };
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: "/", redirect: "/dashboard" }, ...navItems.map((i) => ({ path: i.path, component: Stub }))],
});

const FEED = [
  ["Dr. Marta Kowalczyk", "ENT · 10:30", "#128F83"],
  ["Sleep Clinic Wola", "Clinic · 12:00", "#C98A1B"],
  ["Dr. Tomasz Nowicki", "Dentist · 14:15", "#5B6FB8"],
  ["Jan Zielinski", "Patient · PSG study", "#B8433A"],
  ["Dr. Alicja Lis", "Pulmonologist · tomorrow", "#0B5D63"],
  ["Sen-Med Clinic", "Clinic · tomorrow", "#7A5C9E"],
  ["Dr. Piotr Wrona", "GP · Thursday", "#128F83"],
  ["Anna Maj", "Patient · follow-up", "#C98A1B"],
  ["Dr. Ewa Sowa", "ENT · Friday", "#5B6FB8"],
  ["Mokotow Medical", "Clinic · Friday", "#B8433A"],
  ["Dr. Karol Dab", "Dentist · next week", "#0B5D63"],
  ["Last card in the list", "It must scroll clear of the menu", "#7A5C9E"],
] as const;

const card = ([title, sub, color]: readonly [string, string, string]) =>
  h("div", { class: "harness-card" }, [
    h("span", { class: "harness-card__avatar", style: { background: color } }, title.replace(/^Dr\. /, "").slice(0, 2).toUpperCase()),
    h("span", { class: "harness-card__text" }, [h("b", title), h("small", sub)]),
  ]);

const Harness = defineComponent({
  setup() {
    const menuOpen = ref(false);
    onMounted(async () => {
      await router.isReady();
      await nextTick();
      if (params.get("open") === "account") menuOpen.value = true;
    });
    return () =>
      h(VApp, { class: "layout-root" }, () =>
        h(
          AppShell,
          {
            navItems,
            menuLabel: "Modules",
            moreLabel: "More",
            closeLabel: "Close",
            bottomNavShowLabels: true,
            sheet: true,
          },
          {
            "app-bar-start": () => h("span", { class: "harness-logo" }, "NeoSleep"),
            "app-bar-actions": () =>
              h(
                AppAccountMenu,
                { open: menuOpen.value, "onUpdate:open": (v: boolean) => (menuOpen.value = v), mobile: true, label: "User menu" },
                {
                  trigger: ({ open }: { open: boolean }) =>
                    h("button", { type: "button", class: "harness-avatar-btn", "aria-label": "User menu", "aria-expanded": String(open) }, [
                      h(VAvatar, { size: 32, color: "primary", "data-motion": "trigger-avatar" }, () => "AN"),
                    ]),
                  default: () =>
                    h(AppUserMenuPanel, {
                      name: "Anna Nowak",
                      email: "anna.nowak@example.com",
                      roleLabel: "Rep",
                      initials: "AN",
                      region: "PL",
                      themePreference: themeStore.preference,
                      "onSet-theme": (p: ThemePreference) => themeStore.setPreference(p),
                      locale: "en",
                      canChangePassword: true,
                      version: "Version 2.14.0.412",
                      channel: "DEV",
                      avatarSize: MENU_AVATAR_SIZE,
                    }),
                },
              ),
            "nav-icon": ({ item }: { item: { name?: string } }) => h(AppIcon, { name: `nav-${item.name}` as AppIconName }),
            default: () =>
              h("div", { class: "harness-sheet" }, [
                h("h1", { class: "harness-title" }, "Today"),
                h("div", { class: "harness-hero" }, [h("small", "Visits this week"), h("b", "14 / 20")]),
                ...FEED.map(card),
              ]),
          },
        ),
      );
  },
});

const style = document.createElement("style");
style.textContent = `
  .harness-logo { font-weight: 700; font-size: 17px; color: rgb(var(--v-theme-primary)); padding-inline-start: 8px; }
  .harness-avatar-btn { border: 0; background: none; padding: 4px 8px; cursor: pointer; }
  .harness-sheet { margin: 0 8px 12px; padding: 16px; border-radius: 16px; background: var(--pwa-sheet); box-shadow: var(--pwa-sheet-shadow); display: grid; gap: 10px; view-transition-name: pwa-page; }
  .harness-title { font-size: 22px; margin: 0 0 4px; }
  .harness-hero { border-radius: 16px; padding: 16px; color: #fff; background: linear-gradient(135deg, #128f83, #0b5d63 60%, #c98a1b 130%); display: grid; }
  .harness-hero b { font-size: 26px; }
  .harness-card { display: flex; gap: 12px; align-items: center; padding: 12px; border-radius: 14px; background: rgb(var(--v-theme-surface-container-low)); }
  .harness-card__avatar { width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; color: #fff; font: 600 13px/1 sans-serif; flex: none; }
  .harness-card__text { display: grid; }
  .harness-card__text small { opacity: 0.7; }
`;
document.head.appendChild(style);

document.getElementById("boot-splash")?.remove();
createApp(Harness).use(pinia).use(router).use(vuetify).use(i18n).mount("#app");
