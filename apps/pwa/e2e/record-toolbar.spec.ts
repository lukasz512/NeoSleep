import { test, expect, type Page } from "@playwright/test";

/**
 * NEO-181, real browser: on phones the record has a toolbar from the start —
 * ‹ back, the main action, "⋯" with the rest (delete last) — and the header
 * collapses into it with the scroll itself: the avatar shrinks to icon size
 * and the name docks next to ‹, and scrolling back retraces it. Uses
 * e2e/harness/breadcrumbs.html?state=scroll (Vite dev only, no API/DB).
 * What only a layout engine can tell us: where things actually land, that the
 * motion is continuous (no jump between two scroll positions a pixel apart),
 * and that opening the menu doesn't scroll the page.
 */

async function open(page: Page, width: number, state = "scroll") {
  await page.setViewportSize({ width, height: 640 });
  await page.goto(`/e2e/harness/breadcrumbs.html?state=${state}`);
  await expect(page.locator("h1")).toBeVisible();
}

const toolbar = (page: Page) => page.getByTestId("record-toolbar");
const box = async (page: Page, selector: string) => (await page.locator(selector).first().boundingBox())!;
/** Scroll far enough for the header to have fully docked, and let a settle (if any) finish. */
async function scrollTo(page: Page, y: number) {
  await page.evaluate((y) => window.scrollTo(0, y), y);
  await page.waitForTimeout(400);
}
const docked = (page: Page) =>
  page.evaluate(() => {
    const root = document.querySelector<HTMLElement>(".view-item")!;
    const cs = getComputedStyle(root);
    return parseFloat(cs.getPropertyValue("--rh-start")) + parseFloat(cs.getPropertyValue("--rh-R"));
  });

for (const width of [320, 375, 390, 430]) {
  test.describe(`phone ${width}px`, () => {
    test("toolbar from the start: ‹ back, main action, ⋯; the icon row is gone", async ({ page }) => {
      await open(page, width);
      await expect(toolbar(page)).toBeVisible();
      await expect(page.getByTestId("record-toolbar-back")).toHaveAttribute("href", "/patients");
      await expect(page.getByTestId("record-toolbar-primary")).toHaveAttribute("aria-label", "Plan visit");
      await expect(page.getByTestId("record-toolbar-more")).toBeVisible();
      await expect(page.locator(".harness-action").first()).toBeHidden();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });

    test("docked: ‹, the avatar at icon size and the name sit inside the toolbar row", async ({ page }) => {
      await open(page, width);
      await scrollTo(page, (await docked(page)) + 200);
      const bar = (await toolbar(page).boundingBox())!;
      const back = await box(page, '[data-testid="record-toolbar-back"] svg');
      const avatar = await box(page, ".view-item__record-header > :first-child");
      const title = await box(page, "h1");
      const primary = await box(page, '[data-testid="record-toolbar-primary"]');
      for (const b of [back, avatar, title]) {
        expect(b.y).toBeGreaterThanOrEqual(bar.y - 1);
        expect(b.y + b.height).toBeLessThanOrEqual(bar.y + bar.height + 1);
      }
      expect(avatar.width).toBeGreaterThan(20);
      expect(avatar.width).toBeLessThan(28);
      // Left to right: ‹ · avatar · name · actions.
      expect(back.x + back.width).toBeLessThanOrEqual(avatar.x + 1);
      expect(avatar.x + avatar.width).toBeLessThanOrEqual(title.x + 1);
      expect(title.x).toBeLessThan(primary.x);
      await expect(page.getByTestId("record-toolbar-back")).toBeVisible();
    });

    test("follows the scroll continuously and retraces on the way back", async ({ page }) => {
      await open(page, width);
      const end = await docked(page);
      const start = end - (await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector(".view-item")!).getPropertyValue("--rh-R"))));
      // Each sample pairs the name's position with the scroll it was taken at —
      // the settle-on-release may move the page between steps, so compare
      // against where the page really is, not where the step asked it to be.
      const samples: { s: number; y: number }[] = [];
      for (let s = start; s <= end; s += 6) {
        await page.evaluate((s) => window.scrollTo({ top: s, behavior: "instant" }), s);
        await page.evaluate(() => new Promise(requestAnimationFrame));
        samples.push(
          await page.evaluate(() => ({
            s: window.scrollY,
            y: document.querySelector("h1")!.getBoundingClientRect().y,
          })),
        );
      }
      samples.sort((a, b) => a.s - b.s);
      // The name moves up as the page does (within sub-pixel rounding), never
      // jumping: at most ~2 px of travel per 1 px of scroll.
      for (let i = 1; i < samples.length; i++) {
        const ds = samples[i]!.s - samples[i - 1]!.s;
        const dy = samples[i - 1]!.y - samples[i]!.y;
        expect(dy).toBeGreaterThanOrEqual(-1.5);
        expect(dy).toBeLessThanOrEqual(2 * ds + 1.5);
      }
      await scrollTo(page, 0);
      const avatar = await box(page, ".view-item__record-header > :first-child");
      expect(avatar.width).toBeGreaterThan(36);
    });

    test("letting go halfway settles open or docked", async ({ page }) => {
      await open(page, width);
      const end = await docked(page);
      const R = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector(".view-item")!).getPropertyValue("--rh-R")));
      await page.evaluate((y) => window.scrollTo(0, y), end - R * 0.3);
      await page.evaluate(() => window.dispatchEvent(new Event("scrollend")));
      await page.waitForTimeout(700);
      expect(Math.abs((await page.evaluate(() => window.scrollY)) - end)).toBeLessThanOrEqual(2);
    });

    test("the main action and the ⋯ menu run the original buttons; opening it doesn't scroll", async ({ page }) => {
      await open(page, width);
      await scrollTo(page, (await docked(page)) + 200);
      await page.getByTestId("record-toolbar-primary").click();
      await expect(page.locator("body")).toHaveAttribute("data-clicked", "Plan visit");
      const scrollY = await page.evaluate(() => window.scrollY);
      await page.getByTestId("record-toolbar-more").click();
      await expect(page.getByTestId("record-toolbar-menu-item")).toHaveText(["Edit", "Delete"]);
      expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
      // Let the menu finish opening: Playwright scrolls a still-moving target "into view" itself.
      await page.waitForTimeout(350);
      await page.getByTestId("record-toolbar-menu-item").last().click();
      await expect(page.locator("body")).toHaveAttribute("data-clicked", "Delete");
      expect(Math.abs((await page.evaluate(() => window.scrollY)) - scrollY)).toBeLessThanOrEqual(1);
    });
  });
}

test("a short record stays open (nothing to dock into)", async ({ page }) => {
  await open(page, 390, "record");
  await page.evaluate(() => window.scrollTo(0, 40));
  await page.evaluate(() => window.dispatchEvent(new Event("scrollend")));
  await page.waitForTimeout(700);
  const avatar = await box(page, ".view-item__record-header > :first-child");
  expect(avatar.width).toBeGreaterThan(36);
});

test("desktop: no toolbar, the header keeps its own actions", async ({ page }) => {
  await open(page, 1280);
  await expect(toolbar(page)).toHaveCount(0);
  await expect(page.locator(".harness-action").first()).toBeVisible();
});
