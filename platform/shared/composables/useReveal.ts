import { ref, onMounted, onUnmounted, type Ref } from "vue";

/**
 * One-shot reveal composable — returns a boolean ref that becomes `true`
 * when the target element enters the viewport, then stops observing.
 *
 * Nie używa @vueuse/core celowo — platform/shared nie jest paczką workspace,
 * więc zewnętrzne zależności nie są rozwiązywalne przez Rollup przy buildzie.
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
