import { test, expect, type Page } from "@playwright/test";

/**
 * Real-browser guard for the NEO-56 record header (Salesforce Lightning /
 * Veeva pattern), on all three engines. Uses e2e/harness/breadcrumbs.html
 * (Vite dev only, no API/DB) — ItemDetailLayout alone, without AppLayout, so
 * the "← <Module>" row/app bar (NEO-55) isn't part of this page. What only a
 * real layout engine can tell us:
 *
 * - desktop: tile + "MODULE ›" eyebrow + name + actions; the small eyebrow
 *   link still has a 44px-tall hit area
 * - phone (NEO-152): the same header as desktop — the "MODULE ›" eyebrow is
 *   the way back (no "← <Module>" row); the actions get their own row, on the right
 * - a very long name stays on one line (NEO-158: shrinks to fit down to
 *   18 px, then "…", full name kept as its text and tooltip) without pushing
 *   the actions off-screen or scrolling the page sideways
 * - the loading placeholder keeps the header's height (nothing jumps)
 */

async function open(page: Page, state: string, width: number) {
  await page.setViewportSize({ width, height: 800 });
  await page.goto(`/e2e/harness/breadcrumbs.html?state=${state}`);
  await expect(page.locator(".view-item")).toBeVisible();
}

const header = (page: Page) => page.locator("header.view-item__record-header");
const eyebrow = (page: Page) => header(page).locator("nav.app-breadcrumbs a");
const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

for (const [device, width] of [["desktop", 1280], ["phone", 390]] as const) {
  test.describe(`${device} (${width}px)`, () => {
    test("record header: tile, name as the only h1, three actions", async ({ page }) => {
      await open(page, "record", width);
      await expect(header(page)).toBeVisible();
      await expect(header(page).locator(".view-item__tile")).toBeVisible();
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator("h1")).toHaveText("Jan Kowalski");
      await expect(header(page).locator(".harness-action")).toHaveCount(3);
      expect(await noSideScroll(page)).toBe(true);
    });

    test("a very long name stays on one line (shrinks to 18 px, then …); actions stay on screen", async ({ page }) => {
      await open(page, "long", width);
      const h1 = page.locator("h1");
      // The full name is still the h1's text (screen readers) and its tooltip.
      await expect(h1).toContainText("y Santa Cruz");
      const box = await h1.evaluate((el) => ({
        height: el.getBoundingClientRect().height,
        lineHeight: parseFloat(getComputedStyle(el).lineHeight),
        fontSize: parseFloat(getComputedStyle(el).fontSize),
        title: el.getAttribute("title"),
        cut: el.scrollWidth > el.clientWidth,
      }));
      expect(box.height).toBeLessThanOrEqual(box.lineHeight + 1);
      expect(box.fontSize).toBeGreaterThanOrEqual(18);
      // Only a name that is actually cut with "…" needs its tooltip.
      if (box.cut) expect(box.title).toContain("y Santa Cruz");
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

    test("no record (not found): no record header", async ({ page }) => {
      await open(page, "notfound", width);
      await expect(header(page)).toHaveCount(0);
    });
  });
}

test.describe("desktop (1280px) — eyebrow", () => {
  test("the eyebrow links to the parent list", async ({ page }) => {
    await open(page, "record", 1280);
    await expect(eyebrow(page)).toBeVisible();
    await expect(eyebrow(page)).toHaveAttribute("href", "/patients");
  });

  test("the eyebrow link has a ≥44px-tall hit area", async ({ page }) => {
    await open(page, "record", 1280);
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

  test("keyboard focus on the eyebrow link is visibly outlined", async ({ page, browserName }) => {
    // Firefox and Safari on macOS skip links on Tab unless the OS-level "keyboard
    // navigation" setting is on — a platform default, not something the app controls.
    test.skip(browserName !== "chromium", "macOS Firefox/WebKit don't Tab to links by default");
    await open(page, "record", 1280);
    await page.keyboard.press("Tab");
    await expect(eyebrow(page)).toBeFocused();
    expect(await eyebrow(page).evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe("none");
  });
});

test.describe("phone (390px) — NEO-181", () => {
  test("the way back is the toolbar's ‹ MODULE link (the eyebrow gives way to it)", async ({ page }) => {
    await open(page, "record", 390);
    await expect(page.getByTestId("record-toolbar-back")).toBeVisible();
    await expect(page.getByTestId("record-toolbar-back")).toHaveAttribute("href", "/patients");
    await expect(eyebrow(page)).toBeHidden();
  });

  test("the actions live in the toolbar above the name, the last one on the right edge", async ({ page }) => {
    await open(page, "record", 390);
    const title = (await page.locator("h1").boundingBox())!;
    const more = (await page.getByTestId("record-toolbar-more").boundingBox())!;
    const head = (await header(page).boundingBox())!;
    expect(more.y + more.height).toBeLessThanOrEqual(title.y + 1);
    // The glyph ends near the content edge (the 44 px button pads 11 px around a 22 px icon).
    expect(Math.abs(more.x + more.width - 11 - (head.x + head.width))).toBeLessThanOrEqual(12);
  });
});

test("desktop (1280px): the actions are centred on the name, not on the whole text block (NEO-152)", async ({ page }) => {
  await open(page, "record", 1280);
  const title = (await page.locator("h1").boundingBox())!;
  const action = (await page.locator(".harness-action").first().boundingBox())!;
  expect(Math.abs(action.y + action.height / 2 - (title.y + title.height / 2))).toBeLessThanOrEqual(3);
});
