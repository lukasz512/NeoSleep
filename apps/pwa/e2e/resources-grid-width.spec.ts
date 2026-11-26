import { test, expect, type Page } from "@playwright/test";

/**
 * Resources video grid (NEO-234): 4 cards per row on desktop and nothing
 * scrolls sideways. Regression: each card's hover tint bled 6 px past its cell
 * (margin: -6px), and the view's scroll container (overflow-y: auto makes
 * overflow-x auto too) let the right column scroll left and right. Uses
 * e2e/harness/resources.html (no API/DB).
 */

async function open(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/e2e/harness/resources.html");
  await expect(page.getByTestId("resource-video-tile")).toHaveCount(12);
}

for (const width of [375, 900, 1280, 1680]) {
  test(`${width}px: the resources window never scrolls sideways`, async ({ page }) => {
    await open(page, width);
    const window_ = page.locator(".view-resources__window");
    expect(await window_.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByTestId("resource-video-tile").nth(3).hover();
    expect(await window_.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  });
}

test("desktop: 4 cards per row, the hover tint still reaches past the frame", async ({ page }) => {
  await open(page, 1680);
  const tiles = page.getByTestId("resource-video-tile");
  const ys = await Promise.all((await tiles.all()).slice(0, 5).map(async (t) => (await t.boundingBox())!.y));
  expect(ys.filter((y) => Math.abs(y - ys[0]) < 1)).toHaveLength(4);
  const card = (await tiles.nth(0).boundingBox())!;
  const thumb = (await tiles.nth(0).locator(".video-card__thumb").boundingBox())!;
  expect(Math.round(thumb.x - card.x)).toBe(6);
});
