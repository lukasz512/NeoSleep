import { test, expect, type Page } from "@playwright/test";

/**
 * NEO-217: device orders use the Documentos status row. The newest order shows
 * the Creado → Pedido → Recibido track, older ones open on click, a failed send
 * is red "Requiere atención", and ⋯ always sits on the row's right edge — on a
 * phone too. Harness: e2e/harness/device-orders.ts.
 */
async function open(page: Page, query = ""): Promise<void> {
  await page.goto(`/e2e/harness/device-orders.html${query}`);
  await expect(page.getByTestId("device-order-row")).toHaveCount(3);
}

for (const viewport of [
  { name: "desktop", width: 1280, height: 800 },
  { name: "phone", width: 360, height: 740 },
]) {
  test(`⋯ is pinned to the right edge of every row (${viewport.name})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await open(page, "?lang=mx");
    const rows = page.getByTestId("device-order-row");
    for (let i = 0; i < 3; i++) {
      const row = rows.nth(i);
      const rowBox = (await row.boundingBox())!;
      const menuBox = (await row.locator(".app-list-item-menu__trigger").boundingBox())!;
      expect(rowBox.x + rowBox.width - (menuBox.x + menuBox.width)).toBeLessThanOrEqual(12);
      // …and in the row's top line, not dropped under the text.
      expect(menuBox.y - rowBox.y).toBeLessThanOrEqual(16);
    }
  });
}

test("only the newest order shows the track; an older one opens on click", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page, "?lang=mx");
  const rows = page.getByTestId("device-order-row");
  await expect(rows.nth(0).getByTestId("device-order-track")).toBeVisible();
  await expect(rows.nth(0)).toContainText("Creado");
  await expect(rows.nth(1).getByTestId("device-order-track")).toHaveCount(0);
  await rows.nth(1).locator("button.patient-orthoapnea-panel__head").click();
  await expect(rows.nth(1).getByTestId("device-order-track")).toBeVisible();
});

test("a failed send is red 'Requiere atención'; a draft says 'Sin enviar' with Continuar", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page, "?lang=mx&case=attention");
  const first = page.getByTestId("device-order-row").first();
  await expect(first).toHaveAttribute("data-state", "attention");
  await expect(first).toContainText("Requiere atención");

  await open(page, "?lang=mx&case=draft");
  const draft = page.getByTestId("device-order-row").first();
  await expect(draft).toContainText("Sin enviar");
  await expect(draft.getByTestId("device-order-continue")).toBeVisible();
  // D3: a draft can be hidden from ⋯; a sent order cannot.
  await draft.locator(".app-list-item-menu__trigger").click();
  await expect(page.getByText("Ocultar borrador")).toBeVisible();
});

test("no partner name anywhere on the tab", async ({ page }) => {
  await open(page, "?lang=mx");
  await expect(page.getByTestId("panel")).not.toContainText(/orthoapnea/i);
});

test("comments open in a side panel on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page, "?lang=mx");
  await page.getByTestId("device-order-comments-open").first().click();
  await expect(page.getByTestId("device-order-comments")).toBeVisible();
  // Measured once the open transition has settled.
  const side = page.locator(".device-order-comments--side");
  await expect.poll(async () => { const box = (await side.boundingBox())!; return 1280 - (box.x + box.width); }).toBeLessThanOrEqual(2);
});
