/**
 * Phone browsers (Android Chrome, iOS Safari, Firefox) show and hide their URL
 * bar while the page scrolls: the visible height grows by the bar's height and
 * `resize` fires mid-gesture. Desktop browsers never do this, so bugs here only
 * show on phones:
 * - a page sized to scroll exactly N px with the bar shown can scroll fewer px
 *   once the bar hides, so the browser clamps the scroll and the page jumps;
 * - anything that re-measures on that resize and changes the page height
 *   makes the scroll jump under the finger.
 *
 * Scroll-coupled measurements use these two instead:
 * - `largeViewportHeight()`: the viewport with the bar hidden (CSS `100lvh`),
 *   the height that stays the same whatever the bar does.
 * - `onWidthResize(cb)`: a resize listener that ignores height-only changes.
 */
export function largeViewportHeight(): number {
  if (typeof CSS === "undefined" || typeof CSS.supports !== "function" || !CSS.supports("height", "100lvh")) {
    return window.innerHeight;
  }
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;top:0;left:0;width:0;height:100lvh;visibility:hidden;pointer-events:none";
  document.body.appendChild(probe);
  const h = probe.getBoundingClientRect().height;
  probe.remove();
  return Math.max(h, window.innerHeight);
}

/** Calls `cb` on resize only when the viewport width changed. Returns the cleanup. */
export function onWidthResize(cb: () => void): () => void {
  let width = window.innerWidth;
  const handler = () => {
    if (window.innerWidth === width) return;
    width = window.innerWidth;
    cb();
  };
  window.addEventListener("resize", handler);
  return () => window.removeEventListener("resize", handler);
}
