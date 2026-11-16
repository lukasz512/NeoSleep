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

interface Leave {
  /** One per animation frame from the Escape until the dialog is gone. */
  frames: Frame[];
  /** The title in the dialog node at the moment it left the DOM. */
  removedTitle: string | null;
}

declare global {
  interface Window {
    __leave?: Promise<Leave>;
  }
}

/**
 * Arms the leave recorder before the Escape is sent (an un-awaited evaluate can land
 * after the key in WebKit). Sampling starts at the Escape, so no frame from before
 * the close counts, and the removed node is read too, so the end of the fade is
 * checked even when no frame lands there.
 */
async function armLeaveRecorder(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__leave = new Promise<Leave>((resolve) => {
      const frames: Frame[] = [];
      let removedTitle: string | null | undefined;
      const titleOf = (dialog: Element | null) =>
        (dialog?.querySelector("[data-testid='work-item-title'] textarea") as HTMLTextAreaElement | null)?.value ?? null;
      const finish = () => {
        if (removedTitle !== undefined && frames.at(-1)?.dialog === false) resolve({ frames, removedTitle });
      };
      const observer = new MutationObserver((records) => {
        for (const node of records.flatMap((record) => [...record.removedNodes])) {
          if (!(node instanceof Element)) continue;
          const dialog = node.matches("[data-testid='work-item-dialog']") ? node : node.querySelector("[data-testid='work-item-dialog']");
          if (!dialog) continue;
          observer.disconnect();
          removedTitle = titleOf(dialog);
          finish();
          return;
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      const started = performance.now();
      const tick = () => {
        const dialog = document.querySelector("[data-testid='work-item-dialog']");
        frames.push({ dialog: !!dialog, loader: false, title: titleOf(dialog) });
        if (!dialog || performance.now() - started > 3000) {
          if (dialog) resolve({ frames, removedTitle: removedTitle ?? null });
          else finish();
        } else requestAnimationFrame(tick);
      };
      document.addEventListener("keydown", (event) => event.key === "Escape" && requestAnimationFrame(tick), {
        capture: true,
        once: true,
      });
    });
  });
}

test("keeps its content while it fades out", async ({ page }) => {
  await page.goto("/e2e/harness/work-item-dialog.html?delay=0");
  await page.getByTestId("board-card").click();
  await expect(page.getByTestId("work-item-events")).toBeVisible();
  await armLeaveRecorder(page);
  await page.keyboard.press("Escape");
  const { frames, removedTitle } = await page.evaluate(() => window.__leave ?? Promise.reject(new Error("leave recorder not armed")));
  const leaving = frames.filter((frame) => frame.dialog);
  // The leave is animated: the dialog is still there in the first frame after the Escape.
  // Not "more than one frame": a loaded CI WebKit can take longer than the 180 ms fade
  // to render a single frame (CORE-216).
  expect(leaving.length).toBeGreaterThan(0);
  // Every frame of the fade, and the node at the moment it is removed, still show the item.
  expect(leaving.every((frame) => frame.title === TITLE)).toBe(true);
  expect(removedTitle).toBe(TITLE);
  await expect(page.getByTestId("work-item-dialog")).toHaveCount(0);

  // Reopening starts from the item again, not from the last state.
  await page.getByTestId("board-card").click();
  await expect(page.getByTestId("work-item-title").locator("textarea").first()).toHaveValue(TITLE);
});
