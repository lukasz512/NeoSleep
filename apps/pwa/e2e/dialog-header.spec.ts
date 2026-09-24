import { test, expect, type Page } from "@playwright/test";

/**
 * Real-browser layout guard for AppDialogHeader — the one header every titled
 * dialog uses. The bug this exists for came back more than once: Vuetify's
 * lazily-injected `.v-card-title { display: block }` beat a global flex rule
 * in theme.scss, so the avatar/title lost their gap and the close X wrapped
 * under the avatar. That is a CSS-cascade bug, invisible to jsdom — only a
 * real engine computes layout, hence Playwright, on all three engines (each
 * orders/injects stylesheets on its own).
 *
 * Uses e2e/harness/dialog-header.html (Vite dev only, no API/DB needed):
 * FormRenderer in edit mode with an avatar — the header of every entity edit
 * view — and EventForm, at desktop and phone widths.
 */

interface Box { x: number; y: number; width: number; height: number }

async function measure(page: Page) {
  const header = page.getByTestId("app-dialog-header");
  await expect(header).toBeVisible();
  // The dialog opens with a scale/fade transition — measure once it settles.
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  const box = async (sel: string): Promise<Box> => {
    const b = await page.locator(sel).first().boundingBox();
    if (!b) throw new Error(`no box for ${sel}`);
    return b;
  };
  return {
    display: await header.evaluate((el) => getComputedStyle(el).display),
    card: await box(".v-dialog .v-card"),
    header: await box("[data-testid=app-dialog-header]"),
    avatar: await box("[data-testid=app-dialog-header] .app-dialog-header__avatar"),
    title: await box("[data-testid=app-dialog-header-title]"),
    close: await box("[data-testid=app-dialog-header-close]"),
  };
}

const centerY = (b: Box) => b.y + b.height / 2;

for (const dialog of ["form", "event"] as const) {
  for (const width of [1024, 390]) {
    test(`${dialog} dialog header at ${width}px: avatar · title · … · X on one row`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`/e2e/harness/dialog-header.html?dialog=${dialog}`);
      const m = await measure(page);

      expect(m.display).toBe("flex");

      // One row: avatar, title and X share a vertical center.
      expect(Math.abs(centerY(m.avatar) - centerY(m.title))).toBeLessThanOrEqual(2);
      expect(Math.abs(centerY(m.close) - centerY(m.title))).toBeLessThanOrEqual(2);

      // Breathing room between avatar and title (16px gap in AppDialogHeader).
      expect(m.title.x - (m.avatar.x + m.avatar.width)).toBeGreaterThanOrEqual(12);

      // X is pinned to the card's right edge, not trailing the title.
      expect(m.close.x).toBeGreaterThan(m.title.x + m.title.width);
      expect(m.card.x + m.card.width - (m.close.x + m.close.width)).toBeLessThanOrEqual(24);

      // Header starts at the top of the card and is a single row tall.
      expect(m.header.y - m.card.y).toBeLessThanOrEqual(1);
      expect(m.header.height).toBeLessThanOrEqual(100);
    });
  }
}
