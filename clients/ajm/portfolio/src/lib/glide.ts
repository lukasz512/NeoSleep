/**
 * In-page links (menu, client logos, hero CTA) fly instead of jumping. Round 8 (Łukasz, 2026-09-29):
 * the page leaves slowly, then flies with a motion blur you can see, and lands softly on the
 * target. The blur is a viewport-sized backdrop (cheap: it never paints the whole page) whose
 * strength follows the speed. Lite mode and reduced motion jump straight there.
 */

/** 0 → 1: a slow take-off (time is stretched at the start), a fast middle, a soft landing. */
export function glideCurve(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const s = t ** 1.25;
  return s < 0.5 ? 16 * s ** 5 : 1 - (-2 * s + 2) ** 5 / 2;
}

/** ms for a jump of `distance` px: 1.1 s for a short hop, up to 2 s across the page. */
export function glideDuration(distance: number): number {
  return Math.round(Math.min(2000, Math.max(1100, 900 + Math.abs(distance) * 0.12)));
}

/** Blur in px for a scroll speed in px/ms: none while slow, up to 10 px in full flight. */
export function glideBlur(speed: number): number {
  const v = Math.abs(speed);
  if (v <= 1) return 0;
  return Math.min(10, Math.round((v - 1) * 0.5 * 10) / 10);
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
    root.style.removeProperty("--glide-blur");
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
  let lastY = from;
  let lastT = start;
  const step = (now: number) => {
    if (run !== active) return; // a newer click took over
    const t = Math.min(1, (now - start) / duration);
    const y = from + (to - from) * glideCurve(t);
    window.scrollTo(0, y);
    const speed = (y - lastY) / Math.max(1, now - lastT);
    root.style.setProperty("--glide-blur", `${t < 1 ? glideBlur(speed) : 0}px`);
    lastY = y;
    lastT = now;
    if (t < 1) requestAnimationFrame(step);
    else done();
  };
  requestAnimationFrame(step);
}

/** One listener for every `href="#…"` link on the page, plus the blur layer the flight uses. */
export function installGlide(): void {
  const veil = document.createElement("div");
  veil.className = "glide-blur";
  veil.setAttribute("aria-hidden", "true");
  document.body.appendChild(veil);
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
