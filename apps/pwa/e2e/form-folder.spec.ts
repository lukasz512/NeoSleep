import { test, expect, type Page } from "@playwright/test";

/**
 * NEO-92 "Carpeta": a form with two or more sections opens as a folder — a
 * spine with the record's identity and a section index beside one sheet with
 * a heading per section; on phones a bottom sheet with section chips. Also
 * guards the bug that started it: a scrolled field's label ran into the
 * hairline under the header. Content now fades out under the header instead.
 * Real browsers only: grid layout, masks and scroll positions are invisible
 * to jsdom. Harness: e2e/harness/dialog-header.ts `?dialog=folder`.
 */

const LAPTOP = { width: 1280, height: 640 };
const PHONE = { width: 390, height: 780 };

async function open(page: Page, query: string, size: { width: number; height: number }) {
  await page.setViewportSize(size);
  await page.goto(`/e2e/harness/dialog-header.html?dialog=folder${query}`);
  await expect(page.locator(".v-dialog .v-card").first()).toBeVisible();
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
}

const body = (page: Page) => page.getByTestId("app-form-dialog-body");
const spine = (page: Page) => page.getByTestId("app-form-dialog-spine");

test("desktop: spine with identity and section index beside the page", async ({ page }) => {
  await open(page, "", LAPTOP);
  await expect(spine(page)).toBeVisible();
  await expect(page.getByTestId("form-spine-name")).toHaveText("María Delgado Ruiz");
  await expect(page.getByTestId("form-spine-index").getByRole("button")).toHaveText([
    "Identity",
    "Contact",
    "Clinical",
    "Territory",
  ]);
  // The avatar moved to the spine, the header keeps only the title and X.
  await expect(page.getByTestId("app-dialog-header").locator(".v-avatar, [class*=avatar]")).toHaveCount(0);
  await expect(body(page).locator(".pwa-form-section__title")).toHaveCount(4);

  const s = await spine(page).boundingBox();
  const b = await body(page).boundingBox();
  expect(s && b && s.x + s.width <= b.x + 1, "spine sits left of the page").toBeTruthy();
});

test("scrolled content fades out under the header instead of touching a line", async ({ page }) => {
  await open(page, "", LAPTOP);
  const header = await page.getByTestId("app-dialog-header").boundingBox();
  await body(page).evaluate((el) => el.scrollTo(0, 150));
  await expect(body(page)).toHaveClass(/pwa-form-dialog__body--scrolled/);
  const style = await body(page).evaluate((el) => {
    const cs = getComputedStyle(el);
    return {
      mask: cs.maskImage || cs.getPropertyValue("-webkit-mask-image"),
      border: cs.borderTopColor,
      top: el.getBoundingClientRect().top,
    };
  });
  // The body starts right under the header, and its first 20px are masked.
  expect(Math.abs(style.top - (header?.y ?? 0) - (header?.height ?? 0))).toBeLessThanOrEqual(1);
  expect(style.mask).toMatch(/^linear-gradient\((rgba\(0, 0, 0, 0\)|transparent) 0px, rgb\(0, 0, 0\) 20px/);
  expect(style.border).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
});

test("the index follows the scroll and jumps to a section", async ({ page }) => {
  await open(page, "", LAPTOP);
  const index = page.getByTestId("form-spine-index");
  await expect(index.getByRole("button", { name: "Identity" })).toHaveAttribute("aria-current", "location");

  await index.getByRole("button", { name: "Territory" }).click();
  await expect(index.getByRole("button", { name: "Territory" })).toHaveAttribute("aria-current", "location");
  await expect.poll(async () => body(page).evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  const heading = body(page).locator("[data-section=territory] .pwa-form-section__title");
  await expect(heading).toBeInViewport();

  await body(page).evaluate((el) => el.scrollTo(0, 0));
  await expect(index.getByRole("button", { name: "Identity" })).toHaveAttribute("aria-current", "location");
});

test("unsaved changes: a dot on the section and a counter by the actions", async ({ page }) => {
  await open(page, "", LAPTOP);
  await expect(page.getByTestId("form-changes")).toHaveCount(0);
  await body(page).getByLabel("Medical record").fill("HX-90000");
  await expect(page.getByTestId("form-changes")).toContainText("1");
  const clinical = page.getByTestId("form-spine-index").getByRole("button", { name: "Clinical" });
  await expect(clinical.locator(".form-spine__changed")).toHaveCount(1);
  await expect(
    page.getByTestId("form-spine-index").getByRole("button", { name: "Identity" }).locator(".form-spine__changed"),
  ).toHaveCount(0);
});

test("unsaved changes are edit-only: adding a record shows no counter or dots (NEO-98)", async ({ page }) => {
  await open(page, "&mode=create", LAPTOP);
  await body(page).getByLabel("First name").fill("Lucía");
  await body(page).getByLabel("Medical record").fill("HX-90000");
  await expect(page.getByTestId("form-spine-name")).toHaveText(/Lucía/);
  await expect(page.getByTestId("form-changes")).toHaveCount(0);
  await expect(page.getByTestId("form-spine-index").locator(".form-spine__changed")).toHaveCount(0);
});

test("create and edit are one view: the spine fills in as you type", async ({ page }) => {
  await open(page, "&mode=create", LAPTOP);
  await expect(spine(page)).toBeVisible();
  await expect(page.getByTestId("form-spine-name")).toHaveClass(/form-spine__name--pending/);
  await body(page).getByLabel("First name").fill("Lucía");
  await body(page).getByLabel("Last name").fill("Herrera");
  await expect(page.getByTestId("form-spine-name")).toHaveText("Lucía Herrera");
});

test("phone: a bottom sheet with section chips instead of a spine", async ({ page }) => {
  await open(page, "", PHONE);
  await expect(spine(page)).toHaveCount(0);
  const chips = page.getByTestId("form-section-chips");
  await expect(chips).toBeVisible();
  await chips.getByRole("button", { name: "Clinical" }).click();
  await expect(chips.getByRole("button", { name: "Clinical" })).toHaveAttribute("aria-current", "location");
  await expect(body(page).locator("[data-section=clinical] .pwa-form-section__title")).toBeInViewport();
});

test("a form with one section stays a single sheet", async ({ page }) => {
  await page.setViewportSize(LAPTOP);
  await page.goto("/e2e/harness/dialog-header.html?dialog=form-long");
  await expect(page.locator(".v-dialog .v-card").first()).toBeVisible();
  await expect(spine(page)).toHaveCount(0);
  await expect(page.locator(".pwa-form-section__title")).toHaveCount(0);
});
