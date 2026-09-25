import { test, expect, type Page } from "@playwright/test";

/**
 * Real-browser guard for the NEO-56 record header (Salesforce Lightning /
 * Veeva pattern), on all three engines. Uses e2e/harness/breadcrumbs.html
 * (Vite dev only, no API/DB). What only a real layout engine can tell us:
 *
 * - the same header on desktop and phone, no back arrow while there's a record
 * - the small eyebrow link still has a 44px-tall hit area
 * - a very long name wraps (never truncated — it's the record's identity)
 *   without pushing the actions off-screen or scrolling the page sideways
 * - the loading placeholder keeps the header's height (nothing jumps)
 */

async function open(page: Page, state: string, width: number) {
  await page.setViewportSize({ width, height: 800 });
  await page.goto(`/e2e/harness/breadcrumbs.html?state=${state}`);
  await expect(page.locator(".view-item")).toBeVisible();
}

const header = (page: Page) => page.locator("header.view-item__record-header");
const eyebrow = (page: Page) => header(page).locator("nav.app-breadcrumbs a");
const backBtn = (page: Page) => page.locator(".view-item__back-btn");
const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

for (const [device, width] of [["desktop", 1280], ["phone", 390]] as const) {
  test.describe(`${device} (${width}px)`, () => {
    test("record header: tile, parent eyebrow link, name as h1, actions — no back arrow", async ({ page }) => {
      await open(page, "record", width);
      await expect(header(page)).toBeVisible();
      await expect(backBtn(page)).toHaveCount(0);
      await expect(header(page).locator(".view-item__tile")).toBeVisible();
      await expect(eyebrow(page)).toHaveAttribute("href", "/patients");
      await expect(page.locator("h1")).toHaveText("Jan Kowalski");
      await expect(page.locator(".harness-action")).toHaveCount(3);
      expect(await noSideScroll(page)).toBe(true);
    });

    test("the eyebrow link has a ≥44px-tall hit area", async ({ page }) => {
      await open(page, "record", width);
      const box = (await eyebrow(page).boundingBox())!;
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      for (const dy of [-20, 20]) {
        const hit = await page.evaluate(
          ([x, y]) => !!document.elementFromPoint(x!, y!)?.closest("nav.app-breadcrumbs a"),
          [cx, cy + dy],
        );
        expect(hit, `tap ${dy}px from the link's centre`).toBe(true);
      }
    });

    test("a very long name wraps in full; actions stay on screen", async ({ page }) => {
      await open(page, "long", width);
      const h1 = page.locator("h1");
      await expect(h1).toContainText("y Santa Cruz");
      expect(await h1.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      for (const action of await page.locator(".harness-action").all()) {
        const b = (await action.boundingBox())!;
        expect(b.x + b.width).toBeLessThanOrEqual(width);
      }
      expect(await noSideScroll(page)).toBe(true);
    });

    test("loading keeps the header's height — nothing jumps when the record arrives", async ({ page }) => {
      await open(page, "loading", width);
      await expect(header(page).locator(".view-item__record-title-skeleton")).toBeVisible();
      const loading = (await header(page).boundingBox())!.height;
      await open(page, "record", width);
      const loaded = (await header(page).boundingBox())!.height;
      expect(Math.abs(loaded - loading)).toBeLessThanOrEqual(1);
    });

    test("no record (not found): the back arrow, no record header", async ({ page }) => {
      await open(page, "notfound", width);
      await expect(backBtn(page)).toBeVisible();
      await expect(header(page)).toHaveCount(0);
    });
  });
}

test("keyboard focus on the eyebrow link is visibly outlined", async ({ page, browserName }) => {
  // Firefox and Safari on macOS skip links on Tab unless the OS-level "keyboard
  // navigation" setting is on — a platform default, not something the app controls.
  test.skip(browserName !== "chromium", "macOS Firefox/WebKit don't Tab to links by default");
  await open(page, "record", 1280);
  await page.keyboard.press("Tab");
  await expect(eyebrow(page)).toBeFocused();
  expect(await eyebrow(page).evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe("none");
});
