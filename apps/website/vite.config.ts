import path from "path";
import { fileURLToPath } from "url";
import { defineConfig, mergeConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { sharedViteConfig } from "../../vite.shared.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(mergeConfig(sharedViteConfig(__dirname), {
  css: {
    preprocessorOptions: {
      scss: {
        /** Shared breakpoints – injected into every SCSS file automatically.
         *  White-label tenants can override these per build if needed.
         *  Values mirror website-theme.scss layout tokens. */
        additionalData: `
          $bp-sm:  600px;
          $bp-md:  900px;
          $bp-lg:  960px;
          $bp-nav: 1100px;
        `,
      },
    },
  },
  plugins: [vue()],
  server: {
    port: 5174,
    proxy: {
      "/api": { target: process.env.VITE_API_URL ?? "http://localhost:3000", changeOrigin: true },
    },
  },
}));
