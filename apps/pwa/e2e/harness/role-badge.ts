/**
 * DB-free harness for CORE-114's before/after shots — served only by the Vite
 * dev server. Renders the real account menu panel and user avatars at the app
 * bar (32 px), Users list row (32 px) and phone card (55 px) sizes, one per role.
 */
import { createApp, defineComponent, h } from "vue";
import { createPinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import vuetify, { lightTheme } from "../../src/plugins/vuetify";
import { i18n } from "../../src/plugins/i18n";
import "../../src/styles/theme.scss";
import AppAvatar from "../../src/components/AppAvatar.vue";
import AppUserMenuPanel from "../../src/layouts/components/AppUserMenuPanel.vue";

vuetify.theme.change(lightTheme);

const Stub = { render: () => null };
const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/", component: Stub }] });

const USERS = [
  { name: "Łukasz Ostrowski", role: "admin", label: "Admin" },
  { name: "Lorena González", role: "doctor", label: "Doctor" },
  { name: "Marta Nowak", role: "manager", label: "Manager" },
  { name: "Karol Wiśniewski", role: "kam", label: "KAM" },
  { name: "Sofía Ramírez", role: "msl", label: "MSL" },
  { name: "Jan Kowalski", role: "rep", label: "Rep" },
];

const Harness = defineComponent({
  setup() {
    return () =>
      h("div", { "data-testid": "harness", style: "position:relative;z-index:100;display:flex;gap:32px;padding:24px;background:#f4f5f5;font-family:system-ui;align-items:flex-start" }, [
        h("div", { "data-testid": "avatars", style: "background:#fff;border-radius:16px;padding:20px;display:grid;gap:14px" },
          USERS.map((u) =>
            h("div", { style: "display:flex;align-items:center;gap:16px" }, [
              h(AppAvatar, { name: u.name, entityType: "user", role: u.role, roleLabel: u.label, size: 32 }),
              h(AppAvatar, { name: u.name, entityType: "user", role: u.role, roleLabel: u.label, size: 55 }),
              h("div", { style: "display:grid" }, [h("strong", u.name), h("span", { style: "color:#667" }, u.label)]),
            ]),
          ),
        ),
        h("div", { "data-testid": "menu", style: "background:#fff;border-radius:20px;width:340px;box-shadow:0 8px 32px rgba(0,0,0,.12)" }, [
          h(AppUserMenuPanel, {
            name: "Łukasz Ostrowski",
            email: "lukasz@example.com",
            roleLabel: "Admin",
            role: "admin",
            initials: "ŁO",
            region: "MX",
            themePreference: "light",
            locale: "en",
            canChangePassword: true,
            version: "Version 1.0.0",
            channel: "DEV",
          }),
        ]),
      ]);
  },
});

createApp(Harness).use(createPinia()).use(router).use(vuetify).use(i18n).mount("#app");
