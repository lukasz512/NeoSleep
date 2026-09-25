import { test, expect, type Page } from "@playwright/test";

/**
 * Real-browser guard for the NEO-56 breadcrumbs, on all three engines.
 * Uses e2e/harness/breadcrumbs.html (Vite dev only, no API/DB). What only a
 * real layout engine can tell us:
 *
 * - the desktop/phone swap at MOBILE_BREAKPOINT (768px): breadcrumbs XOR back arrow
 * - a very long name ellipsizes instead of pushing the action icons off-screen
 *   or wrapping the row, and its full text is reachable in a tooltip
 * - the loading skeleton keeps the row's height (nothing jumps on load)
 * - 44px touch targets and a visible keyboard focus ring
 */

async function open(page: Page, state: string, width: number) {
  await page.setViewportSize({ width, height: 800 });
  await page.goto(`/e2e/harness/breadcrumbs.html?state=${state}`);
  await expect(page.locator(".view-item__header-row")).toBeVisible();
}

const nav = (page: Page) => page.locator("nav.app-breadcrumbs");
const backBtn = (page: Page) => page.locator(".view-item__back-btn");

test.describe("desktop (≥768px): breadcrumbs, no back arrow", () => {
  test("shows the full trail and hides the arrow", async ({ page }) => {
    await open(page, "record", 1280);
    await expect(nav(page)).toBeVisible();
    await expect(backBtn(page)).toBeHidden();
    await expect(nav(page).locator("a")).toHaveAttribute("href", "/patients");
    await expect(nav(page)).toContainText("Jan Kowalski");
    await expect(nav(page)).toContainText("Mar 12, 1968");
    await expect(nav(page)).toContainText("Follow-up");
    await expect(nav(page).locator('[aria-current="page"]')).toHaveText("Studies");
  });

  test("the swap happens exactly at 768px", async ({ page }) => {
    await open(page, "record", 768);
    await expect(nav(page)).toBeVisible();
    await expect(backBtn(page)).toBeHidden();
    await page.setViewportSize({ width: 767, height: 800 });
    await expect(nav(page)).toBeHidden();
    await expect(backBtn(page)).toBeVisible();
  });

  test("interactive crumbs are ≥44px tall touch targets", async ({ page }) => {
    await open(page, "record", 1280);
    for (const crumb of await nav(page).locator("a, button").all()) {
      const box = await crumb.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  });

  test("keyboard focus on the parent crumb is visibly outlined", async ({ page, browserName }) => {
    // Firefox and Safari on macOS skip links on Tab unless the OS-level "keyboard
    // navigation" setting is on — a platform default, not something the app controls.
    test.skip(browserName !== "chromium", "macOS Firefox/WebKit don't Tab to links by default");
    await open(page, "record", 1280);
    const link = nav(page).locator("a");
    await link.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(link).toBeFocused();
    const outline = await link.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).not.toBe("none");
  });

  test("a very long name ellipsizes; the row stays one line and the actions stay on screen", async ({ page }) => {
    await open(page, "long", 1024);
    const label = nav(page).locator(".app-breadcrumbs__item--record [data-crumb-label]");
    const cut = await label.evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(cut).toBe(true);

    const row = await page.locator(".view-item__header-row").boundingBox();
    expect(row!.height).toBeLessThan(60);
    for (const action of await page.locator(".harness-action").all()) {
      const box = await action.boundingBox();
      expect(box!.x + box!.width).toBeLessThanOrEqual(1024);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("the cut-off name is available in full on hover", async ({ page }) => {
    await open(page, "long", 1024);
    await nav(page).locator(".app-breadcrumbs__item--record .app-breadcrumbs__crumb").hover();
    await expect(page.getByRole("tooltip").filter({ hasText: "Gutiérrez de la Concepción" })).toBeVisible();
  });

  test("loading keeps the row height — nothing jumps when the record arrives", async ({ page }) => {
    await open(page, "loading", 1280);
    await expect(nav(page).locator(".app-breadcrumbs__skeleton")).toBeVisible();
    await expect(nav(page)).toHaveAttribute("aria-busy", "true");
    const loadingHeight = (await page.locator(".view-item__header-row").boundingBox())!.height;
    await open(page, "record", 1280);
    const loadedHeight = (await page.locator(".view-item__header-row").boundingBox())!.height;
    expect(Math.abs(loadedHeight - loadingHeight)).toBeLessThanOrEqual(1);
  });

  test("lead: parent crumb, separator, then the inline name", async ({ page }) => {
    await open(page, "lead", 1280);
    await expect(nav(page).locator("a")).toHaveAttribute("href", "/leads");
    await expect(page.locator(".view-item__header-title")).toHaveText("Maria Wiśniewska");
    const navBox = (await nav(page).boundingBox())!;
    const titleBox = (await page.locator(".view-item__header-title").boundingBox())!;
    expect(titleBox.x).toBeGreaterThanOrEqual(navBox.x + navBox.width - 1);
  });
});

test.describe("phone (<768px): back arrow only", () => {
  test("shows the arrow, hides the breadcrumbs, no horizontal scroll", async ({ page }) => {
    await open(page, "record", 390);
    await expect(backBtn(page)).toBeVisible();
    await expect(nav(page)).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
