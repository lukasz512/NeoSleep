import { test, expect, type Page } from "@playwright/test";

/**
 * Real-browser guard for the post-deploy "app freezes, clicks do nothing" bug.
 * After a deploy the old hashed chunk is gone, and the host's SPA fallback
 * answers the tab's lazy import with index.html (text/html) — every engine
 * then rejects the import with its own wording. jsdom can't produce those
 * errors, so this runs on all three engines against the exact failure:
 * the chunk request answered with HTML.
 *
 * Uses e2e/harness/stale-chunk.html (Vite dev only, no API/DB needed).
 */

const HTML_FALLBACK = "<!doctype html><html><body><div id=\"app\"></div></body></html>";

async function serveChunkAsHtml(page: Page) {
  await page.route(/stale-chunk-target/, (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: HTML_FALLBACK }),
  );
}

async function open(page: Page) {
  await page.goto("/e2e/harness/stale-chunk.html");
  await expect(page.getByTestId("open-detail")).toBeVisible();
}

test("stale chunk: toast explains, then reloads into the clicked page", async ({ page }) => {
  await serveChunkAsHtml(page);
  await open(page);

  await page.getByTestId("open-detail").click();

  await expect(page.locator(".notif-toast--info")).toContainText("new version");
  await expect.poll(() => page.evaluate(() => window.__reloadedTo)).toBe("/patients/42");
});

test("chunk still missing after the reload: error toast, no reload loop", async ({ page }) => {
  await serveChunkAsHtml(page);
  await open(page);
  // As if this tab had just reloaded for the same failure.
  await page.evaluate(() => sessionStorage.setItem("neo:chunk-reload-at", String(Date.now())));

  await page.getByTestId("open-detail").click();

  await expect(page.locator(".notif-toast--error")).toContainText("couldn't be loaded");
  expect(await page.evaluate(() => window.__reloadedTo)).toBeUndefined();
});

test("offline: explains instead of reloading into a dead page", async ({ page, context }) => {
  await open(page);
  await context.setOffline(true);

  await page.getByTestId("open-detail").click();

  await expect(page.locator(".notif-toast--warning")).toContainText("offline");
  expect(await page.evaluate(() => window.__reloadedTo)).toBeUndefined();
  await context.setOffline(false);
});

test("healthy chunk: navigation just works, no toast", async ({ page }) => {
  await open(page);

  await page.getByTestId("open-detail").click();

  await expect(page.getByTestId("detail-view")).toBeVisible();
  await expect(page.locator(".notif-toast")).toHaveCount(0);
});
