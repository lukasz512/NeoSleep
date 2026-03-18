/**
 * Vitest setup: minimal window/history for node environment so vue-router and Vuetify work.
 */
if (typeof globalThis.window === "undefined") {
  const noop = () => {};
  const navigator = { maxTouchPoints: 0, userAgent: "Node" };
  const win = {
    history: { replaceState: noop, pushState: noop, go: noop, back: noop, forward: noop },
    location: { pathname: "/", search: "", hash: "" },
    addEventListener: noop,
    removeEventListener: noop,
    navigator,
  };
  (globalThis as unknown as { window: unknown }).window = win;
  (globalThis as unknown as { navigator: unknown }).navigator = navigator;
  (globalThis as unknown as { location: unknown }).location = win.location;
}
