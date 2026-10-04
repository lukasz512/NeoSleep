/**
 * DB-free harness for the app bar account button (CORE-131) — served only by
 * the Vite dev server. Renders the real AppAccountButton (desktop + compact)
 * in a strip shaped like the app bar, after a focusable stand-in for the
 * notification bell, so Tab reaches it the way it does in the app.
 * AppLayout's fit-to-shell padding is mirrored below (it lives in AppLayout).
 *
 * `?theme=dark`
 */
import { createApp, defineComponent, h } from "vue";
import { createPinia } from "pinia";
import vuetify, { darkTheme, lightTheme } from "../../src/plugins/vuetify";
import { i18n } from "../../src/plugins/i18n";
import "../../src/styles/theme.scss";
import AppAccountButton from "../../src/layouts/components/AppAccountButton.vue";
import AppIcon from "../../src/components/AppIcon.vue";

const dark = new URLSearchParams(location.search).get("theme") === "dark";
vuetify.theme.change(dark ? darkTheme : lightTheme);
document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
document.getElementById("boot-splash")?.remove();

const style = document.createElement("style");
style.textContent = `
  .harness-bar .layout-user-btn.v-btn:not(.v-btn--icon) { padding-block: 4px; padding-inline: 12px 6px !important; }
  .harness-bar .layout-user-btn--compact.v-btn:not(.v-btn--icon) { min-width: 0; padding-inline: 6px !important; }
`;
document.head.append(style);

const bar = (compact: boolean) =>
  h("div", {
    class: "harness-bar",
    "data-testid": compact ? "bar-phone" : "bar-desktop",
    style: "display:flex;align-items:center;justify-content:flex-end;gap:8px;height:64px;padding:0 16px;background:rgb(var(--v-theme-background));border-radius:12px",
  }, [
    h("button", { type: "button", "aria-label": "Notifications", class: "harness-bell", style: "width:40px;height:40px;border:0;background:none;border-radius:50%;display:grid;place-items:center;color:inherit" },
      h(AppIcon, { name: "bell", style: "width:22px;height:22px" })),
    h(AppAccountButton, { name: "Łukasz Ostrowski", roleLabel: "Admin", role: "admin", label: "User menu", compact }),
  ]);

const Harness = defineComponent({
  setup: () => () =>
    h("div", { "data-testid": "harness", style: "position:relative;z-index:100;display:grid;gap:16px;padding:24px;max-width:520px;background:rgb(var(--v-theme-surface))" }, [
      bar(false),
      h("div", { style: "max-width:200px;margin-left:auto;width:100%" }, bar(true)),
    ]),
});

createApp(Harness).use(createPinia()).use(vuetify).use(i18n).mount("#app");
