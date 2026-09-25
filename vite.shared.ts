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
import type { Alias, Plugin, UserConfig } from "vite";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export const brandDir = path.resolve(rootDir, "packages/brand");

/**
 * Workspace import aliases. `@vuetify` (our shared factory package) must match
 * only the bare specifier: a plain string alias also captures every
 * `@vuetify/<sub>` import, and Vuetify 4 itself imports its own `@vuetify/v0`
 * dependency, which would otherwise resolve into packages/vuetify.
 */
function workspaceAliases(): Alias[] {
  return [
    { find: "@i18n",       replacement: path.resolve(rootDir, "packages/i18n") },
    { find: "@brand",      replacement: brandDir },
    { find: "@api",        replacement: path.resolve(rootDir, "apps/api/client/src/index.ts") },
    { find: "@ui",         replacement: path.resolve(rootDir, "packages/ui/src/index.ts") },
    { find: "@stores",     replacement: path.resolve(rootDir, "packages/stores/src/index.ts") },
    { find: /^@vuetify$/,  replacement: path.resolve(rootDir, "packages/vuetify/src/index.ts") },
    { find: "@documents-browser", replacement: path.resolve(rootDir, "packages/documents/src/browser/index.ts") },
  ];
}

/** Brand assets served at /brand in dev; copied to dist/brand at build time. */
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
    },
  };
}

/**
 * Libraries that must exist exactly once in a bundle: each keeps its state in
 * module-level injection keys / singletons. pnpm can install two copies of the
 * same version (different optional peers → different store paths, e.g.
 * vue-router 5 once for apps/pwa and once for packages/ui), and the bundle then
 * contains both: packages/ui's useRoute() asks its own copy, finds no router,
 * and the login screen crashes ("reading 'query'"). dedupe resolves every import
 * from the app root instead.
 */
const SINGLETON_DEPS = ["vue", "vue-router", "pinia", "vue-i18n", "vuetify", "@vue/devtools-api"];

/** Base Vite config shared across all apps. Pass import.meta.dirname as appDir. */
export function sharedViteConfig(appDir: string): Partial<UserConfig> {
  return {
    envDir: rootDir,
    plugins: [brandAssetsPlugin(appDir)],
    resolve: { dedupe: SINGLETON_DEPS, alias: workspaceAliases() },
  };
}

/** Base Vitest/Vite resolve config shared across all apps (no brand plugin needed for tests). */
export function sharedVitestResolve(): UserConfig["resolve"] {
  return { dedupe: SINGLETON_DEPS, alias: workspaceAliases() };
}
