import { test, expect, type Page } from "@playwright/test";

/**
 * CORE-204: when a dialog's content grows or shrinks (the session tokens
 * dialog's "Revoked (n)" toggle), the card used to jump to its new height in
 * one frame. AppFormDialog now eases the height for every dialog. This samples
 * the card's height on each frame after the toggle: an eased change passes
 * through values between the old and the new height, a jump doesn't.
 * Harness: e2e/harness/dialog-header.ts (?dialog=tokens).
 */

const row = (id: string, name: string, revoked: boolean) => ({
  id,
  name,
  created_by: "u1",
  created_at: "2026-11-01T10:00:00Z",
  last_used_at: "2026-11-13T10:00:00Z",
  revoked_at: revoked ? "2026-11-10T10:00:00Z" : null,
});

async function open(page: Page, width: number) {
  await page.route("**/api/v1/platform/work/session-tokens", (route) =>
    route.fulfill({
      json: { items: [row("t1", "VSC Claude Code", false), row("t2", "Chrome MacBook M5 Pro", true), row("t3", "iPad", true)] },
    }),
  );
  await page.setViewportSize({ width, height: 1000 });
  await page.goto("/e2e/harness/dialog-header.html?dialog=tokens");
  await expect(page.getByTestId("work-tokens-revoked-toggle")).toBeVisible();
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
}

/**
 * Clicks the toggle and returns the card's height before, on each frame until the card
 * has moved and its height animation has ended, and at rest. The window is time, not a
 * frame count (CORE-220): on CI WebKit 40 frames went by before the card moved at all.
 */
async function toggleAndSample(page: Page): Promise<{ from: number; frames: number[]; to: number }> {
  const result = await page.evaluate(async () => {
    const card = document.querySelector<HTMLElement>(".v-dialog .v-card")!;
    const height = () => card.getBoundingClientRect().height;
    // A frame, or 32 ms when the engine isn't producing frames.
    const frame = () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
        setTimeout(resolve, 32);
      });
    const from = height();
    document.querySelector<HTMLElement>("[data-testid=work-tokens-revoked-toggle]")!.click();
    const frames: number[] = [];
    const started = performance.now();
    for (;;) {
      await frame();
      frames.push(height());
      const elapsed = performance.now() - started;
      const settled = Math.abs(frames[frames.length - 1]! - from) > 2 && card.getAnimations().length === 0;
      // At least 600 ms (the ease is 240 ms), 3 s at most.
      if (elapsed > 3000 || (elapsed > 600 && settled)) break;
    }
    return { from, frames };
  });
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  const to = await page.locator(".v-dialog .v-card").first().evaluate((el) => el.getBoundingClientRect().height);
  return { ...result, to };
}

const between = (h: number, a: number, b: number) => h > Math.min(a, b) + 2 && h < Math.max(a, b) - 2;

for (const width of [1024, 390]) {
  test(`at ${width}px the card eases its height when content grows and shrinks`, async ({ page }) => {
    await open(page, width);

    const grow = await toggleAndSample(page);
    expect(grow.to, "the revoked list makes the card taller").toBeGreaterThan(grow.from + 40);
    expect(grow.frames.some((h) => between(h, grow.from, grow.to)), `grow frames: ${grow.frames.join(", ")}`).toBe(true);
    expect(grow.frames.every((h) => h <= grow.to + 1), "never overshoots").toBe(true);

    const shrink = await toggleAndSample(page);
    expect(shrink.to).toBeCloseTo(grow.from, 0);
    expect(shrink.frames.some((h) => between(h, shrink.from, shrink.to)), `shrink frames: ${shrink.frames.join(", ")}`).toBe(true);

    // At rest the content isn't clipped: the body doesn't scroll.
    const body = page.getByTestId("app-form-dialog-body");
    expect(await body.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
  });
}

test("reduced motion: the card takes its new height at once", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, 1024);
  const grow = await toggleAndSample(page);
  expect(grow.frames.some((h) => between(h, grow.from, grow.to)), `frames: ${grow.frames.join(", ")}`).toBe(false);
});
