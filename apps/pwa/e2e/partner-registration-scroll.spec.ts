import { test, expect, type Page } from "@playwright/test";

/**
 * Real-browser guard for "the partner registration form doesn't scroll outside
 * Chrome" (reported again 2026-09-25). The page is taller than the viewport and
 * scrolls inside .partner-registration (PublicLayout itself is a fixed 100dvh,
 * overflow hidden), so scrolling is pure layout + event routing — invisible to
 * jsdom, hence Playwright on all three engines.
 *
 * The invite API is stubbed with page.route (no DB, no token): only what the
 * page renders matters here, not the invite logic (covered by apps/api's
 * integration tests).
 */

const PREVIEW = {
  email: "doctor@example.com",
  firstName: "Ana",
  lastName: "García",
  clinicName: "Clínica Sonrisa",
  clinicEmail: "clinica@example.com",
  clinicPhone: "+52 55 1234 5678",
  clinicAddress: "Av. Reforma 123, CDMX",
  taxId: null,
  jurisdiction: "MX",
  licenseNumber: "1234567",
  practiceRole: "staff",
  documents: { agreementVersionId: "agr-1", dpaVersionId: "dpa-1", noticeVersionId: "not-1" },
};

async function openRegistration(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.route(
    (url) => /^\/(api|auth)\//.test(url.pathname),
    (route) =>
      route.request().url().includes("/invite/validate")
        ? route.fulfill({ json: PREVIEW })
        : route.fulfill({ status: 401, json: {} }),
  );
  await page.goto("/partner-register?token=e2e");
  // First visit in a run: the Vite dev server compiles the lazy route on demand,
  // which on a busy CI runner can exceed the 5s default (flaked in WebKit on PR #233).
  await expect(page.locator(".partner-registration__documents")).toBeVisible({ timeout: 20_000 });
  // The card zooms in after the backdrop intro — measure once it has settled
  // (the backdrop's gradient/orb loops are infinite and never settle; skip them).
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity)
      .every((a) => a.playState !== "running"),
  );
}

const scrollTop = (page: Page) =>
  page.evaluate(() => document.querySelector(".partner-registration")!.scrollTop);

async function wheelAt(page: Page, x: number, y: number) {
  await page.evaluate(() => {
    document.querySelector(".partner-registration")!.scrollTop = 0;
  });
  await page.mouse.move(x, y);
  // WebKit latches a wheel gesture to where it started for a short while —
  // let the previous one end so this one is hit-tested at (x, y).
  await page.waitForTimeout(500);
  await page.mouse.wheel(0, 800);
  await expect.poll(() => scrollTop(page)).toBeGreaterThan(100);
}

for (const [label, width, height] of [
  ["desktop", 1280, 720],
  ["narrow window", 760, 640],
] as const) {
  test(`${label}: the form scrolls with the wheel over the card and over the background`, async ({ page }) => {
    await openRegistration(page, width, height);
    const sc = await page.evaluate(() => {
      const el = document.querySelector(".partner-registration")!;
      return { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight };
    });
    expect(sc.scrollHeight).toBeGreaterThan(sc.clientHeight);

    await wheelAt(page, width / 2, height / 2); // over the card
    await wheelAt(page, 8, height / 2); // over the background, left edge
    await wheelAt(page, width - 8, height - 40); // over the background, bottom right

    // The Finish button is reachable.
    await page.locator(".partner-registration__submit").scrollIntoViewIfNeeded();
    await expect(page.locator(".partner-registration__submit")).toBeInViewport();
  });
}

test("the form still scrolls after the Edit details dialog was opened and closed", async ({ page }) => {
  await openRegistration(page, 1280, 720);
  await page.getByRole("button", { name: /edit details/i }).click();
  await expect(page.locator(".v-dialog .v-card")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".v-dialog .v-card")).toBeHidden();
  await wheelAt(page, 640, 400);
});
