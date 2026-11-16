import { test, expect, type Page } from "@playwright/test";

/**
 * Guard for the dialog lifecycle rule (CORE-195, AppFormDialog.vue): a dialog
 * opens with the data it already has, never a loader first, and keeps its
 * content unchanged while it fades out. Before the fix the work item dialog
 * showed a spinner, then popped in, and on close blanked its form in front of
 * the user before the fade.
 *
 * The check samples every animation frame in the page, so it sees what the
 * user sees, not just the end state. Harness: e2e/harness/work-item-dialog.ts.
 */

const TITLE = "GDPR: report of cross-doctor patient reads on prod";

interface Frame {
  dialog: boolean;
  loader: boolean;
  title: string | null;
}

/** Records one Frame per animation frame until `stop` is true for a frame, or 3 s pass. */
async function recordFrames(page: Page, stop: "open" | "gone"): Promise<Frame[]> {
  return page.evaluate(
    (until) =>
      new Promise<Frame[]>((resolve) => {
        const frames: Frame[] = [];
        const started = performance.now();
        const tick = () => {
          const dialog = document.querySelector("[data-testid='work-item-dialog']");
          const title = dialog?.querySelector("[data-testid='work-item-title'] textarea") as HTMLTextAreaElement | null;
          frames.push({
            dialog: !!dialog,
            loader: !!document.querySelector(".app-loading-state, .v-progress-circular"),
            title: title?.value ?? null,
          });
          const done = until === "gone" ? !dialog : !!document.querySelector("[data-testid='work-item-events']");
          if (done || performance.now() - started > 3000) resolve(frames);
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    stop,
  );
}

test("opens with its content, no loader first", async ({ page }) => {
  await page.goto("/e2e/harness/work-item-dialog.html?delay=600");
  const frames = recordFrames(page, "open");
  await page.getByTestId("board-card").click();
  const seen = (await frames).filter((frame) => frame.dialog);
  expect(seen.length).toBeGreaterThan(0);
  expect(seen.some((frame) => frame.loader)).toBe(false);
  expect(seen.every((frame) => frame.title === TITLE)).toBe(true);
});

test("keeps its content while it fades out", async ({ page }) => {
  await page.goto("/e2e/harness/work-item-dialog.html?delay=0");
  await page.getByTestId("board-card").click();
  await expect(page.getByTestId("work-item-events")).toBeVisible();
  const frames = recordFrames(page, "gone");
  await page.keyboard.press("Escape");
  const leaving = (await frames).filter((frame) => frame.dialog);
  // More than one frame: the leave is animated, and every one of them still shows the item.
  expect(leaving.length).toBeGreaterThan(1);
  expect(leaving.every((frame) => frame.title === TITLE)).toBe(true);
  await expect(page.getByTestId("work-item-dialog")).toHaveCount(0);

  // Reopening starts from the item again, not from the last state.
  await page.getByTestId("board-card").click();
  await expect(page.getByTestId("work-item-title").locator("textarea").first()).toHaveValue(TITLE);
});
