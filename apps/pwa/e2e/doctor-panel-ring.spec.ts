import { test, expect, type Page } from "@playwright/test";

/**
 * Doctor Panel ring: the loading skeleton's ring and the real ring share one centre,
 * so the ring does not hop sideways when the skeleton hands over (Łukasz, 2026-10-04:
 * "przeskakuje na moment w prawo"). jsdom has no layout, so a real browser measures it.
 * Harness: e2e/harness/doctor-panel-donut.ts.
 */

async function centre(page: Page, selector: string) {
  const b = await page.locator(selector).first().boundingBox();
  if (!b) throw new Error(`no box for ${selector}`);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

for (const width of [1280, 1000, 390]) {
  test(`${width}px: skeleton ring and ring share a centre`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    // Long delay: the skeleton is still up while both are measured.
    await page.goto("/e2e/harness/doctor-panel-donut.html?delay=60000");
    await expect(page.getByTestId("doctor-panel-donut")).toBeAttached();
    const skeleton = await centre(page, '[data-testid="doctor-panel-stages"] .dp-skel--ring > i');
    const ring = await centre(page, '[data-testid="doctor-panel-donut"] .dp-donut__stage');
    expect(Math.abs(skeleton.x - ring.x)).toBeLessThan(1);
    expect(Math.abs(skeleton.y - ring.y)).toBeLessThan(1);
  });
}
