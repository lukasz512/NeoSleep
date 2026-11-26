/**
 * DB-free harness for the doctor invite dialog (NEO-272) — served only by the
 * Vite dev server. Mounts the real InviteEmailDialog; `?lang=pl|mx|en` is
 * both the UI locale and the doctor's language, `?theme=dark`.
 */
import { createApp, defineComponent, h, ref } from "vue";
import { createPinia } from "pinia";
import vuetify, { lightTheme, darkTheme } from "../../src/plugins/vuetify";
import { i18n, loadLocale } from "../../src/plugins/i18n";
import "../../src/styles/theme.scss";
import "../../src/styles/app-responsive.scss";
import InviteEmailDialog from "../../src/components/practitioner/InviteEmailDialog.vue";

const params = new URLSearchParams(location.search);
vuetify.theme.change(params.get("theme") === "dark" ? darkTheme : lightTheme);
const lang = params.get("lang");
if (lang === "pl" || lang === "mx") {
  await loadLocale(lang);
  i18n.global.locale.value = lang;
}

const Harness = defineComponent({
  setup() {
    const open = ref(true);
    return () =>
      h(InviteEmailDialog, {
        modelValue: open.value,
        "onUpdate:modelValue": (v: boolean) => (open.value = v),
        language: lang === "pl" || lang === "en" ? lang : "mx",
        sending: false,
      });
  },
});

createApp(Harness).use(createPinia()).use(vuetify).use(i18n).mount("#app");
document.getElementById("boot-splash")?.remove();
