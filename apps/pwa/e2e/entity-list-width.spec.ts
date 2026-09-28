import { test, expect, type Page } from "@playwright/test";

/**
 * Phone list rows run the sheet's whole width, edge to edge, like the desktop
 * table's rows (NEO-152) — the ruled line under each row and its hover/press
 * tint reach both sheet edges, while the avatar and the kebab stay on the
 * page's content line (28 px in). Uses e2e/harness/entity-list.html (Vite dev
 * only, no API/DB). Regression: the feed's bleed sat inside its own scroll
 * container (overflow-y: auto clips overflow-x too), so rows stopped 28 px
 * short of each edge on phones.
 */

async function open(page: Page, width: number) {
  await page.setViewportSize({ width, height: 740 });
  await page.goto("/e2e/harness/entity-list.html");
}

const sheetBox = (page: Page) => page.getByTestId("harness-sheet").boundingBox();

for (const width of [320, 375, 430]) {
  test.describe(`phone ${width}px`, () => {
    test("rows span the sheet edge to edge; avatar and kebab stay on the content line", async ({ page }) => {
      await open(page, width);
      const cards = page.locator(".app-entity-list__card");
      await expect(cards).toHaveCount(5);
      const sheet = (await sheetBox(page))!;
      for (const card of await cards.all()) {
        const row = (await card.boundingBox())!;
        expect(Math.round(row.x)).toBe(Math.round(sheet.x));
        expect(Math.round(row.x + row.width)).toBe(Math.round(sheet.x + sheet.width));
      }
      const avatar = (await page.locator(".app-entity-list__card-avatar").first().boundingBox())!;
      expect(Math.round(avatar.x - sheet.x)).toBe(28);
      const side = (await page.locator(".app-entity-list__card-side").first().boundingBox())!;
      expect(Math.round(sheet.x + sheet.width - (side.x + side.width))).toBe(16);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const feed = page.locator(".app-entity-list__feed-scroll");
      expect(await feed.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    });
  });
}

test("desktop: table rows span the sheet edge to edge (unchanged)", async ({ page }) => {
  await open(page, 1280);
  const row = page.locator(".app-entity-list__table tbody tr").first();
  await expect(row).toBeVisible();
  const sheet = (await sheetBox(page))!;
  const box = (await row.boundingBox())!;
  expect(Math.round(box.x)).toBe(Math.round(sheet.x));
  expect(Math.round(box.x + box.width)).toBe(Math.round(sheet.x + sheet.width));
});
