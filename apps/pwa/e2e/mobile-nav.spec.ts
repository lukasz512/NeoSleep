import { test, expect, type Page } from "@playwright/test";

/**
 * Real-browser guard for the NEO-161 "Kropla" phone menu, on all three
 * engines. Uses e2e/harness/mobile-nav.html (Vite dev only, no API/DB) — the
 * real AppShell and account menu over a long feed. What only a real layout
 * engine can tell us:
 *
 * - "Close" is exactly where "More" was (the pill never re-flows)
 * - the module capsule opens above the pill, never over it
 * - the pill floats over the content, and the last card scrolls clear of it
 * - the account card's avatar lands on the app bar avatar
 */

async function open(page: Page, query = "") {
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto(`/e2e/harness/mobile-nav.html${query}`);
  await expect(page.locator(".mobile-nav-panel")).toBeVisible();
}

const toggle = (page: Page) => page.locator(".mobile-nav-panel__toggle");
const box = async (page: Page, selector: string) => (await page.locator(selector).first().boundingBox())!;

test("Close sits exactly where More was, and the capsule opens above the pill", async ({ page }) => {
  await open(page);
  const more = (await toggle(page).boundingBox())!;
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".mobile-nav-panel__sheet--open")).toBeVisible();
  // let the spring settle before measuring
  await page.waitForTimeout(600);
  const close = (await toggle(page).boundingBox())!;
  expect(Math.abs(close.x - more.x)).toBeLessThan(1);
  expect(Math.abs(close.y - more.y)).toBeLessThan(1);
  const sheet = await box(page, ".mobile-nav-panel__sheet");
  const pill = await box(page, ".mobile-nav-panel");
  expect(sheet.y + sheet.height).toBeLessThanOrEqual(pill.y);

  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
});

test("the pill floats over the page, and the last card scrolls clear of it", async ({ page }) => {
  await open(page);
  const pill = await box(page, ".mobile-nav-panel");
  expect(pill.x).toBeGreaterThan(0);
  expect(pill.y + pill.height).toBeLessThan(780);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const last = await box(page, ".harness-card:last-child");
  const pillAfter = await box(page, ".mobile-nav-panel");
  expect(last.y + last.height).toBeLessThanOrEqual(pillAfter.y);
});

test("the account card lands on the app bar avatar", async ({ page }) => {
  await open(page);
  const trigger = await box(page, '[data-motion="trigger-avatar"]');
  await page.locator(".harness-avatar-btn").click();
  await expect(page.getByRole("dialog", { name: "User menu" })).toBeVisible();
  await page.waitForTimeout(600);
  const avatar = await box(page, '.account-menu__card [data-motion="avatar"]');
  const centre = (b: { x: number; y: number; width: number; height: number }) => [b.x + b.width / 2, b.y + b.height / 2];
  const [tx, ty] = centre(trigger);
  const [ax, ay] = centre(avatar);
  expect(Math.abs(tx - ax)).toBeLessThan(2);
  expect(Math.abs(ty - ay)).toBeLessThan(2);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "User menu" })).toHaveCount(0);
});
