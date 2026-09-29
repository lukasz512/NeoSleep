import { onBeforeUnmount, onMounted, ref, type Ref } from "vue";

/**
 * True once the element is within `margin` of the viewport (and stays true).
 * Used both to reveal text and to decide when a video may start loading, so nothing
 * heavy is fetched for sections the visitor never reaches.
 */
export function useInView(el: Ref<HTMLElement | null>, margin = "25%"): Ref<boolean> {
  const seen = ref(false);
  let observer: IntersectionObserver | null = null;

  onMounted(() => {
    if (!el.value) return;
    if (typeof IntersectionObserver === "undefined") {
      seen.value = true;
      return;
    }
    observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          seen.value = true;
          observer?.disconnect();
        }
      },
      { rootMargin: `${margin} 0px` },
    );
    observer.observe(el.value);
  });

  onBeforeUnmount(() => observer?.disconnect());
  return seen;
}
