// jsdom lacks these browser APIs — Vuetify's overlay/menu components (VMenu,
// VSelect, tooltips) read them on mount even when the overlay is closed.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

// jsdom's canvas 2D context isn't implemented (would need the native `canvas`
// package) and logs "not implemented" noise when read — AuthDotGridBackground
// calls getContext("2d") on mount, so stub it to return null instead.
if (typeof HTMLCanvasElement !== "undefined") {
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
}

if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList;
}
