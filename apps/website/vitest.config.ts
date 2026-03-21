import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import { sharedVitestResolve } from "../../vite.shared.ts";

export default defineConfig({
  plugins: [vue()],
  test: {
    passWithNoTests: false,
    environment: "jsdom",
  },
  resolve: sharedVitestResolve(),
});
