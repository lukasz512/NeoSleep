import { onBeforeUnmount, ref, watch, type Ref } from "vue";

/**
 * A number that counts up from 0 to `target` with an ease-out curve (NEO-238/239 Panel
 * indicators). Holds at 0 until `enabled` turns on, then waits `delayMs` and counts, so
 * a row of numbers can start one after another. A later target change counts on from
 * the shown value. Reduced-motion users get the target straight away.
 */
export function useCountUp(target: Ref<number>, durationMs = 1400, enabled: Ref<boolean> = ref(true), delayMs = 0): Ref<number> {
  const shown = ref(0);
  let frame = 0;
  let wait: ReturnType<typeof setTimeout> | null = null;

  const reduced = (): boolean => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

  function stop(): void {
    cancelAnimationFrame(frame);
    if (wait) clearTimeout(wait);
    wait = null;
  }

  function count(to: number): void {
    const from = shown.value;
    const start = Date.now();
    const step = (): void => {
      const t = Math.min(1, (Date.now() - start) / durationMs);
      // easeOutCubic: fast start, soft landing.
      shown.value = Math.round(from + (to - from) * (1 - (1 - t) ** 3));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  }

  function run(to: number, firstStart: boolean): void {
    stop();
    if (reduced()) {
      shown.value = to;
      return;
    }
    // Not started yet (or leaving): hold the current number; the count runs once enabled.
    if (!enabled.value) return;
    if (firstStart && delayMs > 0) wait = setTimeout(() => count(to), delayMs);
    else count(to);
  }

  watch(
    [target, enabled],
    ([to, on], previous) => run(to, on && !(previous?.[1] ?? false)),
    { immediate: true }
  );
  onBeforeUnmount(stop);
  return shown;
}
