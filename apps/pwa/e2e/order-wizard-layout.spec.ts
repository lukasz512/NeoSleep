import { test, expect, type Page } from "@playwright/test";

/**
 * NEO-232: the device order wizard's stepper header on a phone, and the width
 * of inline alerts on desktop. Both are layout (overflow, computed widths), so
 * only a real engine can tell — jsdom has no layout.
 *
 * Uses e2e/harness/order-wizard.html (Vite dev only, API stubbed in the page).
 */

async function open(page: Page, width: number, query = "") {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`/e2e/harness/order-wizard.html${query}`);
  await expect(page.locator(".oa-wizard__stepper .v-stepper-header")).toBeVisible();
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
}

test.describe("device order wizard stepper on a phone", () => {
  for (const width of [360, 390]) {
    test(`every step is on screen without scrolling at ${width}px`, async ({ page }) => {
      await open(page, width);
      const header = page.locator(".oa-wizard__stepper .v-stepper-header");
      const overflow = await header.evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);

      const headerBox = await header.boundingBox();
      // Inset like the dialog's title above it, not glued to the screen edge.
      const firstCircle = await page.getByTestId("wizard-step-1").locator(".v-stepper-item__avatar").boundingBox();
      expect(firstCircle!.x).toBeGreaterThanOrEqual(16);
      for (const step of [1, 2, 3, 4]) {
        const box = await page.getByTestId(`wizard-step-${step}`).boundingBox();
        expect(box, `step ${step}`).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(headerBox!.x - 1);
        expect(box!.x + box!.width).toBeLessThanOrEqual(headerBox!.x + headerBox!.width + 1);
      }
    });

    test(`the current step's title is shown in full at ${width}px`, async ({ page }) => {
      await open(page, width);
      const title = page.getByTestId("wizard-step-1").locator(".v-stepper-item__title");
      await expect(title).toBeVisible();
      await expect(title).toHaveText("Envío");
      // A zero-width box has no overflow either, so the title must really take room.
      const textWidth = await title.evaluate((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return range.getBoundingClientRect().width;
      });
      expect((await title.boundingBox())!.width).toBeGreaterThanOrEqual(textWidth - 1);
      // Neither cut sideways (ellipsis) nor wrapped onto a hidden second line.
      const clipped = await title.evaluate((el) => Math.max(el.scrollWidth - el.clientWidth, el.scrollHeight - el.clientHeight));
      expect(clipped).toBeLessThanOrEqual(1);
      const header = await page.locator(".oa-wizard__stepper .v-stepper-header").boundingBox();
      const box = await title.boundingBox();
      expect(box!.x + box!.width).toBeLessThanOrEqual(header!.x + header!.width + 1);
    });
  }

  test("the longest title fits a 360px phone (doctor opens on step 2)", async ({ page }) => {
    await open(page, 360, "?role=doctor");
    const header = page.locator(".oa-wizard__stepper .v-stepper-header");
    expect(await header.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    const title = page.getByTestId("wizard-step-2").locator(".v-stepper-item__title");
    await expect(title).toHaveText("Configuración del tratamiento");
    const clipped = await title.evaluate((el) => Math.max(el.scrollWidth - el.clientWidth, el.scrollHeight - el.clientHeight));
    expect(clipped).toBeLessThanOrEqual(1);
    await expect(page.getByTestId("wizard-step-4")).toBeInViewport();
  });

  test("on desktop every step keeps its title", async ({ page }) => {
    await open(page, 1280);
    for (const step of [1, 2, 3, 4]) {
      await expect(page.getByTestId(`wizard-step-${step}`).locator(".v-stepper-item__title")).toBeVisible();
    }
  });
});

test.describe("inline alert width", () => {
  test("is capped on desktop instead of spanning the whole dialog", async ({ page }) => {
    await open(page, 1280, "?hco=incomplete");
    const alert = page.getByTestId("ship-to-error");
    await expect(alert).toBeVisible();
    const alertWidth = (await alert.boundingBox())!.width;
    const parentWidth = await alert.evaluate((el) => (el.parentElement as HTMLElement).clientWidth);
    expect(alertWidth).toBeLessThan(parentWidth - 40);
  });

  test("still spans the full width on a phone", async ({ page }) => {
    await open(page, 375, "?hco=incomplete");
    const alert = page.getByTestId("ship-to-error");
    await expect(alert).toBeVisible();
    const alertWidth = (await alert.boundingBox())!.width;
    const parentWidth = await alert.evaluate((el) => (el.parentElement as HTMLElement).clientWidth);
    expect(alertWidth).toBeGreaterThanOrEqual(parentWidth - 1);
  });
});
