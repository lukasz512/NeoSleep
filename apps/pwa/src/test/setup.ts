// jsdom lacks these browser APIs — Vuetify's overlay/menu components (VMenu,
// VTooltip, VSelect) read them on mount even when the overlay is closed.
// Same stubs already proven in packages/ui/vitest.setup.ts.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

// Vuetify's VOverlay location strategy reads window.visualViewport to
// position menus/selects — absent in jsdom.
if (typeof window !== "undefined" && !window.visualViewport) {
  window.visualViewport = {
    width: window.innerWidth,
    height: window.innerHeight,
    offsetLeft: 0,
    offsetTop: 0,
    pageLeft: 0,
    pageTop: 0,
    scale: 1,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
    onresize: null,
    onscroll: null,
  } as unknown as VisualViewport;
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
