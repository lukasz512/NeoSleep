import { test, expect } from "@playwright/test";

/**
 * Work item dialog in a real browser (CORE-195). "Attach does nothing" was
 * reported; the picker was a display:none input, whose .click() some engines
 * ignore. It is now visually hidden instead, and this checks the native file
 * chooser opens and the picked file uploads. Harness: e2e/harness/work-item-dialog.ts.
 */

test("Attach opens the file chooser and uploads the picked file", async ({ page }) => {
  await page.goto("/e2e/harness/work-item-dialog.html?delay=0");
  await page.getByTestId("board-card").click();
  await expect(page.getByTestId("work-item-events")).toBeVisible();

  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("work-item-attach").click();
  await (await chooser).setFiles({ name: "notes.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n") });

  await expect(page.getByTestId("work-item-attachment")).toContainText("notes.pdf");
});
