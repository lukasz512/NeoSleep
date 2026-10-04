import { test, expect, type Page } from "@playwright/test";

/**
 * CORE-122: the Calendario's layout per width — only a real browser measures
 * the container. Desktop keeps the sidebar beside the grid; a tablet folds it
 * behind a button; a phone gets the two-row glass header, a week that scrolls
 * sideways inside the grid (never the page) and a month with that day's list.
 * Harness: e2e/harness/calendar.ts.
 */
async function open(page: Page, width: number, height: number): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.goto("/e2e/harness/calendar.html?lang=mx");
  await expect(page.locator(".cal__toolbar")).toBeVisible();
}

async function noPageScrollX(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

test("desktop: sidebar beside the grid, the day headers sit below the floating toolbar", async ({ page }) => {
  await open(page, 1280, 820);
  await page.locator('[data-testid="calendar-view-week"]').click();
  await expect(page.locator(".cal__side")).toBeVisible();
  await expect(page.locator('[data-testid="calendar-sidebar-toggle"]')).toHaveCount(0);
  const toolbar = await page.locator(".cal__toolbar").boundingBox();
  const daynum = await page.locator(".cal-tg__daynum").first().boundingBox();
  expect(daynum!.y).toBeGreaterThanOrEqual(toolbar!.y + toolbar!.height);
  await expect(page.locator('[data-testid="calendar-event"]').first()).toBeVisible();
});

test("tablet: the sidebar opens as a panel from the toolbar button", async ({ page }) => {
  await open(page, 820, 1000);
  const toggle = page.locator('[data-testid="calendar-sidebar-toggle"]');
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(page.locator(".cal--side-open .cal__side")).toBeVisible();
  await page.locator(".cal__scrim").click({ position: { x: 700, y: 500 } });
  await expect(page.locator(".cal--side-open")).toHaveCount(0);
});

test("phone: the week scrolls inside the grid, the month shows that day's list", async ({ page }) => {
  await open(page, 390, 844);
  await page.locator('[data-testid="calendar-view-week"]').click();
  await expect(page.locator(".cal-tg--multi")).toBeVisible();
  await expect.poll(() => page.locator(".cal__body").evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  await noPageScrollX(page);

  await page.locator('[data-testid="calendar-view-month"]').click();
  await expect(page.locator('[data-testid="calendar-month"]')).toBeVisible();
  await expect(page.locator('[data-testid="calendar-list"]')).toBeVisible();
  await noPageScrollX(page);
});
