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

/**
 * Watches the dialog from the Escape keydown until it is gone (or 3 s pass): the
 * title at every animation frame, every 16 ms and every DOM change, plus how long
 * the leave took. Not a frame count (CORE-208): CI WebKit paints a 180 ms leave in
 * one or two frames, so "more than one frame" failed there on a correct dialog.
 *
 * Resolves once the watcher is in the page, so the caller presses Escape only after
 * that; `result()` then waits for the leave to end.
 */
async function recordLeave(page: Page) {
  const watcher = await page.evaluateHandle(() => ({
    // Wrapped in an object: evaluateHandle would otherwise wait for the promise itself.
    result: new Promise<{ titles: (string | null)[]; leaveMs: number | null }>((resolve) => {
      const titles: (string | null)[] = [];
      let escapeAt: number | null = null;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        observer.disconnect();
        clearInterval(timer);
        resolve({ titles, leaveMs: escapeAt === null ? null : performance.now() - escapeAt });
      };
      const look = () => {
        if (done || escapeAt === null) return;
        const dialog = document.querySelector("[data-testid='work-item-dialog']");
        if (!dialog || performance.now() - escapeAt > 3000) return finish();
        const title = dialog.querySelector("[data-testid='work-item-title'] textarea") as HTMLTextAreaElement | null;
        titles.push(title?.value ?? null);
      };
      const observer = new MutationObserver(look);
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
      const timer = setInterval(look, 16);
      const frame = () => {
        look();
        if (!done) requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
      window.addEventListener("keydown", () => (escapeAt = performance.now()), { capture: true, once: true });
      // No Escape at all: answer with leaveMs null instead of hanging the test.
      setTimeout(finish, 10_000);
    }),
  }));
  return { result: () => watcher.evaluate((w) => w.result) };
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
  const leave = await recordLeave(page);
  await page.keyboard.press("Escape");
  const { titles, leaveMs } = await leave.result();
  // The leave is animated (180 ms, OriginDialogTransition), and every look at the
  // dialog on the way out still shows the item.
  expect(leaveMs).toBeGreaterThan(100);
  expect(titles.length).toBeGreaterThan(0);
  expect(titles.every((title) => title === TITLE)).toBe(true);
  await expect(page.getByTestId("work-item-dialog")).toHaveCount(0);

  // Reopening starts from the item again, not from the last state.
  await page.getByTestId("board-card").click();
  await expect(page.getByTestId("work-item-title").locator("textarea").first()).toHaveValue(TITLE);
});
