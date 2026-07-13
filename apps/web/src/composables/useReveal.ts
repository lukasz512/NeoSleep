import { ref, onMounted, onUnmounted, type Ref } from "vue";

/**
 * Reveal multiple elements with a single call.
 * Returns a tuple of booleans in the same order as the input refs.
 *
 * @example
 * const [heroVisible, statsVisible] = useRevealGroup([heroRef, statsRef], 0.08)
 */
export function useRevealGroup(
  targets: Ref<HTMLElement | null>[],
  threshold = 0.1
): Ref<boolean>[] {
  return targets.map((t) => useReveal(t, threshold));
}


/**
 * One-shot reveal composable — returns a boolean ref that becomes `true`
 * when the target element enters the viewport, then stops observing.
 *
 * @example
 * const heroRef = ref<HTMLElement | null>(null)
 * const heroVisible = useReveal(heroRef)
 * const statsVisible = useReveal(statsRef, 0.15)
 */
export function useReveal(
  target: Ref<HTMLElement | null>,
  threshold = 0.1
): Ref<boolean> {
  const visible = ref(false);
  let observer: IntersectionObserver | null = null;

  onMounted(() => {
    if (!target.value) return;
    observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          visible.value = true;
          observer?.disconnect();
        }
      },
      { threshold }
    );
    observer.observe(target.value);
  });

  onUnmounted(() => observer?.disconnect());

  return visible;
}
