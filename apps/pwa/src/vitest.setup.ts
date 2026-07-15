/**
 * Vitest setup: minimal window/history for node environment so vue-router and Vuetify work.
 */
if (typeof globalThis.window === "undefined") {
  const noop = () => {};
  const navigator = { maxTouchPoints: 0, userAgent: "Node", language: "en-US" };
  const win = {
    history: { replaceState: noop, pushState: noop, go: noop, back: noop, forward: noop },
    location: { pathname: "/", search: "", hash: "" },
    addEventListener: noop,
    removeEventListener: noop,
    navigator,
  };
  // Modern Node (21+) ships its own read-only `navigator` global (getter, no
  // setter) so a plain `globalThis.navigator = ...` assignment throws in
  // strict mode. The property descriptor is still configurable, so redefine
  // it via defineProperty instead of assigning to it directly.
  Object.defineProperty(globalThis, "window", { value: win, configurable: true, writable: true });
  Object.defineProperty(globalThis, "navigator", { value: navigator, configurable: true, writable: true });
  Object.defineProperty(globalThis, "location", { value: win.location, configurable: true, writable: true });
}
