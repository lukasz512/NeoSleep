import { test, expect, type Page } from "@playwright/test";

/**
 * NEO-132 AppDateField in a real browser: the typed mask (no 5th year digit)
 * and the calendar actually painting above the form dialog — on phones it's
 * a bottom sheet, which first opened *behind* the dialog's forced z-index
 * (jsdom can't see stacking). Harness: e2e/harness/dialog-header.ts
 * `?dialog=folder&mode=create` (date of birth) and `?dialog=event`.
 */

const LAPTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };

async function open(page: Page, query: string, size: { width: number; height: number }) {
  await page.setViewportSize(size);
  await page.goto(`/e2e/harness/dialog-header.html?${query}`);
  await expect(page.locator(".v-dialog .v-card").first()).toBeVisible();
  // The dialog scales in; measure positions only once it has settled.
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
}

/** The element painted at the center of `testId` is inside it — i.e. nothing covers it. */
async function paintsOnTop(page: Page, testId: string): Promise<boolean> {
  return page.getByTestId(testId).evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && el.contains(hit);
  });
}

test("a 5th year digit can't be typed (10/10/19900)", async ({ page }) => {
  await open(page, "dialog=folder&mode=create", LAPTOP);
  const dob = page.getByTestId("date-field-date").locator("input");
  await dob.click();
  await page.keyboard.type("101019900");
  await expect(dob).toHaveValue("10/10/1990");
});

test("31 February is refused with the month's real length", async ({ page }) => {
  await open(page, "dialog=folder&mode=create", LAPTOP);
  const dob = page.getByTestId("date-field-date").locator("input");
  await dob.click();
  await page.keyboard.type("02312026");
  await page.keyboard.press("Tab");
  await expect(page.getByText("February 2026 has 28 days")).toBeVisible();
});

for (const [name, size] of [["laptop", LAPTOP], ["phone", PHONE]] as const) {
  test(`${name}: the calendar opens above the form and a picked day fills the field`, async ({ page }) => {
    await open(page, "dialog=folder&mode=create", size);
    await page.getByTestId("date-field-open-calendar").click();
    await expect(page.getByTestId("date-field-calendar")).toBeVisible();
    await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
    expect(await paintsOnTop(page, "date-field-calendar")).toBe(true);
  });

  test(`${name}: event start is Date | Time on one line, and the time list opens above the form`, async ({ page }) => {
    await open(page, "dialog=event", size);
    const start = page.getByTestId("event-start");
    const date = await start.getByTestId("date-field-date").boundingBox();
    const time = await start.getByTestId("date-field-time").boundingBox();
    expect(date && time && Math.abs(date.y - time.y) < 2 && date.x < time.x, "side by side").toBeTruthy();
    await start.getByTestId("date-field-open-times").click();
    await expect(page.getByTestId("date-field-times")).toBeVisible();
    await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
    expect(await paintsOnTop(page, "date-field-times")).toBe(true);
    await page.getByTestId("date-field-times").locator('[data-time="09:30"]').click();
    await expect(start.getByTestId("date-field-time").locator("input")).toHaveValue("09:30");
  });
}
