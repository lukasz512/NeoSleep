import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import { sharedVitestResolve } from "../../vite.shared.ts";

export default defineConfig({
  plugins: [vue()],
  test: {
    passWithNoTests: false,
    environment: "jsdom",
    pool: "threads",
    setupFiles: ["./src/vitest.setup.ts"],
    // e2e/ is the Playwright suite (playwright.config.ts) — different test
    // runner, different `test`/`expect` globals. Vitest's default include
    // glob would otherwise also try to run those files as unit tests.
    exclude: ["**/node_modules/**", "**/dist/**", "e2e/**"],
    // Vuetify components import their own .css files; Vitest must run them
    // through Vite's transform (which strips/handles CSS) instead of Node's
    // native loader (which can't parse .css at all) — same fix already
    // proven in packages/ui/vitest.config.ts.
    server: { deps: { inline: [/vuetify/] } },
  },
  resolve: sharedVitestResolve(),
});
