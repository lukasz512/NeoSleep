import { test, expect, type Page } from "@playwright/test";
import { E2E_ADMIN_EMAIL, e2ePassword } from "./credentials";

/**
 * CORE-181: the patient card's data layer against the real API and Postgres — no
 * harness page, no stubbed /api. The admin, doctor and patient are seeded by
 * apps/api/scripts/seed-e2e-user.ts (global-setup hands over the ids). A save has
 * to show on every screen that holds the same data, without F5 and after one.
 * App logic, not engine-dependent: chromium only.
 */
test.skip(({ browserName }) => browserName !== "chromium", "app logic only, not browser-engine-dependent");
test.describe.configure({ mode: "serial" });

function patientId(): string {
  const id = process.env.E2E_PATIENT_ID;
  if (!id) throw new Error("E2E_PATIENT_ID is unset — globalSetup did not seed the patient");
  return id;
}

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(E2E_ADMIN_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(e2ePassword());
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

test("@CORE-181 AC1 a visit booked on the patient card shows on the card at once, after a reload and in the calendar", async ({ page }) => {
  await login(page);
  await page.goto(`/patients/${patientId()}`);
  await page.getByTestId("patient-book-appointment").click();

  const created = page.waitForResponse((r) => r.url().endsWith("/api/v1/appointments") && r.request().method() === "POST");
  await page.getByTestId("appointment-submit").click();
  const response = await created;
  expect(response.status()).toBe(201);
  const appointment = (await response.json()) as { id: string };

  // Same screen, no reload: the next-visit tile and the visits list both follow.
  await expect(page.getByTestId("tile-appointment")).toBeVisible();
  await expect(page.getByTestId("patient-visits").locator(`[data-id="${appointment.id}"]`)).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("tile-appointment")).toBeVisible();

  // The calendar holds the same visit.
  await page.goto(`/calendar?appointment=${appointment.id}`);
  await expect(page.getByTestId("appointment-status")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("Eva E2E Doctor");
  await expect(page.getByRole("dialog")).toContainText("Pablo");
});

test("@CORE-181 AC2 renaming the patient on the card shows the new name in the header and in the patient list without F5", async ({ page }) => {
  // Lists show the first surname only (MX naming), so the unique part goes first.
  const surname = `Zed${Date.now().toString(36)}`;
  const lastName = `${surname} Patient`;
  await login(page);
  await page.goto(`/patients/${patientId()}`);
  await page.getByRole("button", { name: "Edit" }).click();
  const field = page.getByLabel("Last name", { exact: true });
  await field.fill(lastName);
  await page.getByRole("button", { name: "Save", exact: true }).click();

  await expect(page.getByText("Patient updated successfully")).toBeVisible();
  await expect(page.getByRole("heading", { name: new RegExp(lastName) })).toBeVisible();

  // In-app navigation, not a reload: the list shows what the card saved.
  await page.getByRole("link", { name: /patients/i }).first().click();
  await page.waitForURL("**/patients");
  await expect(page.getByRole("row", { name: new RegExp(`Pablo ${surname}`) })).toBeVisible();
});
