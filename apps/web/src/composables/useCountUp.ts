import { ref, watch, onUnmounted, type Ref } from "vue";

export interface UseCountUpOptions {
  /** Target number to count to */
  target: number;
  /** Suffix after the number (e.g. "%", "M+", "+") */
  suffix?: string;
  /** Duration in ms */
  duration?: number;
  /** Start animation when this ref becomes true (e.g. when section is visible) */
  startWhen?: Ref<boolean>;
  /** Easing: linear, easeOutExpo (default, decelerates at end) */
  easing?: "linear" | "easeOutExpo";
}

function easeOutExpo(t: number): number {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

export function useCountUp(options: UseCountUpOptions) {
  const {
    target,
    suffix = "",
    duration = 2000,
    startWhen,
    easing = "easeOutExpo",
  } = options;

  const displayValue = ref(formatValue(0, suffix));
  let rafId: number | null = null;
  let hasStarted = false;

  function formatValue(n: number, suf: string): string {
    const rounded = Math.round(n);
    if (suf === "M+" || suf === "M") return `${rounded}${suf}`;
    return `${rounded}${suf}`;
  }

  function run() {
    if (hasStarted) return;
    hasStarted = true;
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const eased = easing === "easeOutExpo" ? easeOutExpo(t) : t;
      const current = eased * target;
      displayValue.value = formatValue(current, suffix);
      if (t < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        displayValue.value = formatValue(target, suffix);
      }
    };
    rafId = requestAnimationFrame(tick);
  }

  if (startWhen) {
    watch(
      startWhen,
      (visible) => {
        if (visible) run();
      },
      { immediate: true }
    );
  }

  onUnmounted(() => {
    if (rafId !== null) cancelAnimationFrame(rafId);
  });

  return { displayValue, start: run };
}
