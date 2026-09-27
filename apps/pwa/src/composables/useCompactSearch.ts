import { onBeforeUnmount, ref, watch, type Ref } from "vue";

/** Narrowest search field worth showing as a field; below this it becomes its icon (Łukasz: 400 px). */
export const MIN_SEARCH_WIDTH = 400;
/** Extra room required before a collapsed search grows back, so it can't flip on its own width. */
export const REOPEN_SLACK = 24;

export interface CompactSearchInput {
  compact: boolean;
  /** The header row's inner width. */
  row: number;
  /** The title group's width (icon + title / subtitle). It never shrinks. */
  title: number;
  /** Everything in the row besides the title and the search field: the other tools and every gap. */
  rest: number;
}

/**
 * NEO-152, desktop: the list's title and subtitle keep their full width; the
 * search field gets what is left, and turns into its icon once that is under
 * MIN_SEARCH_WIDTH — so the title can never run under the field.
 */
export function nextCompact({ compact, row, title, rest }: CompactSearchInput): boolean {
  const left = row - title - rest;
  return compact ? left < MIN_SEARCH_WIDTH + REOPEN_SLACK : left < MIN_SEARCH_WIDTH;
}

/**
 * Watches the page header row a list toolbar sits in (desktop) and says when
 * its search should collapse to an icon. `search` is the field's own element,
 * left out of the "rest" it measures.
 */
export function useCompactSearch(
  title: Ref<HTMLElement | null>,
  toolbar: Ref<HTMLElement | null>,
  search: () => HTMLElement | null,
  enabled: Ref<boolean>,
) {
  const compact = ref(false);
  let observer: ResizeObserver | null = null;

  function measure() {
    const toolbarEl = toolbar.value;
    const row = toolbarEl?.closest<HTMLElement>(".layout-page-header");
    const titleEl = title.value?.closest<HTMLElement>(".layout-page-header__title") ?? title.value;
    const searchEl = search();
    if (!enabled.value || !toolbarEl || !row || !titleEl || !searchEl) {
      compact.value = false;
      return;
    }
    const rowStyle = getComputedStyle(row);
    const inner = row.clientWidth - parseFloat(rowStyle.paddingLeft || "0") - parseFloat(rowStyle.paddingRight || "0");
    // The toolbar itself stretches to fill the row, so its own width says
    // nothing — add up the tools beside the field and the gaps they need.
    const tools = [...toolbarEl.querySelectorAll<HTMLElement>(".app-entity-list__tool")].filter((el) => el.offsetWidth > 0);
    const toolbarStyle = getComputedStyle(toolbarEl);
    const gap = parseFloat(toolbarStyle.columnGap || "0") || 0;
    const rest =
      tools.reduce((sum, el) => sum + el.getBoundingClientRect().width, 0) +
      gap * (tools.length + 1) +
      (parseFloat(rowStyle.columnGap || "0") || 0) +
      (parseFloat(toolbarStyle.marginLeft || "0") || 0);
    compact.value = nextCompact({ compact: compact.value, row: inner, title: titleEl.getBoundingClientRect().width, rest });
  }

  function observe() {
    observer?.disconnect();
    observer = null;
    const row = toolbar.value?.closest<HTMLElement>(".layout-page-header");
    if (typeof ResizeObserver !== "undefined" && enabled.value && row) {
      observer = new ResizeObserver(measure);
      observer.observe(row);
      if (title.value) observer.observe(title.value);
    }
    measure();
  }

  watch([title, toolbar, enabled], observe, { flush: "post", immediate: true });
  onBeforeUnmount(() => observer?.disconnect());

  return { compact, measure };
}
