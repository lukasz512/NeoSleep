import { test, expect, type Page } from "@playwright/test";

/**
 * NEO-203: the patient side panel fits one window — no scrollbar inside the
 * aside and nothing below the fold — even with a worst-case patient (8
 * documents, long diagnosis, long note), and the QR button is the first
 * action in it. Harness: e2e/harness/patient-aside.ts.
 */
const VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
];

async function open(page: Page, query = ""): Promise<void> {
  await page.goto(`/e2e/harness/patient-aside.html${query}`);
  await expect(page.locator(".patient-aside__note-body")).toBeVisible();
}

for (const viewport of VIEWPORTS) {
  test(`fits ${viewport.width}x${viewport.height} without scrolling`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await open(page);
    const aside = page.getByTestId("aside");
    const { scrollHeight, clientHeight, bottom } = await aside.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      bottom: el.getBoundingClientRect().bottom,
    }));
    expect(scrollHeight).toBeLessThanOrEqual(clientHeight);
    expect(bottom).toBeLessThanOrEqual(viewport.height);
    // The rest of the panel is never squeezed — only the note card gives way.
    await expect(page.locator(".patient-aside__docs li")).toHaveCount(6);
    await expect(page.locator(".patient-aside__last-note .patient-aside__note-meta")).toBeInViewport();
  });
}

test("the QR button is the panel's first action, full width", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await open(page, "?lang=mx");
  const qr = page.locator(".patient-aside__qr");
  await expect(qr).toBeEnabled();
  const first = await page.locator(".patient-aside button").first().evaluate((el) => el.classList.contains("patient-aside__qr"));
  expect(first).toBe(true);
  const [qrBox, panelBox] = await Promise.all([qr.boundingBox(), page.locator(".patient-aside__next").boundingBox()]);
  expect(qrBox!.width).toBeGreaterThan(panelBox!.width - 40);
});

// NEO-258: the finished Historia clínica brings two buttons (print + email) — the panel still fits one window.
test("the Historia clínica stage (print + email) still fits 1280x720 without scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  // Font-independent: the card is no taller than the QR stage's, which the tests above already fit.
  await open(page, "?lang=mx&role=doctor");
  const qrStage = (await page.locator(".patient-aside__next").boundingBox())!.height;
  await open(page, "?lang=mx&stage=historia&role=doctor");
  expect((await page.locator(".patient-aside__next").boundingBox())!.height).toBeLessThanOrEqual(qrStage + 1);
  await expect(page.getByTestId("next-step-print")).toBeVisible();
  await expect(page.getByTestId("next-step-email")).toBeEnabled();
  const aside = page.getByTestId("aside");
  const { scrollHeight, clientHeight } = await aside.evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
  expect(scrollHeight).toBeLessThanOrEqual(clientHeight);
  await expect(page.locator(".patient-aside__last-note .patient-aside__note-meta")).toBeInViewport();
});
