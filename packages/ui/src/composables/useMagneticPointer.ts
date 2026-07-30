import { onBeforeUnmount, onMounted, type Ref } from "vue";

export interface MagneticPointerOptions {
  /** Max translate offset in px, reached when the pointer is at a viewport edge. */
  strength?: number;
  /** 0..1 smoothing applied per frame — lower = heavier/laggier follow, higher = snappier. */
  ease?: number;
}

/**
 * Writes a `translate3d(x, y, 0)` directly to `elRef`'s style every frame,
 * chasing the pointer's offset from the viewport center with rAF-smoothed
 * lerp (the lag itself is what reads as "magnetic" rather than jittery
 * 1:1 tracking). Bypasses Vue reactivity in the animation loop on purpose —
 * this runs every frame, so it goes straight through the DOM.
 *
 * No-ops on touch pointers (no mouse to attract toward) and under
 * prefers-reduced-motion, leaving the element at its natural position.
 */
export function useMagneticPointer(elRef: Ref<HTMLElement | null>, options: MagneticPointerOptions = {}) {
  const strength = options.strength ?? 16;
  const ease = options.ease ?? 0.12;

  let x = 0;
  let y = 0;
  let targetX = 0;
  let targetY = 0;
  let rafId = 0;
  let running = false;

  // Below this, the lerp has visually settled — stop the loop instead of
  // spinning rAF forever while the pointer sits still.
  const SETTLE_EPSILON = 0.05;

  function handlePointerMove(e: PointerEvent): void {
    const nx = (e.clientX / window.innerWidth) * 2 - 1;
    const ny = (e.clientY / window.innerHeight) * 2 - 1;
    targetX = nx * strength;
    targetY = ny * strength;
    startLoop();
  }

  function tick(): void {
    x += (targetX - x) * ease;
    y += (targetY - y) * ease;

    const el = elRef.value;
    if (el) el.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;

    if (Math.abs(targetX - x) < SETTLE_EPSILON && Math.abs(targetY - y) < SETTLE_EPSILON) {
      running = false;
      return;
    }
    rafId = requestAnimationFrame(tick);
  }

  function startLoop(): void {
    if (running) return;
    running = true;
    rafId = requestAnimationFrame(tick);
  }

  onMounted(() => {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
    if (prefersReducedMotion || isCoarsePointer) return;
    window.addEventListener("pointermove", handlePointerMove);
  });

  onBeforeUnmount(() => {
    window.removeEventListener("pointermove", handlePointerMove);
    if (rafId) cancelAnimationFrame(rafId);
  });
}
