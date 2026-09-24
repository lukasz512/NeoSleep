import { test, expect, type Page } from "@playwright/test";

/**
 * Real-browser layout guard for the PWA dialog shell: AppDialogHeader plus
 * the M3 spacing system in theme.scss (--pwa-dialog-* tokens). The header bug
 * this started from came back more than once: Vuetify's lazily-injected
 * `.v-card-title { display: block }` beat a global flex rule in theme.scss,
 * so the avatar/title lost their gap and the close X wrapped under the
 * avatar. That is a CSS-cascade bug, invisible to jsdom — only a real engine
 * computes layout, hence Playwright, on all three engines (each orders and
 * injects stylesheets on its own).
 *
 * Uses e2e/harness/dialog-header.html (Vite dev only, no API/DB needed):
 * FormRenderer in edit mode with an avatar (the shell of every entity edit
 * view), EventForm, and AppConfirmDialog, at desktop and phone widths.
 *
 * Expected values are the M3 dialog spec (m3.material.io/components/dialogs/
 * specs): 24dp container padding, 16dp header→content, 24dp content→actions,
 * 8dp between actions, 16dp between fields, 28dp corner radius. ±1px for
 * sub-pixel rounding.
 */

interface Box { x: number; y: number; width: number; height: number }

const PAD = 24;
const HEADER_GAP = 16;
const ACTIONS_GAP = 24;
const BUTTON_GAP = 8;
const FIELD_GAP = 16;

async function settle(page: Page, dialog: string, width: number) {
  await page.setViewportSize({ width, height: 1400 });
  await page.goto(`/e2e/harness/dialog-header.html?dialog=${dialog}`);
  await expect(page.locator(".v-dialog .v-card").first()).toBeVisible();
  // The dialog opens with a scale/fade transition — measure once it settles.
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
}

async function box(page: Page, selector: string): Promise<Box> {
  const b = await page.locator(selector).first().boundingBox();
  if (!b) throw new Error(`no box for ${selector}`);
  return b;
}

async function boxes(page: Page, selector: string): Promise<Box[]> {
  return page.locator(selector).evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    }),
  );
}

const centerY = (b: Box) => b.y + b.height / 2;
const bottom = (b: Box) => b.y + b.height;
const right = (b: Box) => b.x + b.width;

function near(actual: number, expected: number, label: string) {
  expect(Math.abs(actual - expected), `${label}: got ${actual.toFixed(1)}px, want ${expected}px`).toBeLessThanOrEqual(1);
}

async function expectActions(page: Page, card: Box, lastContentBottom: number) {
  const buttons = await boxes(page, ".v-dialog .v-card-actions .v-btn");
  expect(buttons.length).toBe(2);
  near(buttons[0].y - lastContentBottom, ACTIONS_GAP, "content → actions");
  near(bottom(card) - bottom(buttons[1]), PAD, "actions → card bottom");
  near(right(card) - right(buttons[1]), PAD, "actions → card right");
  near(buttons[1].x - right(buttons[0]), BUTTON_GAP, "gap between actions");
  expect(Math.abs(centerY(buttons[0]) - centerY(buttons[1]))).toBeLessThanOrEqual(1);
}

for (const dialog of ["form", "event"] as const) {
  for (const width of [1024, 390]) {
    test(`${dialog} dialog at ${width}px: header row + M3 spacing`, async ({ page }) => {
      await settle(page, dialog, width);
      const card = await box(page, ".v-dialog .v-card");
      const header = page.getByTestId("app-dialog-header");
      const avatar = await box(page, "[data-testid=app-dialog-header] .app-dialog-header__avatar");
      const title = await box(page, "[data-testid=app-dialog-header-title]");
      const close = await box(page, "[data-testid=app-dialog-header-close]");
      const closeIcon = await box(page, "[data-testid=app-dialog-header-close] .app-dialog-header__close-icon");
      const fields = await boxes(page, ".v-dialog .v-field");

      expect(await header.evaluate((el) => getComputedStyle(el).display)).toBe("flex");
      expect(await page.locator(".v-dialog .v-card").first().evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).toBe("28px");

      // Header: avatar · title · … · X on one row, 24dp from the top/left.
      expect(Math.abs(centerY(avatar) - centerY(title))).toBeLessThanOrEqual(2);
      expect(Math.abs(centerY(close) - centerY(title))).toBeLessThanOrEqual(2);
      near(avatar.y - card.y, PAD, "card top → avatar");
      near(avatar.x - card.x, PAD, "card left → avatar");
      near(title.x - right(avatar), 16, "avatar → title");
      expect(close.x).toBeGreaterThan(right(title));
      // The icon itself (not its 48px hit area) sits near the 24dp edge.
      expect(right(card) - right(closeIcon)).toBeGreaterThanOrEqual(PAD - 2);
      expect(right(card) - right(closeIcon)).toBeLessThanOrEqual(PAD + 6);

      // Content: 16dp under the header, 24dp side inset, 16dp between fields.
      near(fields[0].y - bottom(avatar), HEADER_GAP, "header → first field");
      near(fields[0].x - card.x, PAD, "card left → field");
      const rowTops = [...new Set(fields.map((f) => Math.round(f.y)))].sort((a, b) => a - b);
      const rowBottoms = rowTops.map((top) => Math.max(...fields.filter((f) => Math.round(f.y) === top).map(bottom)));
      for (let i = 1; i < rowTops.length; i++) near(rowTops[i] - rowBottoms[i - 1], FIELD_GAP, `field row ${i} gap`);

      await expectActions(page, card, Math.max(...fields.map(bottom)));
    });
  }
}

test("confirm dialog: M3 headline, supporting text and actions spacing", async ({ page }) => {
  await settle(page, "confirm", 1024);
  const card = await box(page, ".v-dialog .v-card");
  const title = await box(page, "[data-testid=app-dialog-header-title]");
  // The supporting text's content box — .v-card-text minus its own padding,
  // which is exactly the spacing under test.
  const text = await page.locator(".v-dialog .v-card-text").first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    const [pt, pr, pb, pl] = [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft].map(parseFloat);
    return { x: r.x + pl, y: r.y + pt, width: r.width - pl - pr, height: r.height - pt - pb };
  });
  await expect(page.getByTestId("app-dialog-header-close")).toHaveCount(0);
  near(title.y - card.y, PAD, "card top → headline");
  near(title.x - card.x, PAD, "card left → headline");
  near(text.x - card.x, PAD, "card left → supporting text");
  near(text.y - bottom(title), HEADER_GAP, "headline → supporting text");
  await expectActions(page, card, bottom(text));
});
