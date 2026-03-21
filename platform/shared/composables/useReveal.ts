import { ref, type Ref } from "vue";
import { useIntersectionObserver } from "@vueuse/core";

/**
 * One-shot reveal composable — returns a boolean ref that becomes `true`
 * when the target element enters the viewport, then stops observing.
 *
 * Replaces the manual IntersectionObserver + onMounted + onUnmounted pattern.
 *
 * @example
 * const heroRef = ref<HTMLElement | null>(null)
 * const heroVisible = useReveal(heroRef)           // threshold defaults to 0.1
 * const statsVisible = useReveal(statsRef, 0.15)
 */
export function useReveal(
  target: Ref<HTMLElement | null>,
  threshold = 0.1
): Ref<boolean> {
  const visible = ref(false);
  const { stop } = useIntersectionObserver(
    target,
    ([entry]) => {
      if (entry?.isIntersecting) {
        visible.value = true;
        stop();
      }
    },
    { threshold }
  );
  return visible;
}
