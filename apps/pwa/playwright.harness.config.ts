import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";
import { harnessPort } from "./harnessPort";

/**
 * NEO-182: the harness-only e2e specs (they load /e2e/harness/*.html — no API,
 * no DB), run locally by .husky/pre-push when a push changes .vue/.css/.scss.
 * Chromium only, on its own port so it never reuses a dev server from another
 * worktree (which would test different code). CI still runs the full suite in
 * three engines via playwright.config.ts.
 * The port is per worktree (CORE-126, harnessPort.ts); E2E_HARNESS_PORT overrides it.
 */
const PORT = Number(process.env.E2E_HARNESS_PORT) || harnessPort(fileURLToPath(new URL(".", import.meta.url)));

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: "line",
  use: {
    baseURL: `http://localhost:${PORT}`,
    serviceWorkers: "block",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm exec vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/e2e/harness/dialog-header.html`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
