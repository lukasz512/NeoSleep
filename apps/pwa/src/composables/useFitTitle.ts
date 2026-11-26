import { onBeforeUnmount, watch, type Ref } from "vue";

/** Smallest size a record name may shrink to before it is cut with "…" (18 px). */
export const FIT_TITLE_MIN_PX = 18;

/**
 * The size that lets a line of text `naturalWidth` px wide (measured at
 * `maxPx`) fit into `room` px: text width scales with its font size, so the
 * ratio gives it directly. Never above `maxPx`, never below `minPx` — past
 * that the line is cut with an ellipsis instead of shrinking into illegibility.
 */
export function fitFontSize(
  room: number,
  naturalWidth: number,
  maxPx: number,
  minPx = FIT_TITLE_MIN_PX,
): number {
  if (room <= 0 || naturalWidth <= room) return maxPx;
  const fitted = Math.floor(((maxPx * room) / naturalWidth) * 10) / 10;
  return Math.max(minPx, Math.min(maxPx, fitted));
}

/**
 * NEO-158: the record's name always stays on one line. It keeps the size its
 * CSS gives it while it fits; a longer name shrinks just enough to fit, down
 * to 18 px, and only a name that still doesn't fit at 18 px is cut with "…"
 * (its full text stays in the h1 for screen readers and in its `title`).
 * Re-measured when the name changes and when its row changes width (rotation,
 * a badge next to it appearing, web fonts arriving). `minPx` sets a lower
 * floor for smaller text (the phone sticky bar's 16 px name).
 */
export function useFitTitle(
  el: Ref<HTMLElement | null>,
  text: Ref<string | undefined>,
  minPx = FIT_TITLE_MIN_PX,
) {
  let observer: ResizeObserver | null = null;

  function measure() {
    const title = el.value;
    if (!title) return;
    // Back to the CSS size first, so the measurement never builds on a previous fit.
    title.style.fontSize = "";
    const maxPx = parseFloat(getComputedStyle(title).fontSize) || 24;
    // The h1 may shrink (flex, min-width 0) but never grows past its text, so
    // when the name overflows, clientWidth is exactly the room the row leaves it.
    let size = fitFontSize(title.clientWidth, title.scrollWidth, maxPx, minPx);
    if (size < maxPx) title.style.fontSize = `${size}px`;
    // Letter-spacing and kerning don't scale exactly — nudge down the last pixel or two.
    for (
      let i = 0;
      i < 4 && size > minPx && title.scrollWidth > title.clientWidth;
      i++
    ) {
      size = Math.max(minPx, size - 0.5);
      title.style.fontSize = `${size}px`;
    }
    title.title =
      title.scrollWidth > title.clientWidth
        ? (title.textContent ?? "").trim()
        : "";
  }

  function observe(title: HTMLElement | null) {
    observer?.disconnect();
    observer = null;
    if (!title) return;
    if (typeof ResizeObserver !== "undefined") {
      // The row, not the title: the title's own width follows the fitted size.
      observer = new ResizeObserver(measure);
      observer.observe(title.parentElement ?? title);
    }
    measure();
    void document.fonts?.ready.then(measure);
  }

  watch(el, observe, { flush: "post" });
  watch(text, () => measure(), { flush: "post" });
  onBeforeUnmount(() => observer?.disconnect());

  return { measure };
}
