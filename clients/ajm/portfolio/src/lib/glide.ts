/**
 * In-page links (menu, client logos, hero CTA) glide instead of jumping (Łukasz, 2026-09-29:
 * "lift the page and drop it"). The curve lifts slightly back, travels, and settles a hair past
 * the target before landing; the page itself rises a touch while it is carried (html.gliding in
 * style.css). Lite mode and reduced motion jump straight there.
 */

const LIFT = 0.8; // how far the curve pulls back / settles past (≈2.5 % of the jump)

/** easeInOutBack with a small overshoot constant: 0 → 1 with a lift at the start and a settle at the end. */
export function glideCurve(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const c = LIFT * 1.525;
  return t < 0.5
    ? ((2 * t) ** 2 * ((c + 1) * 2 * t - c)) / 2
    : ((2 * t - 2) ** 2 * ((c + 1) * (t * 2 - 2) + c) + 2) / 2;
}

/** ms for a jump of `distance` px: 0.9 s for a short hop, up to 1.8 s across the page. */
export function glideDuration(distance: number): number {
  return Math.round(Math.min(1800, Math.max(900, 700 + Math.abs(distance) * 0.18)));
}

/** Room left above a target for the fixed header. */
const HEADER_GAP = 72;

let active = 0;

export function glideTo(target: HTMLElement, instant: boolean): void {
  const from = window.scrollY;
  const to = Math.max(0, target.getBoundingClientRect().top + from - HEADER_GAP);
  const root = document.documentElement;
  const done = () => {
    root.classList.remove("gliding");
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
  };
  if (instant) {
    window.scrollTo(0, to);
    done();
    return;
  }
  const run = ++active;
  const duration = glideDuration(to - from);
  const start = performance.now();
  root.classList.add("gliding");
  const step = (now: number) => {
    if (run !== active) return; // a newer click took over
    const t = Math.min(1, (now - start) / duration);
    window.scrollTo(0, from + (to - from) * glideCurve(t));
    if (t < 1) requestAnimationFrame(step);
    else done();
  };
  requestAnimationFrame(step);
}

/** One listener for every `href="#…"` link on the page. */
export function installGlide(): void {
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const link = (e.target as Element | null)?.closest?.('a[href^="#"]');
    if (!(link instanceof HTMLAnchorElement)) return;
    const id = decodeURIComponent(link.hash.slice(1));
    const target = id === "top" ? document.body : document.getElementById(id);
    if (!target) return;
    e.preventDefault();
    const reduce =
      document.documentElement.classList.contains("lite") ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    glideTo(target, reduce);
    history.replaceState(null, "", `#${id}`);
  });
}
