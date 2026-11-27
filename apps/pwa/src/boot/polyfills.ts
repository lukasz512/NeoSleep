/**
 * Runtime polyfills for older browsers still in the field (CORE-240).
 *
 * Vuetify's VOverlay location strategy calls `Array.prototype.at`, which is
 * missing on Safari/iOS < 15.4 and Chrome < 92. Vite transpiles syntax only,
 * not built-ins, so the method has to be provided at runtime. Imported first
 * in main.ts so it is in place before any library code runs.
 */

function at<T>(this: ArrayLike<T>, index: number): T | undefined {
  const length = this.length;
  const relative = Math.trunc(index) || 0;
  const k = relative >= 0 ? relative : length + relative;
  return k < 0 || k >= length ? undefined : this[k];
}

export function installArrayAtPolyfill(): void {
  if (typeof Array.prototype.at === "function") return;
  Object.defineProperty(Array.prototype, "at", {
    value: at,
    writable: true,
    enumerable: false,
    configurable: true,
  });
}

installArrayAtPolyfill();
