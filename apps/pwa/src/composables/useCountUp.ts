import { onBeforeUnmount, ref, watch, type Ref } from "vue";

/**
 * A number that counts up to `target` with an ease-out curve (NEO-238 Panel indicators).
 * Holds at 0 until `enabled` turns on, then counts; a later target change counts on from
 * the shown value. Reduced-motion users get the target straight away.
 */
export function useCountUp(target: Ref<number>, durationMs = 900, enabled: Ref<boolean> = ref(true)): Ref<number> {
  const shown = ref(0);
  let frame = 0;

  const reduced = (): boolean => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

  function run(to: number): void {
    cancelAnimationFrame(frame);
    if (reduced()) {
      shown.value = to;
      return;
    }
    // Not started yet (or leaving): hold the current number; the count runs once enabled.
    if (!enabled.value) return;
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

  watch([target, enabled], ([to]) => run(to), { immediate: true });
  onBeforeUnmount(() => cancelAnimationFrame(frame));
  return shown;
}
