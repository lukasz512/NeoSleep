import { test, expect, type Page } from "@playwright/test";

/**
 * NEO-206: the patient's Details tab — summary strip + grouped rows — and the
 * detail-view tab bar's keyboard focus. Layout (tiles per row, no sideways
 * scroll) and a focus ring that is not clipped are things only a real browser
 * computes. Harness: e2e/harness/patient-details.ts.
 */
async function open(page: Page, query = ""): Promise<void> {
  await page.goto(`/e2e/harness/patient-details.html${query}`);
  await expect(page.locator(".patient-details__group").first()).toBeVisible();
}

async function tilesPerRow(page: Page): Promise<number> {
  const tops = await page.locator(".patient-details__tiles > *").evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
  return tops.filter((top) => top === tops[0]).length;
}

test("desktop column: four tiles in one row, groups in two columns", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, "?lang=mx");
  // Three small tiles + the next visit, which spans two columns (CORE-162).
  await expect(page.locator(".patient-details__tiles > *")).toHaveCount(4);
  expect(await tilesPerRow(page)).toBe(4);
  const lefts = await page.locator(".patient-details__group").evaluateAll((els) => new Set(els.map((el) => Math.round(el.getBoundingClientRect().left))).size);
  expect(lefts).toBe(2);
});

test("phone 360px: two tiles per row, one column, no sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await open(page, "?lang=mx");
  expect(await tilesPerRow(page)).toBe(2);
  const lefts = await page.locator(".patient-details__group").evaluateAll((els) => new Set(els.map((el) => Math.round(el.getBoundingClientRect().left))).size);
  expect(lefts).toBe(1);
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
});

test("rep: no PSG and no diagnosis tile", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, "?rep=1");
  await expect(page.getByTestId("tile-psg")).toHaveCount(0);
  await expect(page.getByTestId("tile-diagnosis")).toHaveCount(0);
  await expect(page.getByTestId("tile-treatment")).toBeVisible();
});

test("tab focus ring sits inside the tab and is never clipped by the scrolling row", async ({ page, browserName }) => {
  // WebKit only moves focus to buttons with Tab when the OS setting says so; focus() + :focus-visible is what matters here.
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page);
  const tab = page.getByRole("tab", { name: "Details" });
  await page.keyboard.press("Tab");
  if (browserName === "webkit" || !(await tab.evaluate((el) => el === document.activeElement))) {
    await tab.evaluate((el) => (el as HTMLElement).focus({ focusVisible: true } as FocusOptions));
  }
  await expect(tab).toBeFocused();
  const style = await tab.evaluate((el) => {
    const cs = getComputedStyle(el);
    const after = getComputedStyle(el, "::after");
    return { outline: cs.outlineStyle, shadow: cs.boxShadow, afterOpacity: after.opacity };
  });
  expect(style.outline).toBe("none");
  expect(style.shadow).toContain("inset");
  expect(style.afterOpacity).toBe("0");
  // The ring is drawn inside the tab box, and the tab box is inside the row that clips it.
  const fits = await tab.evaluate((el) => {
    const row = el.closest(".app-segmented-tabs")!.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    return box.top >= row.top && box.bottom <= row.bottom + 1 && box.left >= row.left;
  });
  expect(fits).toBe(true);
});

test("care team (CORE-132): a manager sees every other doctor with how they got access, and can add and remove", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, "?lang=mx&role=manager");
  const team = page.getByTestId("care-team");
  await expect(team).toContainText("Equipo de atención");
  await expect(page.getByTestId("care-team-h-2")).toContainText("Por una cita");
  await expect(page.getByTestId("care-team-h-3")).toContainText("Ex médico principal");
  await expect(page.getByTestId("care-team-remove-h-2")).toBeVisible();
  await expect(page.getByTestId("care-team-add")).toBeVisible();
});

test("care team on a 360px phone: no sideways scroll, a doctor gets no actions", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await open(page, "?lang=mx&role=doctor");
  await expect(page.getByTestId("care-team-h-2")).toBeVisible();
  await expect(page.getByTestId("care-team-add")).toHaveCount(0);
  await expect(page.getByTestId("care-team-remove-h-2")).toHaveCount(0);
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
});

test("the PSG tile opens the Studies tab", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page);
  await page.getByTestId("tile-psg").click();
  await expect(page.getByRole("tab", { name: "Studies" })).toHaveAttribute("aria-selected", "true");
});
