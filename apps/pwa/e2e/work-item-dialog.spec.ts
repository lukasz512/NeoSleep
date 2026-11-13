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

test("a screenshot pasted into the description shows inline, not in the strip", async ({ page }) => {
  await page.goto("/e2e/harness/work-item-dialog.html?delay=0");
  await page.getByTestId("board-card").click();
  const editor = page.getByTestId("work-item-problem").locator(".ProseMirror");
  await editor.click();
  await page.keyboard.press("End");
  // A 1×1 PNG, pasted the way a browser delivers a copied screenshot.
  await editor.evaluate((el) => {
    const bytes = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
    const data = new DataTransfer();
    data.items.add(new File([bytes], "bug.png", { type: "image/png" }));
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  });

  await expect(editor.locator("img[alt='bug.png']")).toHaveAttribute("src", /^blob:/);
  // Typing goes on after the image, it doesn't replace it.
  await page.keyboard.type("Steps to repeat");
  await expect(editor.locator("img[alt='bug.png']")).toBeVisible();
  await expect(editor).toContainText("Before CORE-104");
  await expect(editor.locator("p").last()).toHaveText("Steps to repeat");
  await expect(page.getByTestId("work-item-attachment")).toHaveCount(0);
  await expect(page.getByTestId("work-item-pending")).toHaveCount(0);
});
