import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import { sharedVitestResolve } from "../../vite.shared.ts";

export default defineConfig({
  plugins: [vue()],
  test: {
    passWithNoTests: false,
    environment: "jsdom",
    setupFiles: ["./src/vitest.setup.ts"],
    // EventoView.vue imports LazyImg from the @ui barrel, which also pulls in
    // AppShell.vue's `import { useDisplay } from "vuetify"` — Vitest must run
    // vuetify through Vite's transform (which handles CSS) instead of Node's
    // native loader (which can't parse .css at all). Same fix already proven
    // in packages/ui/vitest.config.ts and apps/pwa/vitest.config.ts.
    server: { deps: { inline: [/vuetify/] } },
  },
  resolve: sharedVitestResolve(),
});
