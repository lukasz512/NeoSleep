import { ref, onMounted, onBeforeUnmount, nextTick, type Ref } from "vue";

/**
 * Sizes an element so it reaches exactly the bottom of the visible page —
 * for lists embedded under other content (e.g. a detail view's tab, below
 * the header and tab bar), where AppEntityList's own 70vh floor would push
 * the page into a second, outer scroll. The element's content then scrolls
 * inside it instead.
 *
 * Height = viewport height − the element's document-top − every ancestor's
 * bottom padding/border/margin up to and including VMain (whose padding-bottom is
 * where AppShell reserves the mobile bottom nav bar). Nothing is hardcoded,
 * so layout padding changes are picked up automatically.
 *
 * Recomputed on mount and on window resize.
 */
export function useFillViewportHeight(target: Ref<HTMLElement | null>, minHeight = 360) {
  const height = ref<number | null>(null);

  function bottomInset(el: HTMLElement): number {
    let inset = 0;
    let node = el.parentElement;
    while (node && node !== document.body) {
      const style = getComputedStyle(node);
      inset += (parseFloat(style.paddingBottom) || 0) + (parseFloat(style.borderBottomWidth) || 0) + (parseFloat(style.marginBottom) || 0);
      if (node.classList.contains("v-main")) break;
      node = node.parentElement;
    }
    return inset;
  }

  function scrollOffset(el: HTMLElement): number {
    let offset = window.scrollY;
    for (let node = el.parentElement; node; node = node.parentElement) offset += node.scrollTop;
    return offset;
  }

  function measure() {
    const el = target.value;
    if (!el) return;
    const documentTop = el.getBoundingClientRect().top + scrollOffset(el);
    height.value = Math.max(minHeight, Math.floor(window.innerHeight - documentTop - bottomInset(el)));
  }

  onMounted(async () => {
    await nextTick();
    measure();
    window.addEventListener("resize", measure);
  });
  onBeforeUnmount(() => window.removeEventListener("resize", measure));

  return { height, measure };
}
