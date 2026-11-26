import { onBeforeUnmount, ref, watch, type ComponentPublicInstance, type Ref } from "vue";

/** Breathing room kept between the logo and the first icon on its right. */
export const BAR_LOGO_MIN_GAP = 16;

type ElRef = Ref<ComponentPublicInstance | Element | null>;

const toElement = (value: ComponentPublicInstance | Element | null): Element | null =>
  value instanceof Element ? value : ((value?.$el as Element | undefined) ?? null);

/**
 * NEO-108: whether the app-bar wordmark still fits next to the bar's icons.
 * Measured, not a breakpoint: the room is the distance from the logo's left
 * edge to the first icon on the right, compared against the *unfolded*
 * wordmark width (a constant), so folding — which narrows the logo — can
 * never flip the result back and make it oscillate. Re-measured whenever the
 * bar or its icons change size (rotation, an icon added or removed).
 */
export function useBarLogoFit(
  logo: ElRef,
  actions: ElRef,
  wordmarkWidth: Ref<number>,
  enabled: Ref<boolean>,
  /** Something shown right after the logo (the DEV env badge), and its gap to the logo. */
  trailing?: { el: ElRef; gap: number },
) {
  const folded = ref(false);
  let observer: ResizeObserver | null = null;

  function measure() {
    const logoEl = toElement(logo.value);
    const actionsEl = toElement(actions.value);
    if (!enabled.value || !logoEl || !actionsEl) {
      folded.value = false;
      return;
    }
    const trailingEl = trailing ? toElement(trailing.el.value) : null;
    const trailingWidth = trailingEl ? trailingEl.getBoundingClientRect().width + trailing!.gap : 0;
    const room = actionsEl.getBoundingClientRect().left - logoEl.getBoundingClientRect().left - BAR_LOGO_MIN_GAP;
    folded.value = room < wordmarkWidth.value + trailingWidth;
  }

  function observe() {
    observer?.disconnect();
    observer = null;
    const logoEl = toElement(logo.value);
    const actionsEl = toElement(actions.value);
    if (!enabled.value || !logoEl || !actionsEl || typeof ResizeObserver === "undefined") {
      measure();
      return;
    }
    observer = new ResizeObserver(measure);
    observer.observe(actionsEl);
    // The bar itself: its width is what changes on rotation / resize.
    observer.observe(logoEl.parentElement ?? logoEl);
    const bar = logoEl.closest(".v-toolbar__content");
    if (bar) observer.observe(bar);
    measure();
  }

  watch([logo, actions, enabled, wordmarkWidth, () => trailing?.el.value], observe, { flush: "post", immediate: true });
  onBeforeUnmount(() => observer?.disconnect());

  return { folded, measure };
}
