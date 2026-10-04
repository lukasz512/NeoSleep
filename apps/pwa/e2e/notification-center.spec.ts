import { test, expect, type Page } from "@playwright/test";

/**
 * CORE-4: the bell opens the shared glass card (AppGlassPopover). jsdom has
 * no layout, so a real browser checks where it lands: the bell tile sits in
 * the card's top-right corner (16 px inset, like the account menu's avatar)
 * and the phone card fits the screen. Harness: e2e/harness/notification-center.ts.
 */

async function box(page: Page, selector: string) {
  const b = await page.locator(selector).first().boundingBox();
  if (!b) throw new Error(`no box for ${selector}`);
  return b;
}

async function openAndSettle(page: Page) {
  await page.goto("/e2e/harness/notification-center.html?open=1");
  await expect(page.getByRole("dialog", { name: "Notifications" })).toBeVisible();
  // Wait for the flight to land: open class on, no running transition, box still.
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const el = document.querySelector('[data-testid="notification-center"] [data-motion="avatar"]');
        if (!el?.closest(".glass-popover--open")) return false;
        if (el.getAnimations().some((a) => a.playState === "running")) return false;
        const read = () => JSON.stringify(el.getBoundingClientRect());
        const before = read();
        await new Promise((r) => setTimeout(r, 100));
        return before === read();
      }),
    )
    .toBe(true);
}

test("desktop: the bell lands in the card's top-right corner", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await openAndSettle(page);
  const card = await box(page, '[data-testid="notification-center"]');
  const anchor = await box(page, '[data-testid="notification-center"] [data-motion="avatar"]');
  expect(Math.abs(anchor.width - 40)).toBeLessThan(1);
  expect(Math.abs(card.x + card.width - (anchor.x + anchor.width) - 16)).toBeLessThan(1.5);
  expect(Math.abs(anchor.y - card.y - 16)).toBeLessThan(1.5);
  await expect(page.getByText("Needs action")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Notifications" })).toHaveCount(0);
});

test("phone: the card spans the screen with an 8 px margin", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openAndSettle(page);
  const card = await box(page, '[data-testid="notification-center"]');
  expect(Math.abs(card.x - 8)).toBeLessThan(1);
  expect(Math.abs(card.width - (390 - 16))).toBeLessThan(1);
  expect(card.y + card.height).toBeLessThanOrEqual(844);
});

test("phone: pulling the card up from a row closes it, like the account card", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openAndSettle(page);
  // the fixture list fits on the screen, so the whole card takes the swipe
  await expect(page.locator(".notif-center__list.glass-popover__scroll--fits")).toHaveCount(1);
  const row = await box(page, '[data-testid="notif-row-n3"]');
  await page.mouse.move(row.x + row.width / 2, row.y + row.height / 2);
  await page.mouse.down();
  await page.mouse.move(row.x + row.width / 2, row.y - 60, { steps: 4 });
  await page.mouse.move(row.x + row.width / 2, row.y - 160, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByRole("dialog", { name: "Notifications" })).toHaveCount(0);
});
