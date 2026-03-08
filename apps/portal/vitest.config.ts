import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [vue()],
  test: {
    passWithNoTests: false,
    environment: "jsdom",
  },
  resolve: {
    alias: {
      "@i18n": path.resolve(__dirname, "../../i18n"),
    },
  },
});
