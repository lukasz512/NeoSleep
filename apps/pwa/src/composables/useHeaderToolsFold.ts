import { onBeforeUnmount, ref, watch, type Ref } from "vue";

export interface FoldInput {
  folded: boolean;
  /** The title's full text width (scrollWidth). */
  natural: number;
  /** The width the title has right now (clientWidth). */
  avail: number;
  /** Toolbar width with every tool showing, and with Filter / + folded into "⋯". */
  unfoldedWidth: number;
  foldedWidth: number;
}

/**
 * NEO-113 option C: the module title keeps its full name first. Fold Filter /
 * + into "⋯" as soon as the title is cut; unfold only once it would still fit
 * with them back — the width they would take is subtracted first, so the
 * decision can never flip back and forth on the width folding itself frees.
 */
export function nextFolded({ folded, natural, avail, unfoldedWidth, foldedWidth }: FoldInput): boolean {
  if (!folded) return natural > avail + 1;
  const regained = Math.max(0, unfoldedWidth - foldedWidth);
  return natural > avail - regained + 1;
}

/**
 * Watches the header title and the list toolbar next to it (phones only) and
 * says when the toolbar should fold. Frozen while `paused` (open search hides
 * the title, whose width then means nothing).
 */
export function useHeaderToolsFold(
  title: Ref<HTMLElement | null>,
  toolbar: Ref<HTMLElement | null>,
  enabled: Ref<boolean>,
  paused: Ref<boolean>,
) {
  const folded = ref(false);
  let unfoldedWidth = 0;
  let foldedWidth = 0;
  let observer: ResizeObserver | null = null;

  function measure() {
    const titleEl = title.value;
    const toolbarEl = toolbar.value;
    if (!enabled.value || !titleEl || !toolbarEl) {
      folded.value = false;
      return;
    }
    if (paused.value) return;
    const width = toolbarEl.getBoundingClientRect().width;
    if (folded.value) foldedWidth = width;
    else unfoldedWidth = width;
    folded.value = nextFolded({
      folded: folded.value,
      natural: titleEl.scrollWidth,
      avail: titleEl.clientWidth,
      unfoldedWidth,
      foldedWidth,
    });
  }

  function observe() {
    observer?.disconnect();
    observer = null;
    if (typeof ResizeObserver !== "undefined" && enabled.value) {
      observer = new ResizeObserver(measure);
      if (title.value) observer.observe(title.value);
      if (toolbar.value) observer.observe(toolbar.value);
    }
    measure();
  }

  watch([title, toolbar, enabled, paused], observe, { flush: "post", immediate: true });
  onBeforeUnmount(() => observer?.disconnect());

  return { folded, measure };
}
