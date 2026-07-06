import path from "path";
import { fileURLToPath } from "url";
import { defineConfig, mergeConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import vuetify from "vite-plugin-vuetify";
import { VitePWA } from "vite-plugin-pwa";
import type { VitePWAOptions } from "vite-plugin-pwa";
import { sharedViteConfig } from "../../vite.shared.ts";

interface NeoPwaOptions {
  name: string;
  shortName: string;
  startUrl?: string;
  description?: string;
  themeColor?: string;
  backgroundColor?: string;
  icon192?: string;
  icon512?: string;
}

function neoPwaPlugin(opts: NeoPwaOptions): ReturnType<typeof VitePWA> {
  const config: Partial<VitePWAOptions> = {
    registerType: "autoUpdate",
    includeAssets: ["favicon.ico", "apple-touch-icon.png"],
    manifest: {
      name:             opts.name,
      short_name:       opts.shortName,
      description:      opts.description ?? opts.name,
      start_url:        opts.startUrl ?? "/",
      scope:            "/",
      display:          "standalone",
      orientation:      "portrait",
      theme_color:      opts.themeColor      ?? "#128F83",
      background_color: opts.backgroundColor ?? "#082A27",
      icons: [
        { src: opts.icon192 ?? "/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: opts.icon512 ?? "/icon-512.png", sizes: "512x512", type: "image/png" },
        { src: opts.icon512 ?? "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    workbox: {
      globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
      runtimeCaching: [
        { urlPattern: /^https?:\/\/.*\/api\//, handler: "NetworkOnly" },
        { urlPattern: /^https?:\/\/.*\/auth\//, handler: "NetworkOnly" },
        {
          urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
          handler: "StaleWhileRevalidate",
          options: { cacheName: "google-fonts-stylesheets" },
        },
        {
          urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
          handler: "CacheFirst",
          options: {
            cacheName: "google-fonts-webfonts",
            expiration: { maxAgeSeconds: 60 * 60 * 24 * 365 },
          },
        },
      ],
    },
  };
  return VitePWA(config);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(mergeConfig(sharedViteConfig(__dirname), {
  plugins: [
    vue(),
    neoPwaPlugin({
      name:        "NeoSleep Rep",
      shortName:   "NeoSleep",
      description: "Sales rep CRM for NeoSleep — manage HCPs, leads, and post-call forms.",
      startUrl:    "/",
    }),
    vuetify({
      autoImport: true,
      styles: { configFile: "src/styles/vuetify-settings.scss" },
    }),
  ],
  css: {
    preprocessorOptions: {
      sass: { api: "modern-compiler" },
      scss: { api: "modern-compiler" },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vuetify: ["vuetify"],
          vue: ["vue", "vue-router", "pinia", "vue-i18n"],
        },
      },
    },
  },
  appType: "spa",
  server: {
    host: true,
    proxy: {
      "/api":    { target: "http://localhost:8000", changeOrigin: true },
      "/auth":   { target: "http://localhost:8000", changeOrigin: true },
      "/health": { target: "http://localhost:8000", changeOrigin: true },
    },
  },
}));
