import { test, expect, type Page } from "@playwright/test";

/**
 * Real-browser guard for the partner document dialog (NEO-51 review,
 * 2026-09-25). Two bugs only a real engine shows:
 *
 * 1. The signature pad sized its canvas from getBoundingClientRect() while the
 *    dialog was still zooming in, so the canvas was ~half its real width and
 *    ink beyond it was lost — Safari kept almost nothing, so the signed
 *    agreement showed an empty "El Socio" line.
 * 2. The document frame measured scrollHeight, which Safari/Firefox never
 *    report below the frame's current height — the short privacy notice
 *    inherited the long agreement's height.
 *
 * API stubbed with page.route (no DB): the documents are tiny fixtures with
 * the same data-image/data-field hooks as the real templates.
 */

const PREVIEW = {
  email: "doctor@example.com", firstName: "Ana", lastName: "García",
  clinicName: "Clínica de Prueba", clinicEmail: "clinic@example.com", clinicPhone: "+52 55 1234 5678",
  clinicAddress: "Av. Reforma 123, CDMX", taxId: null, jurisdiction: "MX", licenseNumber: "12345678",
  practiceRole: "staff", documents: { agreementVersionId: "agr-1", dpaVersionId: "dpa-1", noticeVersionId: "not-1" },
};

const longText = Array.from({ length: 60 }, (_, i) => `<p>Cláusula ${i + 1}. Texto del contrato.</p>`).join("");
const AGREEMENT = {
  html: `<!DOCTYPE html><html><head><style>.sig{height:80px;width:300px;border-bottom:1px solid #000}.sig img{max-height:76px;max-width:100%;display:block}</style></head><body>${longText}
    <div class="signatures"><div class="sig" data-image="counterparty_signature"></div><div class="sig" data-image="signer_signature"></div></div></body></html>`,
  dataFields: {},
  imageFields: {},
  versionIds: ["agr-1", "dpa-1"],
  versionLabel: "1.1",
};
const NOTICE = {
  html: "<!DOCTYPE html><html><body><h1>Aviso de privacidad</h1><p>Texto corto.</p></body></html>",
  dataFields: {},
  imageFields: {},
  versionIds: ["not-1"],
  versionLabel: "1",
};

async function openRegistration(page: Page) {
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.route(
    (url) => /^\/(api|auth)\//.test(url.pathname),
    (route) => {
      const url = route.request().url();
      if (url.includes("/invite/validate")) return route.fulfill({ json: PREVIEW });
      if (url.includes("/invite/document") && url.includes("type=agreement")) return route.fulfill({ json: AGREEMENT });
      if (url.includes("/invite/document") && url.includes("type=notice")) return route.fulfill({ json: NOTICE });
      return route.fulfill({ status: 401, json: {} });
    },
  );
  await page.goto("/partner-register?token=e2e");
  // First hit on this route makes the Vite dev server compile it cold; under
  // CI's 3-engine parallel load that alone overran the 5 s default in WebKit.
  await expect(page.locator(".partner-registration__documents")).toBeVisible({ timeout: 20_000 });
}

const frameHeight = (page: Page) =>
  page.locator(".partner-doc-dialog__frame").evaluate((f) => Math.round(f.getBoundingClientRect().height));

test("a drawn signature is kept in full and shows on the signed agreement; frame heights don't carry over", async ({ page }) => {
  // ~75 real pointer moves plus two document renders: ~2 s locally, but CI
  // WebKit under parallel load ran out of the 30 s default mid-test.
  test.setTimeout(90_000);
  await openRegistration(page);
  const rows = page.locator(".partner-document-row");

  await rows.nth(0).locator("button").click();
  const canvas = page.locator(".signature-pad canvas");
  await canvas.scrollIntoViewIfNeeded();
  // Let the dialog's zoom-in finish so the pointer lands where the pad really is.
  await page.waitForFunction(() =>
    document.getAnimations().filter((a) => a.effect?.getComputedTiming().endTime !== Infinity).every((a) => a.playState !== "running"),
  );

  // Backing store = layout size × DPR (not the mid-transition, scaled size).
  const sizes = await canvas.evaluate((c: HTMLCanvasElement) => ({ w: c.width, css: (c.parentElement as HTMLElement).offsetWidth, dpr: devicePixelRatio }));
  expect(Math.abs(sizes.w - sizes.css * sizes.dpr)).toBeLessThanOrEqual(2);

  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + box.height * 0.6);
  await page.mouse.down();
  for (let i = 0; i <= 24; i++) {
    await page.mouse.move(box.x + 20 + i * ((box.width - 40) / 24), box.y + box.height * (0.5 + 0.3 * Math.sin(i / 2)), { steps: 3 });
  }
  await page.mouse.up();
  await page.getByRole("button", { name: "Sign", exact: true }).click();

  // The signed preview carries the doctor's signature, spanning most of what was drawn.
  const signer = page.frameLocator(".partner-doc-dialog__frame").locator('[data-image="signer_signature"] img');
  await expect(signer).toBeVisible();
  const ink = await signer.evaluate(async (img: HTMLImageElement) => {
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i]) n++;
    return { n, width: img.naturalWidth };
  });
  expect(ink.n).toBeGreaterThan(1000);
  expect(ink.width).toBeGreaterThan(sizes.w * 0.6);

  const agreementHeight = await frameHeight(page);
  await page.getByRole("button", { name: "Done", exact: true }).click();

  await rows.nth(1).locator("button").click();
  await expect(page.frameLocator(".partner-doc-dialog__frame").locator("h1")).toHaveText("Aviso de privacidad");
  await expect.poll(() => frameHeight(page)).toBeLessThan(agreementHeight / 3);
});
