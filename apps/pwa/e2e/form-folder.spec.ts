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
/** iPad Air portrait — between Vuetify's sm and md breakpoints. */
const TABLET = { width: 820, height: 1180 };

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

test("spine ficha: one labelled fact per line, labels in one column (NEO-118)", async ({ page }) => {
  await open(page, "", LAPTOP);
  const facts = page.getByTestId("form-spine-facts");
  await expect(facts.locator("dt")).toHaveText(["Sex", "Age", "Born", "Status"]);
  await expect(facts.locator("[data-fact=sex] dd")).toHaveText("Female");
  await expect(facts.locator("[data-fact=born] dd")).toHaveText("3/14/1979");
  await expect(facts.locator("[data-fact=status] .v-chip")).toBeVisible();
  // Every fact stays on one line: no value wraps into a second row.
  const heights = await facts.locator("dd").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  for (const h of heights) expect(h).toBeLessThan(30);
  const lefts = await facts.locator("dd").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
  expect(new Set(lefts).size, "values share one column").toBe(1);
});

test("spine ficha fills in as you type on create (NEO-118)", async ({ page }) => {
  await open(page, "&mode=create", LAPTOP);
  // NEO-128: every fact is drawn from the start, with a still bar for its value.
  const facts = page.getByTestId("form-spine-facts");
  await expect(facts.locator("dt")).toHaveText(["Sex", "Age", "Born", "Status"]);
  await expect(facts.locator("[data-fact=sex] .form-spine__bar")).toHaveCount(1);
  await body(page).getByText("Male", { exact: true }).click();
  await expect(facts.locator("[data-fact=sex] dd")).toHaveText("Male");
  await expect(facts.locator("[data-fact=sex] .form-spine__bar")).toHaveCount(0);
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
  // NEO-128: a still skeleton (avatar + two bars) instead of a sentence, and nothing animates.
  await expect(spine(page).locator(".form-spine__avatar-skeleton")).toBeVisible();
  await expect(page.getByTestId("form-spine-name").locator(".form-spine__bar")).toHaveCount(2);
  expect(await spine(page).evaluate((el) => el.getAnimations({ subtree: true }).length)).toBe(0);
  const emptyHeight = (await spine(page).locator(".form-spine__identity").boundingBox())?.height ?? 0;
  await body(page).getByLabel("First name").fill("Lucía");
  await body(page).getByLabel("Last name").fill("Herrera");
  await expect(page.getByTestId("form-spine-name")).toHaveText("Lucía Herrera");
  await expect(spine(page).locator(".form-spine__avatar-skeleton")).toHaveCount(0);
  // Bars turn into values in place: the identity block keeps its height.
  const typedHeight = (await spine(page).locator(".form-spine__identity").boundingBox())?.height ?? 0;
  expect(Math.abs(typedHeight - emptyHeight)).toBeLessThanOrEqual(4);
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

test("tablet: phone-style chips, but still a floating tile", async ({ page }) => {
  await open(page, "", TABLET);
  await expect(spine(page)).toHaveCount(0);
  await expect(page.getByTestId("form-section-chips")).toBeVisible();
  // A centred tile with margins on every side and all four corners rounded,
  // not the phone's edge-to-edge bottom sheet.
  await expect(page.locator(".v-overlay.pwa-form-dialog--sheet")).toHaveCount(0);
  const card = page.locator(".v-dialog .v-card").first();
  const box = await card.boundingBox();
  expect(box && box.x).toBeGreaterThan(16);
  expect(box && TABLET.width - (box.x + box.width)).toBeGreaterThan(16);
  expect(box && TABLET.height - (box.y + box.height)).toBeGreaterThan(16);
  const radius = await card.evaluate((el) => getComputedStyle(el).borderBottomLeftRadius);
  expect(parseFloat(radius)).toBeGreaterThan(8);
  await page.getByTestId("form-section-chips").getByRole("button", { name: "Territory" }).click();
  await expect(body(page).locator("[data-section=territory] .pwa-form-section__title")).toBeInViewport();
});

test("a form with one section stays a single sheet", async ({ page }) => {
  await page.setViewportSize(LAPTOP);
  await page.goto("/e2e/harness/dialog-header.html?dialog=form-long");
  await expect(page.locator(".v-dialog .v-card").first()).toBeVisible();
  await expect(spine(page)).toHaveCount(0);
  await expect(page.locator(".pwa-form-section__title")).toHaveCount(0);
});

test("Clínico: AHI scale follows the number, AHI + Talla steppers, CPAP tile, Expediente is a box (NEO-228, NEO-241)", async ({ page }) => {
  await open(page, "", LAPTOP);
  const clinical = body(page).locator("[data-section=clinical]");
  await clinical.scrollIntoViewIfNeeded();
  // María's 23.4 sits in the moderate band; typing 31 moves it to severe.
  await expect(clinical.locator(".ahi-scale__labels .is-active")).toHaveText("15–30 moderate");
  await clinical.locator(".ahi-field input").fill("31");
  await expect(clinical.locator(".ahi-scale__labels .is-active")).toHaveText(">30 severe");
  // NEO-241: AHI and Talla side by side, each with − / +; + on Talla adds a cm.
  const ahiBox = await clinical.locator(".ahi-field").boundingBox();
  const talla = clinical.locator(".number-stepper").nth(1);
  const tallaBox = await talla.boundingBox();
  expect(ahiBox && tallaBox && Math.abs(ahiBox.y - tallaBox.y)).toBeLessThan(1);
  expect(ahiBox && tallaBox && tallaBox.x).toBeGreaterThan((ahiBox?.x ?? 0) + (ahiBox?.width ?? 0) - 1);
  await talla.getByRole("button", { name: "Increase" }).click();
  await expect(talla.locator("input")).toHaveValue("159");
  // CPAP: one switch tile, on for María; one tap turns it off (no crossed-out "No CPAP" choice).
  const cpap = clinical.getByRole("switch", { name: /Uses CPAP/ });
  await expect(cpap).toHaveAttribute("aria-checked", "true");
  await cpap.click();
  await expect(cpap).toHaveAttribute("aria-checked", "false");
  // Expediente médico is a multi-line box.
  await expect(clinical.locator("textarea").first()).toBeVisible();
});
