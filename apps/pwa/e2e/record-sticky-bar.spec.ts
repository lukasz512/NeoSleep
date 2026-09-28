import { test, expect, type Page } from "@playwright/test";

/**
 * NEO-158, real browser: on phones, once the record header scrolls away a
 * slim bar pins at the top with the name (one line), the main action and "⋯"
 * with the rest — delete last. Uses e2e/harness/breadcrumbs.html?state=scroll
 * (Vite dev only, no API/DB). What only a layout engine can tell us: that the
 * bar really stays put while the page scrolls, that opening its menu doesn't
 * scroll the page back up, and that nothing overflows sideways.
 */

async function open(page: Page, width: number) {
  await page.setViewportSize({ width, height: 640 });
  await page.goto("/e2e/harness/breadcrumbs.html?state=scroll");
  await expect(page.locator("h1")).toBeVisible();
}

const bar = (page: Page) => page.getByTestId("record-sticky-bar");
const scrollPastHeader = (page: Page) =>
  page.evaluate(() => {
    const header = document.querySelector("header.view-item__record-header")!;
    window.scrollTo(0, header.getBoundingClientRect().bottom + window.scrollY);
  });

for (const width of [320, 375, 390, 430]) {
  test.describe(`phone ${width}px`, () => {
    test("hidden while the header shows, pinned once it has scrolled away", async ({ page }) => {
      await open(page, width);
      await expect(bar(page)).not.toHaveClass(/record-bar--visible/);
      await scrollPastHeader(page);
      await expect(bar(page)).toHaveClass(/record-bar--visible/);
      // Past its 160 ms slide-in.
      await expect(bar(page)).toHaveCSS("opacity", "1");
      await expect(bar(page)).toHaveCSS("transform", "none");
      const before = (await bar(page).boundingBox())!;
      await page.evaluate(() => window.scrollBy(0, 400));
      const after = (await bar(page).boundingBox())!;
      expect(Math.round(after.y)).toBe(Math.round(before.y));
      expect(before.x + before.width).toBeLessThanOrEqual(width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });

    test("the name is one line; main action next to it, the rest in ⋯ with delete last", async ({ page }) => {
      await open(page, width);
      await scrollPastHeader(page);
      const title = page.getByTestId("record-sticky-bar-title");
      await expect(title).toHaveText("Jan Kowalski");
      const box = await title.evaluate((el) => ({ h: el.getBoundingClientRect().height, lh: parseFloat(getComputedStyle(el).lineHeight) }));
      expect(box.h).toBeLessThanOrEqual(box.lh + 1);

      await expect(page.getByTestId("record-sticky-bar-primary")).toHaveAttribute("aria-label", "Plan visit");
      await page.getByTestId("record-sticky-bar-primary").click();
      await expect(page.locator("body")).toHaveAttribute("data-clicked", "Plan visit");

      const scrollY = await page.evaluate(() => window.scrollY);
      await page.getByTestId("record-sticky-bar-more").click();
      await expect(page.getByTestId("record-sticky-bar-menu-item")).toHaveText(["Edit", "Delete"]);
      // Opening the menu must not scroll the page back up to the header.
      expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
      await page.getByTestId("record-sticky-bar-menu-item").last().click();
      await expect(page.locator("body")).toHaveAttribute("data-clicked", "Delete");
      await expect(bar(page)).toHaveClass(/record-bar--visible/);
    });

    test("scrolling back up hides it again", async ({ page }) => {
      await open(page, width);
      await scrollPastHeader(page);
      await expect(bar(page)).toHaveClass(/record-bar--visible/);
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect(bar(page)).not.toHaveClass(/record-bar--visible/);
    });
  });
}

test("desktop: no sticky bar", async ({ page }) => {
  await open(page, 1280);
  await expect(bar(page)).toHaveCount(0);
});
