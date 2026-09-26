import { test, expect, type Page } from "@playwright/test";

/**
 * NEO-109: form errors show in the form, never as a toast — under each
 * field, in a summary box at the top (each line jumps to its field) and as a
 * count on each section heading. A neighbouring control keeps its height
 * when a field's error message appears under it. Real browsers only: layout
 * heights and focus/scroll are invisible to jsdom. Harness:
 * e2e/harness/dialog-header.ts `?dialog=folder` (`&reject=<field>` = the API
 * rejected that field).
 */

const LAPTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 780 };

async function open(page: Page, query: string, size: { width: number; height: number }) {
  await page.setViewportSize(size);
  await page.goto(`/e2e/harness/dialog-header.html?dialog=folder${query}`);
  await expect(page.locator(".v-dialog .v-card").first()).toBeVisible();
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
}

const summary = (page: Page) => page.getByTestId("form-error-summary");
const save = (page: Page) => page.getByRole("button", { name: "Save", exact: true });
const genderRow = (page: Page) => page.locator(".choice-chips-field__row");
const dobField = (page: Page) => page.locator("[data-section=identity] .v-input").filter({ has: page.getByLabel("Date of birth") });

for (const [name, size] of [["laptop", LAPTOP], ["phone", PHONE]] as const) {
  test(`${name}: a field the API rejects is marked in the form, with a summary on top`, async ({ page }) => {
    await open(page, "&reject=date_of_birth", size);
    const heightBefore = (await genderRow(page).boundingBox())?.height;

    await save(page).click();

    await expect(summary(page)).toBeVisible();
    await expect(summary(page).getByRole("button")).toHaveText(["Date of birth — Enter a date between 1900 and today"]);
    await expect(dobField(page)).toHaveClass(/v-input--error/);
    await expect(dobField(page)).toContainText("Enter a date between 1900 and today");
    // Its border turns red too, not just the label.
    const outline = await dobField(page).locator(".v-field__outline").evaluate((el) => getComputedStyle(el).color);
    const label = await dobField(page).locator(".v-field-label--floating").evaluate((el) => getComputedStyle(el).color);
    expect(outline).toBe(label);
    await expect(page.locator("[data-section=identity] [data-testid=section-error-count]")).toHaveText("1");
    await expect(page.locator(".v-snackbar, [data-testid=app-notification]")).toHaveCount(0);

    // The sex toggle beside the date keeps its own height.
    expect((await genderRow(page).boundingBox())?.height).toBe(heightBefore);

    // Editing the rejected field clears its error, and the summary goes with it.
    await page.getByLabel("Date of birth").fill("1979-03-15");
    await expect(summary(page)).toHaveCount(0);
    await expect(dobField(page)).not.toHaveClass(/v-input--error/);
  });
}

test("an empty form lists every required field; a line jumps to its field", async ({ page }) => {
  await open(page, "&mode=create", LAPTOP);
  await expect(summary(page)).toHaveCount(0);

  await page.getByRole("button", { name: /^Add patient$/ }).last().click();

  await expect(summary(page)).toBeVisible();
  const lines = summary(page).getByRole("button");
  expect(await lines.count()).toBeGreaterThan(0);
  const first = await lines.first().textContent();
  expect(first).toMatch(/— This field is required$/);

  await lines.first().click();
  await expect(page.locator("input:focus")).toHaveCount(1);
});
