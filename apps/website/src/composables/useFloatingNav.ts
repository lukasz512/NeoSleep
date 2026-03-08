import { ref, onMounted, onUnmounted } from "vue";

const SCROLL_HIDE_THRESHOLD = 280;
const MOUSE_FACTOR = 0.06;
const SMOOTH = 0.28;

export function useFloatingNav() {
  const headerHidden = ref(false);
  const translateX = ref(0);
  const translateY = ref(0);
  const isReducedMotion = ref(false);

  let scrollY = 0;
  let mouseX = 0;
  let mouseY = 0;
  let currentX = 0;
  let currentY = 0;
  let rafId: number | null = null;

  function onScroll() {
    scrollY = window.scrollY;
    headerHidden.value = scrollY > SCROLL_HIDE_THRESHOLD;
  }

  function onMouseMove(e: MouseEvent) {
    if (isReducedMotion.value) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    mouseX = (e.clientX - w / 2) * MOUSE_FACTOR;
    mouseY = (e.clientY - h / 2) * MOUSE_FACTOR;
  }

  function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  function tick() {
    if (headerHidden.value) {
      currentX = lerp(currentX, 0, SMOOTH);
      currentY = lerp(currentY, 0, SMOOTH);
    } else {
      currentX = lerp(currentX, mouseX, SMOOTH);
      currentY = lerp(currentY, mouseY, SMOOTH);
    }
    translateX.value = currentX;
    translateY.value = currentY;
    rafId = requestAnimationFrame(tick);
  }

  onMounted(() => {
    if (typeof window === "undefined") return;
    isReducedMotion.value = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scrollY = window.scrollY;
    headerHidden.value = scrollY > SCROLL_HIDE_THRESHOLD;
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("mousemove", onMouseMove, { passive: true });
    rafId = requestAnimationFrame(tick);
  });

  onUnmounted(() => {
    if (typeof window === "undefined") return;
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("mousemove", onMouseMove);
    if (rafId !== null) cancelAnimationFrame(rafId);
  });

  return {
    headerHidden,
    translateX,
    translateY,
  };
}
