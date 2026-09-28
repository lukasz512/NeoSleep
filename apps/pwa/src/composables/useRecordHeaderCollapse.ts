import { onBeforeUnmount, watch, type Ref } from "vue";

/**
 * NEO-181: the phone record header collapses into the toolbar with the
 * scroll itself — no threshold, no timer. Every scroll position maps to one
 * frame: the avatar shrinks to icon size and the name to 15 px as both travel
 * into the toolbar row next to ‹; scrolling back retraces it exactly.
 *
 * How:
 * - The header is `position: sticky` with a top that parks its last 48 px on
 *   the toolbar row, so the browser itself moves it (no copy that has to keep
 *   up with the finger).
 * - The motion is a CSS scroll-driven animation (animation-timeline:
 *   scroll(root)), run in the same frame as the scroll. This composable only
 *   measures the header and writes the numbers the keyframes need as CSS
 *   variables on the view; where scroll-driven animations aren't supported,
 *   it applies the same frames itself on scroll.
 * - Let go halfway and it settles: fully open, or fully docked when the page
 *   is long enough to dock at all (a short record simply stays open, as iOS
 *   large titles do).
 */

/** Where things land in the 48 px toolbar row, from the content's left edge. */
export const DOCK = {
  row: 48,
  avatarX: 22,
  avatar: 24,
  titleX: 54,
  titlePx: 15,
  titleMinPx: 13,
  /** Width the toolbar's two action buttons take on the right. */
  actions: 88,
} as const;

export interface CollapseGeometry {
  /** Header height at rest = scroll distance of the collapse. */
  height: number;
  avatar: { x: number; y: number; size: number };
  title: { x: number; y: number; fontPx: number; lineHeight: number; textWidth: number; rowWidth: number };
  /** Top of the first element that fades (identity line). */
  fadeTop: number;
  /** Visual room for the docked name: from its left edge to the toolbar's actions. */
  room: number;
}

export interface CollapseVars {
  "--rh-R": string;
  "--rh-av-dx": string;
  "--rh-av-dy": string;
  "--rh-av-s": string;
  "--rh-nm-dx": string;
  "--rh-nm-dy": string;
  "--rh-nm-s": string;
  "--rh-nm-w0": string;
  "--rh-nm-w1": string;
  "--rh-fade": string;
  "--rh-label": string;
}

const px = (n: number) => `${Math.round(n * 100) / 100}px`;

/**
 * The docked end state as translate/scale from each element's resting
 * place (transform-origin top left). Derivation: after the toolbar has
 * pinned, the header's top sits at (bar bottom − scrolled); at scroll = height
 * the header pins with its last 48 px on the bar, so an element at y in the
 * header must move by (height − 48 + target y in the row − y).
 */
export function collapseVars(g: CollapseGeometry): CollapseVars {
  const rowToHeader = g.height - DOCK.row;
  const avatarScale = DOCK.avatar / g.avatar.size;
  const room = Math.max(40, g.room);
  const fit = g.title.textWidth > 0 ? room / g.title.textWidth : 1;
  const titleScale = Math.max(DOCK.titleMinPx / g.title.fontPx, Math.min(DOCK.titlePx / g.title.fontPx, fit));
  const titleTop = (DOCK.row - g.title.lineHeight * titleScale) / 2;
  return {
    "--rh-R": px(g.height),
    "--rh-av-dx": px(DOCK.avatarX - g.avatar.x),
    "--rh-av-dy": px(rowToHeader + (DOCK.row - DOCK.avatar) / 2 - g.avatar.y),
    "--rh-av-s": String(Math.round(avatarScale * 10000) / 10000),
    "--rh-nm-dx": px(DOCK.titleX - g.title.x),
    "--rh-nm-dy": px(rowToHeader + titleTop - g.title.y),
    "--rh-nm-s": String(Math.round(titleScale * 10000) / 10000),
    // A name still too long at the smallest size ends in "…" before the
    // actions instead of running under them: its box narrows as it docks.
    "--rh-nm-w0": px(g.title.rowWidth),
    "--rh-nm-w1": px(room / titleScale),
    // Gone before the line reaches the toolbar row (it scrolls up under it).
    "--rh-fade": px(Math.max(8, Math.min(g.height * 0.5, g.fadeTop * 0.7))),
    // The "‹ MODULE" label clears before the avatar arrives next to ‹.
    "--rh-label": px(Math.max(16, g.height * 0.4)),
  };
}

