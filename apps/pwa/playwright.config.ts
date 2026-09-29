import { defineConfig, devices } from "@playwright/test";

/**
 * ADR-020: covers exactly the auth behaviors a real browser engine is needed
 * for — a true page reload/JS-realm teardown, bfcache restore on back/forward
 * navigation (Safari's bfcache is the most aggressive of the three), and real
 * multi-tab/multi-context session isolation. Everything else about the token
 * rotation flow (expiry, reuse detection, revocation) is pure server logic,
 * already covered by apps/api's real-Postgres integration tests — it is not
 * re-tested here across three engines, that would be padding, not signal.
 *
 * `webServer` starts both the API (against a real Postgres, same as CI) and
 * the PWA dev server. Dev mode (not a production build) is deliberate here —
 * its Vite proxy already routes /api and /auth to the API same-origin (see
 * vite.config.ts's devApiTarget), which is exactly what avoids re-litigating
 * a CORS/port-allowlist question for a suite whose whole point is auth
 * behavior, not build-output correctness (that's covered by `pnpm build` in
 * CI's normal pipeline, separately).
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: [
    {
      command: "pnpm --filter @neo/api dev",
      url: "http://localhost:3000/health",
      reuseExistingServer: !process.env.CI,
      cwd: "../..",
      timeout: 60_000,
      // A realistic multi-browser run makes 10+ genuine login calls within
      // minutes — normal E2E traffic, not credential stuffing. See auth.ts's
      // own comment on loginRateLimiter for why this is safe to raise only
      // here (unset everywhere else, production included).
      //
      // OrthoApnea credentials are blanked so the API's login() short-circuits
      // with "not configured" instead of making a real request to the
      // partner's production server (apneadock.es) — every login here lands
      // on AppLayout, which preloads partner resources. CI's job-level env
      // only carries a placeholder for apps/api's fetch-mocked unit tests;
      // with it, each E2E run fired ~10 real logins with fake credentials at
      // the partner. Set here (not just omitted from .env) because a real
      // env var wins over tsx --env-file, and the CI job env is inherited.
      env: { LOGIN_RATE_LIMIT_MAX: "1000", ORTHOAPNEA_EMAIL: "", ORTHOAPNEA_PASSWORD: "" },
    },
    {
      command: "pnpm dev",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
