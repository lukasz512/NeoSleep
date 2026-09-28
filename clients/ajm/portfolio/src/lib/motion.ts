import { onBeforeUnmount, onMounted, ref, type Directive, type Ref } from "vue";

/**
 * Motion primitives shared by every section (no animation library: ~2 KB instead of GSAP's ~70 KB).
 *
 *   v-reveal            fade + rise once the element enters the viewport
 *   v-reveal="'wipe'"   clip-path wipe from the bottom (images, video frames)
 *   v-reveal="'scale'"  image settles from 1.08 to 1 while it fades in
 *   v-reveal="'line'"   a rule that draws itself from the left
 *   v-reveal="{ variant, delay }"  delay in ms, for staggers
 *   v-parallax="0.12"   drifts at 12 % of the scroll speed relative to the viewport centre
 *
 * Lite mode (html.lite: weak device/connection or reduced motion) shows everything at rest:
 * the CSS in style.css neutralises .rv and [data-parallax], and no scroll listener is attached.
 */

export type RevealVariant = "up" | "wipe" | "scale" | "fade" | "line";
export type RevealValue = RevealVariant | { variant?: RevealVariant; delay?: number } | undefined;

export function parseReveal(value: RevealValue): { variant: RevealVariant; delay: number } {
  if (!value) return { variant: "up", delay: 0 };
  if (typeof value === "string") return { variant: value, delay: 0 };
  return { variant: value.variant ?? "up", delay: value.delay ?? 0 };
}

function isLite(): boolean {
  return typeof document !== "undefined" && document.documentElement.classList.contains("lite");
}

let revealObserver: IntersectionObserver | null = null;
function observer(): IntersectionObserver | null {
  if (typeof IntersectionObserver === "undefined") return null;
  revealObserver ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add("rv-in");
        revealObserver?.unobserve(e.target);
      }
    },
    { rootMargin: "0px 0px -12% 0px" },
  );
  return revealObserver;
}

export const vReveal: Directive<HTMLElement, RevealValue> = {
  mounted(el, binding) {
    const { variant, delay } = parseReveal(binding.value);
    el.classList.add("rv");
    el.dataset.rv = variant;
    if (delay) el.style.setProperty("--rv-delay", `${delay}ms`);
    const io = observer();
    if (!io || isLite()) {
      el.classList.add("rv-in");
      return;
    }
    io.observe(el);
  },
  unmounted(el) {
    revealObserver?.unobserve(el);
  },
};

// ---- parallax + scroll progress share one rAF-throttled scroll loop ----------------------

type Tick = () => void;
const ticks = new Set<Tick>();
let scheduled = false;
function run() {
  scheduled = false;
  ticks.forEach((t) => t());
}
function onScroll() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(run);
}
function addTick(t: Tick) {
  if (ticks.size === 0) {
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
  }
  ticks.add(t);
  t();
}
function removeTick(t: Tick) {
  ticks.delete(t);
  if (ticks.size === 0) {
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onScroll);
  }
}

const parallaxTicks = new WeakMap<HTMLElement, Tick>();

export const vParallax: Directive<HTMLElement, number | undefined> = {
  mounted(el, binding) {
    if (isLite()) return;
    const speed = binding.value ?? 0.12;
    el.dataset.parallax = "";
    const tick = () => {
      const r = el.getBoundingClientRect();
      if (r.bottom < -200 || r.top > window.innerHeight + 200) return;
      const offset = r.top + r.height / 2 - window.innerHeight / 2;
      el.style.setProperty("--py", `${(-offset * speed).toFixed(1)}px`);
    };
    parallaxTicks.set(el, tick);
    addTick(tick);
  },
  unmounted(el) {
    const tick = parallaxTicks.get(el);
    if (tick) removeTick(tick);
  },
};

/** 0 → 1 while the element scrolls through: 0 when its top meets the viewport top, 1 when its bottom meets the viewport bottom. */
export function progressThrough(top: number, height: number, viewport: number): number {
  const travel = height - viewport;
  if (travel <= 0) return top <= 0 ? 1 : 0;
  return Math.min(1, Math.max(0, -top / travel));
}

/** 0 → 1 while the element enters: 0 when its top is at the viewport bottom, 1 when it reaches the top. */
export function progressEntering(top: number, viewport: number): number {
  return Math.min(1, Math.max(0, 1 - top / viewport));
}

/**
 * Scroll progress for an element: "through" a tall (pinned) section, or while it is "enter"ing.
 * Stays 0 in lite mode, where sections lay out statically.
 */
export function useScrollProgress(el: Ref<HTMLElement | null>, mode: "through" | "enter" = "through"): Ref<number> {
  const progress = ref(0);
  const tick = () => {
    if (!el.value) return;
    const r = el.value.getBoundingClientRect();
    progress.value =
      mode === "enter" ? progressEntering(r.top, window.innerHeight) : progressThrough(r.top, r.height, window.innerHeight);
  };
  onMounted(() => {
    if (!isLite()) addTick(tick);
  });
  onBeforeUnmount(() => removeTick(tick));
  return progress;
}
