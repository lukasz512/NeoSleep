import { test, expect, type Page } from "@playwright/test";

/**
 * CORE-149: the doctor's Estudios / Tratamientos queue chips are part of the
 * page's frame, not of its data. They paint with the skeleton (counts held by
 * placeholders the size of a number), so nothing moves when the counts and
 * the rows land, and they stay over an empty list. Uses
 * e2e/harness/entity-list.html (Vite dev only, no API/DB).
 */

async function open(page: Page, width: number, params: string) {
  await page.setViewportSize({ width, height: 740 });
  await page.goto(`/e2e/harness/entity-list.html?queues=1&${params}`);
}

for (const width of [390, 1280]) {
  test.describe(`${width}px`, () => {
    test("chips are on screen with the skeleton, before any count", async ({ page }) => {
      await open(page, width, "hold=1");
      await expect(page.locator(".app-entity-list__skeleton")).toBeVisible();
      await expect(page.getByTestId("entity-list-queues")).toBeVisible();
      await expect(page.getByTestId("entity-list-queue-count-pending")).toHaveCount(3);
    });

    test("nothing below the chips moves when the counts and rows land", async ({ page }) => {
      await open(page, width, "countsMs=600&listMs=600");
      const chips = page.getByTestId("entity-list-queues");
      await expect(page.locator(".app-entity-list__skeleton")).toBeVisible();
      const chipsBefore = (await chips.boundingBox())!;
      const skeletonTop = (await page.locator(".app-entity-list__skeleton").boundingBox())!.y;
      await expect(page.getByTestId("entity-list-queue-count-active")).toHaveText("3");
      const listTop = (await page.locator(".app-entity-list__table-wrap").boundingBox())!.y;
      const chipsAfter = (await chips.boundingBox())!;
      // Measured from the chips: this harness has no page header, so the
      // toolbar (teleported there in the app) lands inline above them.
      expect(Math.round(chipsAfter.height)).toBe(Math.round(chipsBefore.height));
      expect(Math.round(chipsAfter.width)).toBe(Math.round(chipsBefore.width));
      expect(Math.round(listTop - chipsAfter.y)).toBe(Math.round(skeletonTop - chipsBefore.y));
    });

    test("an empty list keeps its chips, with zeros", async ({ page }) => {
      await open(page, width, "empty=1&countsMs=300&listMs=300");
      await expect(page.locator(".app-entity-list__empty-wrap")).toBeVisible();
      await expect(page.getByTestId("entity-list-queues")).toBeVisible();
      await expect(page.getByTestId("entity-list-queue-count-action")).toHaveText("0");
    });
  });
}
