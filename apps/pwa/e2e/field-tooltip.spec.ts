import { test, expect } from "@playwright/test";

/**
 * The ⓘ tooltips in the device order wizard (a form dialog, z-index 10000)
 * painted behind the dialog, so nothing showed. Every tooltip also waits
 * 500 ms and fades in (VTooltip defaults in packages/vuetify).
 * Harness: e2e/harness/order-wizard.ts.
 */
test("a field tooltip shows above the dialog, after a short delay", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/e2e/harness/order-wizard.html?role=doctor");
  const trigger = page.locator(".field-tooltip__trigger").first();
  await expect(trigger).toBeVisible();

  await trigger.hover();
  const tooltip = page.locator(".v-tooltip > .v-overlay__content").filter({ hasText: "incisivos inferiores" });
  // Not yet: the pointer only just arrived.
  await page.waitForTimeout(250);
  await expect(tooltip).toBeHidden();

  await expect(tooltip).toBeVisible();
  // …and it paints above the dialog card, not under it. (Tooltip content is
  // pointer-events: none, so elementFromPoint can't see it — compare layers.)
  const layers = await page.evaluate(() => {
    const z = (sel: string) => Number(getComputedStyle(document.querySelector(sel)!).zIndex);
    return { tooltip: z(".v-tooltip.v-overlay--active"), dialog: z(".pwa-form-dialog") };
  });
  expect(layers.tooltip).toBeGreaterThan(layers.dialog);
  await expect(tooltip).toHaveCSS("opacity", "1");
});
