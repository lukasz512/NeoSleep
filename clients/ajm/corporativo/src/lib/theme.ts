/**
 * Light / dark theme (Łukasz, 2026-09-28: a switch is a must, and the change itself should be art).
 * The first visit follows the device; a choice made with the switch is remembered on this device
 * only (localStorage, per viewer, never sent anywhere). Storage can be blocked, so every access is guarded.
 */
export type Theme = "light" | "dark";

const KEY = "ajm.theme";

export function initialTheme(stored: string | null, prefersDark: boolean): Theme {
  if (stored === "light" || stored === "dark") return stored;
  return prefersDark ? "dark" : "light";
}

export function readStoredTheme(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    // benign: storage blocked (private mode / sandboxed preview) — follow the device
    return null;
  }
}

export function storeTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(KEY, theme);
  } catch {
    // benign: storage blocked — the choice lasts for this page view only
  }
}

export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

/**
 * Radius the reveal circle needs to cover the whole viewport from (x, y): the distance to the
 * farthest corner.
 */
export function revealRadius(x: number, y: number, width: number, height: number): number {
  return Math.hypot(Math.max(x, width - x), Math.max(y, height - y));
}