/** Collapse progress 0…1 for a scroll position. */
export function collapseProgress(scrollY: number, start: number, height: number): number {
  if (height <= 0) return 0;
  return Math.min(1, Math.max(0, (scrollY - start) / height));
}

/** Where to settle after the finger lifts, or null to stay. */
export function settleTarget(scrollY: number, start: number, height: number, maxScroll: number): number | null {
  const p = collapseProgress(scrollY, start, height);
  if (p <= 0.01 || p >= 0.99) return null;
  const canDock = start + height <= maxScroll + 1;
  return p >= 0.5 && canDock ? start + height : start;
}

export function useRecordHeaderCollapse(opts: {
  /** The view root: the CSS variables go here (the toolbar reads them too). */
  root: Ref<HTMLElement | null>;
  /** Zero-height marker right above the toolbar: where the collapse starts. */
  sentinel: Ref<HTMLElement | null>;
  header: Ref<HTMLElement | null>;
  title: Ref<HTMLElement | null>;
  enabled: Ref<boolean>;
}) {
  const supportsTimeline =
    typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("animation-timeline: scroll()");
  const hasScrollEnd = typeof window !== "undefined" && "onscrollend" in window;
  let start = 0;
  let height = 0;
  let observer: ResizeObserver | null = null;
  let settleTimer = 0;
  let cleanups: (() => void)[] = [];

  const layoutTop = () => {
    const root = opts.root.value;
    const v = root ? parseFloat(getComputedStyle(root).getPropertyValue("--v-layout-top")) : NaN;
    return Number.isFinite(v) ? v : 56;
  };

  function geometry(): CollapseGeometry | null {
    const header = opts.header.value;
    const title = opts.title.value;
    const avatar = header?.firstElementChild as HTMLElement | null;
    if (!header || !title || !avatar) return null;
    // offsetTop/Left ignore transforms, so this reads the resting layout at any scroll.
    const titleStyle = getComputedStyle(title);
    const fade = header.querySelector<HTMLElement>(".view-item__record-details");
    const actions = opts.root.value?.querySelector<HTMLElement>(".record-toolbar__actions");
    const contentLeft = header.getBoundingClientRect().left;
    const room = actions
      ? actions.getBoundingClientRect().left - contentLeft - DOCK.titleX - 6
      : header.clientWidth - DOCK.titleX - DOCK.actions - 8;
    return {
      height: header.offsetHeight,
      avatar: { x: avatar.offsetLeft, y: avatar.offsetTop, size: avatar.offsetWidth || 48 },
      title: {
        x: title.offsetLeft,
        y: title.offsetTop,
        fontPx: parseFloat(titleStyle.fontSize) || 24,
        lineHeight: title.offsetHeight || 32,
        // scrollWidth: the whole name, however narrow its box is right now.
        textWidth: title.scrollWidth,
        rowWidth: title.parentElement?.clientWidth ?? title.clientWidth,
      },
      fadeTop: fade ? fade.offsetTop : header.offsetHeight / 2,
      room,
    };
  }

  function clear() {
    const root = opts.root.value;
    if (!root) return;
    for (const name of ["--rh-start", "--rh-R", "--rh-av-dx", "--rh-av-dy", "--rh-av-s", "--rh-nm-dx", "--rh-nm-dy", "--rh-nm-s", "--rh-nm-w0", "--rh-nm-w1", "--rh-fade", "--rh-label"]) {
      root.style.removeProperty(name);
    }
  }

  function measure() {
    const root = opts.root.value;
    const sentinel = opts.sentinel.value;
    const g = geometry();
    if (!opts.enabled.value || !root || !sentinel || !g) return clear();
    start = Math.max(0, sentinel.getBoundingClientRect().top + window.scrollY - layoutTop());
    height = g.height;
    root.style.setProperty("--rh-start", px(start));
    for (const [name, value] of Object.entries(collapseVars(g))) root.style.setProperty(name, value);
    if (!supportsTimeline) applyFallback();
  }

  /** Browsers without scroll-driven animations: the same frames, set on scroll. */
  function applyFallback() {
    const root = opts.root.value;
    const header = opts.header.value;
    if (!root || !header) return;
    const p = collapseProgress(window.scrollY, start, height);
    const cs = getComputedStyle(root);
    const n = (name: string) => parseFloat(cs.getPropertyValue(name)) || 0;
    const avatar = header.firstElementChild as HTMLElement | null;
    if (avatar) avatar.style.transform = `translate(${n("--rh-av-dx") * p}px, ${n("--rh-av-dy") * p}px) scale(${1 + (n("--rh-av-s") - 1) * p})`;
    const title = opts.title.value;
    if (title) {
      title.style.transform = `translate(${n("--rh-nm-dx") * p}px, ${n("--rh-nm-dy") * p}px) scale(${1 + (n("--rh-nm-s") - 1) * p})`;
      title.style.maxWidth = `${n("--rh-nm-w0") + (n("--rh-nm-w1") - n("--rh-nm-w0")) * p}px`;
    }
    const faded = Math.min(1, Math.max(0, (window.scrollY - start) / (n("--rh-fade") || 1)));
    header.querySelectorAll<HTMLElement>(".view-item__record-details, .view-item__record-title-row > :not(h1)").forEach((el) => {
      el.style.opacity = String(1 - faded);
      el.style.visibility = faded >= 1 ? "hidden" : "";
    });
    const label = Math.min(1, Math.max(0, (window.scrollY - start) / (n("--rh-label") || 1)));
    root.querySelectorAll<HTMLElement>(".record-toolbar__back-label").forEach((el) => {
      el.style.opacity = String(1 - label);
      el.style.maxWidth = `${12 * 16 * (1 - label)}px`;
    });
    root.style.setProperty("--rh-rule", String(Math.min(1, Math.max(0, (p * height - (height - 12)) / 12))));
  }

  function settle() {
    if (!opts.enabled.value || height <= 0) return;
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const target = settleTarget(window.scrollY, start, height, maxScroll);
    if (target === null) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: target, behavior: reduce ? "auto" : "smooth" });
  }

  function onScroll() {
    if (!supportsTimeline) applyFallback();
    // Browsers without `scrollend`: settle once scrolling has been quiet for a moment.
    if (!hasScrollEnd) {
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(settle, 140);
    }
  }

  function attach() {
    detach();
    if (!opts.enabled.value) return clear();
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("scrollend", settle);
    window.addEventListener("resize", measure);
    cleanups.push(() => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("scrollend", settle);
      window.removeEventListener("resize", measure);
    });
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => measure());
      for (const el of [opts.header.value, opts.title.value, opts.root.value]) if (el) observer.observe(el);
    }
    void document.fonts?.ready.then(measure);
  }

  function detach() {
    for (const fn of cleanups.splice(0)) fn();
    observer?.disconnect();
    observer = null;
    window.clearTimeout(settleTimer);
  }

  watch(
    () => [opts.enabled.value, opts.header.value, opts.title.value, opts.sentinel.value] as const,
    () => attach(),
    { flush: "post", immediate: true },
  );
  onBeforeUnmount(() => {
    detach();
    clear();
  });

  return { measure };
}
