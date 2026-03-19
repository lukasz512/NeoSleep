import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Repo root brand folder – jedyne miejsce na logo/ikony (współdzielone z innymi aplikacjami). */
const brandDir = path.resolve(__dirname, "../../brand");

export default defineConfig({
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
  plugins: [
    vue(),
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
  server: {
    port: 5174,
    proxy: {
      "/api": {
        target: process.env.VITE_API_URL ?? "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      "@i18n": path.resolve(__dirname, "../../i18n"),
      "@brand": path.resolve(__dirname, "../../brand"),
    },
  },
});
