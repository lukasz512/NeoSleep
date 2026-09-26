import { test, expect, type Page } from "@playwright/test";

/**
 * Real-browser guard for "I can't scroll the forms" (reported again
 * 2026-09-26, after the Vuetify 4 upgrade). Vuetify 4 ships its CSS in
 * cascade layers, so the app's unlayered `overflow: hidden` on the dialog card
 * silently beat Vuetify's own `overflow-y: auto`: a form taller than the
 * screen was clipped, nothing scrolled, and Save was unreachable. Layout and
 * scroll routing are invisible to jsdom — hence Playwright, all three engines.
 *
 * Every form dialog renders through AppFormDialog.vue (enforced by
 * AppFormDialog.spec.ts), so the harness dialogs below stand for all of them.
 * The existing dialog-header spec runs at a 1400px-tall viewport, which is
 * exactly why it never saw this; these run at real phone/laptop heights.
 */

interface Rect { top: number; bottom: number; left: number; right: number }

const VIEWPORTS = [
  { name: "phone", width: 375, height: 667 },
  { name: "laptop", width: 1280, height: 640 },
] as const;

/** Dialogs taller than both viewports — they must scroll. */
const LONG_DIALOGS = ["form-long", "event", "clinical"] as const;

async function open(page: Page, dialog: string, size: { width: number; height: number }, theme = "light") {
  await page.setViewportSize(size);
  await page.goto(`/e2e/harness/dialog-header.html?dialog=${dialog}&theme=${theme}`);
  await expect(page.locator(".v-dialog .v-card").first()).toBeVisible();
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
}

function rect(page: Page, selector: string): Promise<Rect> {
  return page.locator(selector).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
  });
}

function bodyScroll(page: Page) {
  return page.getByTestId("app-form-dialog-body").evaluate((el) => ({
    top: el.scrollTop,
    max: el.scrollHeight - el.clientHeight,
    classes: el.className,
  }));
}

async function expectInViewport(page: Page, selector: string, label: string) {
  const r = await rect(page, selector);
  const vh = page.viewportSize()?.height ?? 0;
  expect(r.top, `${label} top`).toBeGreaterThanOrEqual(0);
  expect(r.bottom, `${label} bottom (viewport ${vh})`).toBeLessThanOrEqual(vh + 0.5);
}

for (const vp of VIEWPORTS) {
  for (const dialog of LONG_DIALOGS) {
    test(`${dialog} @ ${vp.name}: capped to the viewport, body scrolls, Save stays reachable`, async ({ page }) => {
      await open(page, dialog, vp);

      // The whole card, its header and its actions sit inside the viewport.
      await expectInViewport(page, ".v-dialog .v-card", "card");
      await expectInViewport(page, "[data-testid=app-dialog-header]", "header");
      await expectInViewport(page, ".v-dialog .v-card-actions .v-btn >> nth=-1", "last action");

      // Content really is taller than the body, and only the body scrolls.
      const start = await bodyScroll(page);
      expect(start.max, "body content overflows").toBeGreaterThan(40);
      expect(start.top).toBe(0);
      expect(start.classes).toContain("pwa-form-dialog__body--more");
      expect(start.classes).not.toContain("pwa-form-dialog__body--scrolled");

      const body = await rect(page, "[data-testid=app-form-dialog-body]");
      await page.mouse.move((body.left + body.right) / 2, (body.top + body.bottom) / 2);
      for (let i = 0; i < 20; i++) await page.mouse.wheel(0, 400);
      await expect.poll(async () => (await bodyScroll(page)).top).toBeGreaterThanOrEqual(start.max - 1);

      const end = await bodyScroll(page);
      expect(end.classes).toContain("pwa-form-dialog__body--scrolled");
      expect(end.classes).not.toContain("pwa-form-dialog__body--more");

      // The last control is reachable and the actions did not move.
      // (by role: VTextarea also renders a hidden sizer <textarea>)
      const last = await page
        .getByTestId("app-form-dialog-body")
        .getByRole("textbox")
        .last()
        .evaluate((el) => {
          const r = el.getBoundingClientRect();
          return { top: r.top, bottom: r.bottom };
        });
      expect(last.bottom).toBeLessThanOrEqual(body.bottom + 1);
      expect(last.top).toBeGreaterThanOrEqual(body.top - 1);
      await expectInViewport(page, ".v-dialog .v-card-actions .v-btn >> nth=-1", "last action after scroll");
    });
  }

  test(`form-long @ ${vp.name}: keyboard focus scrolls the field into view`, async ({ page }) => {
    await open(page, "form-long", vp);
    const input = page.getByTestId("app-form-dialog-body").getByRole("textbox").last();
    await input.focus();
    await expect.poll(async () => (await bodyScroll(page)).top).toBeGreaterThan(0);
    const body = await rect(page, "[data-testid=app-form-dialog-body]");
    const r = await input.evaluate((el) => el.getBoundingClientRect().bottom);
    expect(r).toBeLessThanOrEqual(body.bottom + 1);
  });

  for (const dialog of ["form", "wizard", "confirm"] as const) {
    test(`${dialog} @ ${vp.name}: fits the viewport with actions visible`, async ({ page }) => {
      await open(page, dialog, vp);
      await expectInViewport(page, ".v-dialog .v-card", "card");
      await expectInViewport(page, ".v-dialog .v-card-actions .v-btn >> nth=-1", "last action");
    });
  }
}

test("dialog surfaces are white in the light theme, dark in the dark theme", async ({ page }) => {
  for (const dialog of ["form", "event", "wizard", "confirm", "clinical"]) {
    await open(page, dialog, VIEWPORTS[0]);
    const bg = await page.locator(".v-dialog .v-card").first().evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg, `${dialog} light`).toBe("rgb(255, 255, 255)");
  }
  await open(page, "form", VIEWPORTS[0], "dark");
  const dark = await page.locator(".v-dialog .v-card").first().evaluate((el) => getComputedStyle(el).backgroundColor);
  const [r, g, b] = (dark.match(/\d+/g) ?? []).map(Number);
  expect(r + g + b, `dark surface ${dark}`).toBeLessThan(3 * 64);
});

test("form dialogs stack above the fixed mobile bottom nav (z-index 9998)", async ({ page }) => {
  for (const dialog of ["form", "event", "wizard", "clinical"]) {
    await open(page, dialog, VIEWPORTS[0]);
    const z = await page.locator(".v-overlay.pwa-form-dialog").first().evaluate((el) => Number(getComputedStyle(el).zIndex));
    expect(z, dialog).toBeGreaterThan(9998);
  }
});

test("the page behind an open dialog does not scroll", async ({ page }) => {
  await open(page, "form-long", VIEWPORTS[0]);
  const body = await rect(page, "[data-testid=app-form-dialog-body]");
  await page.mouse.move((body.left + body.right) / 2, (body.top + body.bottom) / 2);
  for (let i = 0; i < 10; i++) await page.mouse.wheel(0, 600);
  expect(await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0)).toBe(0);
});
