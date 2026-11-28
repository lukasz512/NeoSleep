import { onBeforeUnmount, onMounted } from "vue";

interface SearchShortcutHandlers {
  toggle: () => void;
  open: () => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable || target.getAttribute("contenteditable") === "true";
}

/**
 * Global keys for the search palette (CORE-292): Cmd/Ctrl+K toggles from anywhere (also while typing,
 * like every command palette), "/" opens it only when focus is not in a text field.
 */
export function useSearchShortcut({ toggle, open }: SearchShortcutHandlers): void {
  function onKeydown(e: KeyboardEvent): void {
    if (e.isComposing) return;
    if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
      e.preventDefault();
      toggle();
      return;
    }
    if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !isTypingTarget(e.target)) {
      e.preventDefault();
      open();
    }
  }

  onMounted(() => document.addEventListener("keydown", onKeydown));
  onBeforeUnmount(() => document.removeEventListener("keydown", onKeydown));
}
