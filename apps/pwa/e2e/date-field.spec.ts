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

/**
 * The element painted at the center of the *on-screen part* of `testId` is
 * inside it — i.e. nothing covers it. (A phone sheet can reach past the
 * viewport edge; its full-rect center would then be off-screen.)
 */
async function paintsOnTop(page: Page, testId: string): Promise<boolean> {
  return page.getByTestId(testId).evaluate((el) => {
    const r = el.getBoundingClientRect();
    const top = Math.max(r.top, 0);
    const bottom = Math.min(r.bottom, window.innerHeight);
    const hit = document.elementFromPoint(r.left + r.width / 2, (top + bottom) / 2);
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

// NEO-188: the card hung from the field's left edge at a fixed 320 px, so a half-width
// field on the right of the form pushed it past the dialog. Now it hangs from the right
// edge, grows leftwards and is at least as wide as the field.
for (const [name, size] of [["laptop", LAPTOP], ["small laptop", { width: 1024, height: 760 }]] as const) {
  test(`${name}: the calendar card stays inside the dialog, right-aligned to the field`, async ({ page }) => {
    await open(page, "dialog=folder&mode=create", size);
    const field = await page.getByTestId("date-field-date").boundingBox();
    await page.getByTestId("date-field-open-calendar").click();
    const card = page.getByTestId("date-field-calendar");
    await expect(card).toBeVisible();
    await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
    const c = await card.boundingBox();
    const d = await page.locator(".v-dialog .v-card").first().boundingBox();
    expect(c && d && c.x >= d.x && c.x + c.width <= d.x + d.width + 1, "inside the dialog").toBeTruthy();
    expect(c && field && Math.abs(c.x + c.width - (field.x + field.width)) <= 2, "right edges line up").toBeTruthy();
    expect(c && field && c.width >= field.width - 1, "at least as wide as the field").toBeTruthy();
  });
}

test("event form: year → month → day fills the start date (NEO-188 report)", async ({ page }) => {
  await open(page, "dialog=event", LAPTOP);
  const start = page.getByTestId("event-start");
  await start.getByTestId("date-field-open-calendar").click();
  const card = page.getByTestId("date-field-calendar");
  await card.locator(".v-date-picker-controls button").filter({ hasText: /^\s*\d{4}/ }).first().click();
  await card.locator(".v-date-picker-years__content button", { hasText: "2027" }).click();
  await card.locator(".v-date-picker-controls button").filter({ hasText: /^[a-z]{3}/i }).first().click();
  await card.locator(".v-date-picker-months__content button").nth(2).click(); // March
  await card.locator(".v-date-picker-month__day button", { hasText: /^15$/ }).first().click();
  await expect(start.getByTestId("date-field-date").locator("input")).toHaveValue("03/15/2027");
});

for (const [name, size] of [["laptop", LAPTOP], ["phone", PHONE]] as const) {
  test(`${name}: the calendar opens above the form and a picked day fills the field`, async ({ page }) => {
    await open(page, "dialog=folder&mode=create", size);
    await page.getByTestId("date-field-open-calendar").click();
    await expect(page.getByTestId("date-field-calendar")).toBeVisible();
    // WebKit can report no running animation before the sheet has slid in,
    // so poll: a sheet stuck behind the dialog still fails after the timeout.
    await expect.poll(() => paintsOnTop(page, "date-field-calendar")).toBe(true);
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
