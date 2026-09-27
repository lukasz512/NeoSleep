import { describe, it, expect, afterEach } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { useThemeColorMeta } from "./useThemeColorMeta";

const metas = () => [...document.head.querySelectorAll('meta[name="theme-color"]')];

function mountWith(color: () => string) {
  return mount(defineComponent({ setup: () => { useThemeColorMeta(color); return () => h("div"); } }));
}

// jsdom has no canvas, so the resolved value falls back to the computed CSS
// string — rgb(...) for a plain hex — which is what these assertions read.
describe("useThemeColorMeta (NEO-131)", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("data-theme");
    metas().forEach((m) => m.remove());
  });

  it("adds one theme-color tag on mount and removes it on unmount", () => {
    const wrapper = mountWith(() => "#112233");
    expect(metas()).toHaveLength(1);
    expect(metas()[0]!.getAttribute("content")).toBe("rgb(17, 34, 51)");
    wrapper.unmount();
    expect(metas()).toHaveLength(0);
  });

  it("takes over an existing tag (vite-plugin-pwa's) and restores it on unmount", () => {
    const pluginTag = document.createElement("meta");
    pluginTag.setAttribute("name", "theme-color");
    pluginTag.setAttribute("content", "#128F83");
    document.head.appendChild(pluginTag);

    const wrapper = mountWith(() => "#112233");
    expect(metas()).toHaveLength(1);
    expect(pluginTag.getAttribute("content")).toBe("rgb(17, 34, 51)");
    wrapper.unmount();
    expect(metas()).toHaveLength(1);
    expect(pluginTag.getAttribute("content")).toBe("#128F83");
  });

  it("re-resolves the color when the theme on <html> changes", async () => {
    const colors = { light: "#eeeeee", dark: "#111111" };
    mountWith(() => colors[document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light"]);
    expect(metas()[0]!.getAttribute("content")).toBe("rgb(238, 238, 238)");

    document.documentElement.setAttribute("data-theme", "dark");
    await nextTick(); // MutationObserver callbacks run as a microtask
    expect(metas()[0]!.getAttribute("content")).toBe("rgb(17, 17, 17)");
  });
});
