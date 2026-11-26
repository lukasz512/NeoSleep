// Tracks the last pointer-down position globally so a dialog opened from any
// button, anywhere in the app, can animate in from that point without every
// trigger needing to report its own click coordinates.

const STALE_MS = 400;

let lastPointerX = 0;
let lastPointerY = 0;
let lastPointerAt = 0;
let installed = false;

function ensureTracking(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener(
    "pointerdown",
    (e) => {
      lastPointerX = e.clientX;
      lastPointerY = e.clientY;
      lastPointerAt = performance.now();
    },
    { capture: true, passive: true },
  );
}

ensureTracking();

/**
 * Resolves the screen point a dialog should visually grow from: the most
 * recent pointer-down if it happened just before the dialog opened, the
 * currently focused element's center for keyboard-triggered opens, or the
 * viewport center as a last resort (programmatic opens with no user input).
 */
export function getDialogOrigin(): [number, number] {
  if (performance.now() - lastPointerAt < STALE_MS) {
    return [lastPointerX, lastPointerY];
  }
  const active = document.activeElement;
  if (active && active !== document.body && active instanceof HTMLElement) {
    const rect = active.getBoundingClientRect();
    return [rect.left + rect.width / 2, rect.top + rect.height / 2];
  }
  return [window.innerWidth / 2, window.innerHeight / 2];
}
