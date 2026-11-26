import { nextTick, ref, watch, type ComponentPublicInstance, type Ref, type WatchSource } from "vue";

/**
 * How far an AppIcon's visible drawing starts inside its own box, in CSS px
 * (NEO-55). Icons are drawn on a 24-unit grid with a per-glyph margin — the
 * person icon starts ~3px in at 28px, the dashboard grid ~2px — so aligning
 * the icon *box* with the content edge leaves the visible glyph 1–4px off.
 * Callers pull the icon back by this amount (negative margin) so the glyph
 * itself lands on the edge, for any icon, including tenant-supplied ones.
 *
 * Measured from the SVG geometry (getBBox, minus half the stroke), not from
 * a hand-kept table, so a new or changed icon needs no follow-up here.
 * Re-measures whenever the icon element is replaced (route → new module
 * icon) and whenever `visible` changes (a hidden SVG has no geometry).
 */
export function useGlyphInset(visible: WatchSource<boolean>) {
  const el = ref<ComponentPublicInstance | Element | null>(null);
  const inset: Ref<number> = ref(0);

  function measure() {
    const node = el.value instanceof Element ? el.value : el.value?.$el;
    if (!(node instanceof SVGSVGElement)) {
      inset.value = 0;
      return;
    }
    const width = node.getBoundingClientRect().width;
    const viewBoxWidth = node.viewBox.baseVal?.width || 24;
    if (!width) {
      inset.value = 0;
      return;
    }
    const box = node.getBBox();
    const stroke = parseFloat(getComputedStyle(node).strokeWidth) || 0;
    inset.value = Math.max(0, (box.x - stroke / 2) * (width / viewBoxWidth));
  }

  watch([el, visible], () => void nextTick(measure), { flush: "post", immediate: true });

  return { el, inset };
}
