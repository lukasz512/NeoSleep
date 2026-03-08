import { createApp } from "vue";
import { createI18n } from "vue-i18n";
import App from "./App.vue";
import router from "./router";

const messages = await import("@i18n/en.json").then((m) => m.default);

const i18n = createI18n({
  legacy: false,
  locale: "en",
  fallbackLocale: "en",
  messages: { en: messages },
});

const app = createApp(App);
app.use(router);
app.use(i18n);
app.mount("#app");
