import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import vuetify from "vite-plugin-vuetify";
import { VitePWA } from "vite-plugin-pwa";
import type { VitePWAOptions } from "vite-plugin-pwa";

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

/** Repo root brand folder – jedyne miejsce na logo/ikony (współdzielone z website i innymi aplikacjami). */
const brandDir = path.resolve(__dirname, "../../brand");

export default defineConfig({
  envDir: path.resolve(__dirname, "../.."),
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
    {
      name: "brand-assets",
      configureServer(server) {
        server.middlewares.use("/brand", (req, res, next) => {
          const url = (req.url || "/").replace(/^\//, "");
          const file = path.join(brandDir, url);
          if (!url || url.includes("..")) return next();
          fs.stat(file, (err, stat) => {
            if (err || !stat.isFile()) return next();
            const ext = path.extname(file);
            const type = ext === ".svg" ? "image/svg+xml" : "application/octet-stream";
            res.setHeader("Content-Type", type);
            fs.createReadStream(file).pipe(res);
          });
        });
      },
      closeBundle() {
        const dest = path.resolve(__dirname, "dist/brand");
        if (!fs.existsSync(brandDir)) return;
        fs.cpSync(brandDir, dest, { recursive: true });
      },
    },
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
    host: true, // listen on 0.0.0.0 so you can open the app from another device (e.g. phone on same Wi‑Fi)
    proxy: {
      "/api": { target: "http://localhost:3000", changeOrigin: true },
      "/auth": { target: "http://localhost:3000", changeOrigin: true },
      "/health": { target: "http://localhost:3000", changeOrigin: true },
    },
  },
  resolve: {
    alias: {
      "@i18n": path.resolve(__dirname, "../../i18n"),
      "@brand": path.resolve(__dirname, "../../brand"),
    },
  },
});
