// jsdom lacks IntersectionObserver — useReveal.ts (scroll-reveal animations)
// and HomeSolutions.vue's hover-triggered animation both construct one on
// mount. Same class of stub already proven in apps/pwa/src/vitest.setup.ts.
class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
globalThis.IntersectionObserver ??= IntersectionObserverStub as unknown as typeof IntersectionObserver;
