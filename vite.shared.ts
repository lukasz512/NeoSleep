/**
 * Shared Vite / Vitest config helpers — imported by each app's vite.config.ts and vitest.config.ts.
 *
 * Usage:
 *   import { mergeConfig } from "vite";
 *   import { sharedViteConfig } from "../../vite.shared.ts";
 *   export default defineConfig(mergeConfig(sharedViteConfig(import.meta.dirname), { ... }));
 */
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import type { Plugin, UserConfig } from "vite";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export const brandDir       = path.resolve(rootDir, "platform/brand");
export const sharedPublicDir = path.resolve(rootDir, "platform/shared/public");

/** Brand assets served at /brand in dev; copied to dist/brand + dist/ at build time. */
export function brandAssetsPlugin(appDir: string): Plugin {
  return {
    name: "brand-assets",
    configureServer(server) {
      server.middlewares.use("/brand", (req, res, next) => {
        const url = (req.url ?? "/").replace(/^\//, "");
        const file = path.join(brandDir, url);
        if (!url || url.includes("..")) return next();
        fs.stat(file, (err, stat) => {
          if (err || !stat.isFile()) return next();
          const ext = path.extname(file);
          res.setHeader("Content-Type", ext === ".svg" ? "image/svg+xml" : "application/octet-stream");
          fs.createReadStream(file).pipe(res);
        });
      });
    },
    closeBundle() {
      if (fs.existsSync(brandDir))
        fs.cpSync(brandDir, path.resolve(appDir, "dist/brand"), { recursive: true });
      if (fs.existsSync(sharedPublicDir))
        fs.cpSync(sharedPublicDir, path.resolve(appDir, "dist"), { recursive: true });
    },
  };
}

/** Base Vite config shared across all apps. Pass import.meta.dirname as appDir. */
export function sharedViteConfig(appDir: string): Partial<UserConfig> {
  return {
    envDir: rootDir,
    plugins: [brandAssetsPlugin(appDir)],
    resolve: {
      alias: {
        "@i18n":    path.resolve(rootDir, "platform/i18n"),
        "@brand":   brandDir,
        "@shared":  path.resolve(rootDir, "platform/shared"),
        "@api":     path.resolve(rootDir, "packages/api/src/index.ts"),
        "@ui":      path.resolve(rootDir, "packages/ui/src/index.ts"),
        "@stores":  path.resolve(rootDir, "packages/stores/src/index.ts"),
        "@vuetify": path.resolve(rootDir, "packages/vuetify/src/index.ts"),
      },
    },
  };
}

/** Base Vitest/Vite resolve config shared across all apps (no brand plugin needed for tests). */
export function sharedVitestResolve(): UserConfig["resolve"] {
  return {
    alias: {
      "@i18n":    path.resolve(rootDir, "platform/i18n"),
      "@brand":   brandDir,
      "@shared":  path.resolve(rootDir, "platform/shared"),
      "@api":     path.resolve(rootDir, "packages/api/src/index.ts"),
      "@ui":      path.resolve(rootDir, "packages/ui/src/index.ts"),
      "@stores":  path.resolve(rootDir, "packages/stores/src/index.ts"),
      "@vuetify": path.resolve(rootDir, "packages/vuetify/src/index.ts"),
    },
  };
}
