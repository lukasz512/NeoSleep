// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { installArrayAtPolyfill } from "./polyfills";

// CORE-240: "TypeError: $.at is not a function" in Vuetify's VOverlay
// location strategy on browsers without Array.prototype.at
// (Safari/iOS < 15.4, Chrome < 92).
const native = Object.getOwnPropertyDescriptor(Array.prototype, "at");

afterEach(() => {
  if (native) Object.defineProperty(Array.prototype, "at", native);
});

function removeNativeAt(): void {
  Reflect.deleteProperty(Array.prototype, "at");
}

// Same shape as vuetify/lib/components/VOverlay/locationStrategies.js:245.
function vuetifyFlipCheck(values: number[]): [number | undefined, number | undefined, number | undefined] {
  return [values.at(-1), values.at(-2), values.at(-3)];
}

describe("installArrayAtPolyfill", () => {
  it("reproduces the crash when Array.prototype.at is missing", () => {
    removeNativeAt();
    expect(() => vuetifyFlipCheck([1, 2, 3])).toThrow(TypeError);
  });

  it("makes the Vuetify flip check work again on an old browser", () => {
    removeNativeAt();
    installArrayAtPolyfill();
    expect(vuetifyFlipCheck([1, 2, 3])).toEqual([3, 2, 1]);
  });

  it("follows the spec for positive, negative, fractional and out-of-range indices", () => {
    removeNativeAt();
    installArrayAtPolyfill();
    const a = ["a", "b", "c"];
    expect(a.at(0)).toBe("a");
    expect(a.at(2)).toBe("c");
    expect(a.at(-1)).toBe("c");
    expect(a.at(-3)).toBe("a");
    expect(a.at(1.7)).toBe("b");
    expect(a.at(3)).toBeUndefined();
    expect(a.at(-4)).toBeUndefined();
    expect([].at(-1)).toBeUndefined();
  });

  it("installs a non-enumerable method so for-in loops stay clean", () => {
    removeNativeAt();
    installArrayAtPolyfill();
    expect(Object.getOwnPropertyDescriptor(Array.prototype, "at")?.enumerable).toBe(false);
  });

  it("leaves a native implementation untouched", () => {
    const before = Array.prototype.at;
    installArrayAtPolyfill();
    expect(Array.prototype.at).toBe(before);
  });

  it("is imported first in main.ts, before any library code runs", () => {
    const main = readFileSync(new URL("../main.ts", import.meta.url), "utf8");
    const firstImport = main.split("\n").find((l) => l.startsWith("import "));
    expect(firstImport).toBe('import "./boot/polyfills";');
  });
});
