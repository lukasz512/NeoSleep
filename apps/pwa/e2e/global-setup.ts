import { execFileSync } from "node:child_process";
import { chromium, type FullConfig } from "@playwright/test";

const EMAIL = "e2e-auth@neosleepcare.com";
const PASSWORD = "e2e-correct-horse-battery-staple";

/** Seeds the one deterministic user every auth.spec.ts scenario logs in as —
 *  see apps/api/scripts/seed-e2e-user.ts. Runs once before the whole suite,
 *  against whichever DATABASE_URL the API webServer process is using. */
function seedE2EUser(): void {
  execFileSync("pnpm", ["--filter", "@neo/api", "seed:e2e-user"], {
    cwd: "../..",
    stdio: "inherit",
  });
}

/**
 * Loads /login and /dashboard once before any test runs. A cold Vite dev
 * server compiles every module on first request — each Vuetify component's
 * Sass alone took 13-16 s under parallel load — so whichever tests hit a page
 * first spent most of their 30 s budget waiting for the "load" event (NEO-56's
 * CI run: the first two chromium tests timed out in page.goto, and webkit's
 * two-login logout test ran out of time on its final reload). Vite keeps the
 * compiled modules in memory, so paying that cost here, with a generous
 * timeout, leaves the tests measuring the app instead of the compiler.
 * webServer is already up when globalSetup runs.
 */
async function warmUpDevServer(baseURL: string): Promise<void> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ baseURL });
    page.setDefaultTimeout(180_000);
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(EMAIL);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/dashboard");
    await page.waitForLoadState("networkidle");
    // Public pages outside the logged-in shell compile separately — the
    // partner-registration specs' first page.goto timed out in WebKit on PR #233.
    // An invalid token is enough: the view and its children still get compiled.
    await page.goto("/partner-register?token=warm-up");
    await page.waitForLoadState("networkidle");
  } finally {
    await browser.close();
  }
}

export default async function globalSetup(config: FullConfig): Promise<void> {
  seedE2EUser();
  const baseURL = config.projects[0]?.use.baseURL;
  if (baseURL) await warmUpDevServer(baseURL);
}
