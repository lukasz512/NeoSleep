import { describe, it, expect } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import { mount } from "@vue/test-utils";
import { useGlyphInset } from "./useGlyphInset";

const SVG_NS = "http://www.w3.org/2000/svg";

/** An <svg viewBox="0 0 24 24"> rendered at `size` px whose drawing starts at `glyphX` (viewBox units). */
function fakeIcon(size: number, glyphX: number, strokeWidth: number): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg") as SVGSVGElement;
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.style.strokeWidth = String(strokeWidth);
  Object.defineProperty(svg, "viewBox", { value: { baseVal: { width: 24 } } });
  svg.getBoundingClientRect = () => ({ width: size, height: size }) as DOMRect;
  (svg as unknown as { getBBox: () => DOMRect }).getBBox = () => ({ x: glyphX, y: 0, width: 24 - 2 * glyphX, height: 24 }) as DOMRect;
  return svg;
}

async function measure(el: Element | null, visible = true) {
  let result: ReturnType<typeof useGlyphInset> | undefined;
  const shown = ref(visible);
  mount(
    defineComponent({
      setup() {
        result = useGlyphInset(shown);
        return () => h("div");
      },
    }),
  );
  result!.el.value = el;
  await nextTick();
  await nextTick();
  return { inset: result!.inset, shown };
}

describe("useGlyphInset (NEO-55 — module icon glyph lands on the content edge)", () => {
  it("returns the glyph's left margin in CSS px, net of half the stroke", async () => {
    // 28px icon, path starting at x=4 with a 2-unit stroke → ink starts at 3 units → 3 × 28/24 = 3.5px.
    const { inset } = await measure(fakeIcon(28, 4, 2));
    expect(inset.value).toBeCloseTo(3.5, 5);
  });

  it("scales with the rendered icon size", async () => {
    const { inset } = await measure(fakeIcon(24, 4, 2));
    expect(inset.value).toBeCloseTo(3, 5);
  });

  it("is 0 without an icon (e.g. detail views, where the back arrow leads instead)", async () => {
    const { inset } = await measure(null);
    expect(inset.value).toBe(0);
  });

  it("never pushes an icon outward for a glyph that touches its box edge", async () => {
    const { inset } = await measure(fakeIcon(28, 0.5, 2));
    expect(inset.value).toBe(0);
  });
});
