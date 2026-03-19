import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import vuetify from "vite-plugin-vuetify";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Repo root brand folder – jedyne miejsce na logo/ikony (współdzielone z website i innymi aplikacjami). */
const brandDir = path.resolve(__dirname, "../../brand");

export default defineConfig({
  plugins: [
    vue(),
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
