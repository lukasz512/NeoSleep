import { test, expect, type Page } from "@playwright/test";

/**
 * CORE-132 D4: booking with a doctor outside the patient's care team shows a
 * one-line notice and a required confirmation under the doctor; a doctor
 * already on the team shows neither. Harness: e2e/harness/appointment-dialog.ts.
 */
async function open(page: Page, query = ""): Promise<void> {
  await page.goto(`/e2e/harness/appointment-dialog.html${query}`);
  await expect(page.getByTestId("appointment-submit")).toBeVisible();
}

test("a doctor outside the care team: notice + confirmation, fits a 360px phone", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await open(page, "?lang=mx");
  await expect(page.getByTestId("appointment-grant")).toContainText("Dra. Lucía Fernández Ortega");
  await expect(page.getByTestId("appointment-grant-checkbox").locator("input")).not.toBeChecked();
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
});

test("saving without the confirmation marks it in the error summary", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page);
  await page.getByTestId("appointment-submit").click();
  await expect(page.getByTestId("appointment-grant")).toContainText("required", { ignoreCase: true });
});

test("CORE-138: team list unavailable — the API's refusal shows the confirmation, not a generic error", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, "?doctor=unknown");
  await expect(page.getByTestId("appointment-grant")).toHaveCount(0);
  await page.getByTestId("appointment-submit").click();
  await expect(page.getByTestId("appointment-grant")).toBeVisible();
  await expect(page.getByTestId("appointment-problem")).toHaveCount(0);
});

test("a doctor already on the team: no notice", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, "?doctor=team");
  await expect(page.getByTestId("appointment-grant")).toHaveCount(0);
});
