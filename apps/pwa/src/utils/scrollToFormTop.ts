/**
 * Scrolls the nearest scrollable ancestor of `el` back to its top — call
 * this after a failed form validation so the user immediately sees the
 * invalid field(s) instead of staying wherever they'd scrolled to (e.g. the
 * bottom of a long dialog form).
 */
export function scrollToFormTop(el: Element | null | undefined) {
  let node: Element | null = el ?? null;
  while (node) {
    if (node.scrollHeight > node.clientHeight + 1) {
      node.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    node = node.parentElement;
  }
}
