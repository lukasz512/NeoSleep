import { test, expect, type Page } from "@playwright/test";

/**
 * ADR-020 cross-browser auth coverage. See playwright.config.ts's doc comment
 * for why these specific scenarios and not more: only what a real browser
 * engine — not apps/pwa's jsdom-based Vitest suite, not apps/api's Postgres
 * integration tests — can actually catch. Uses the one deterministic user
 * seeded by apps/api/scripts/seed-e2e-user.ts.
 */

const EMAIL = "e2e-auth@neosleepcare.com";
const PASSWORD = "e2e-correct-horse-battery-staple";

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard");
}

// Pure app logic (form validation, error display) — not browser-engine-dependent,
// so run once rather than tripled across chromium/firefox/webkit. See config doc.
test.describe("login form", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "app logic only, not browser-engine-dependent");

  test("happy path reaches the dashboard", async ({ page }) => {
    await login(page);
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("wrong password shows an error and stays on /login", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(EMAIL);
    await page.getByLabel("Password", { exact: true }).fill("definitely-the-wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    // Vuetify renders an (empty, always-present) role="alert" per input's
    // validation-message slot too — scope to the one with actual error text.
    await expect(page.getByRole("alert").filter({ hasText: "Invalid email or password" })).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});

// Everything below genuinely differs by browser engine (real reload/JS-realm
// teardown, bfcache, multi-context storage) — run on all three.
test.describe("session persistence across a real reload", () => {
  test("access token is memory-only and lost on reload, but the session silently recovers via the refresh token", async ({ page }) => {
    await login(page);
    await page.reload();
    // A broken silent-refresh would bounce back to /login instead — the URL
    // check alone is the real assertion; nothing on /dashboard renders a
    // role="alert" at all, so there's no login-error element to check here.
    await expect(page).toHaveURL(/\/dashboard/);
  });
});

test.describe("back/forward navigation (bfcache)", () => {
  test("browser-back after navigating away keeps the session functional", async ({ page }) => {
    await login(page);
    await page.goto("/login"); // any other in-app navigation would do
    await page.goBack();
    await expect(page).toHaveURL(/\/dashboard/);
    // A page restored from bfcache with a dead in-memory token reference would
    // still show the URL as authenticated but fail the next real API call —
    // force one via a reload-independent action: a fresh navigation attempt.
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);
  });
});

test.describe("logout is per-device", () => {
  test("logging out in one browser context does not affect a second concurrent session", async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    await login(pageA);
    await login(pageB);

    // Logout in A: open the user menu (AppLayout.vue's .layout-user-btn), then
    // click the logout icon button (AppUserMenuPanel.vue, i18n key
    // user.settings.logOut). NEO-9 made this an icon-only VBtn wrapped in a
    // VTooltip — the tooltip's own overlay also contains the text "Log out"
    // but stays hidden until hovered, so getByText matched that instead of
    // the button and failed with "element is not visible". The button's
    // accessible name (its aria-label) is the only reliable way to target it.
    await pageA.locator(".layout-user-btn").click();
    await pageA.getByRole("button", { name: "Log out" }).click();
    await pageA.waitForURL("**/login");

    // B must still be able to reload and stay authenticated.
    await pageB.reload();
    await expect(pageB).toHaveURL(/\/dashboard/);

    await contextA.close();
    await contextB.close();
  });
});
