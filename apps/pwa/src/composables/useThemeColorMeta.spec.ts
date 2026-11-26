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

  it("takes over index.html's light + dark tags and restores both on unmount", () => {
    const staticTags = [["light", "#e0e9e8"], ["dark", "#0f1a18"]].map(([scheme, content]) => {
      const tag = document.createElement("meta");
      tag.setAttribute("name", "theme-color");
      tag.setAttribute("media", `(prefers-color-scheme: ${scheme})`);
      tag.setAttribute("content", content!);
      document.head.appendChild(tag);
      return tag;
    });

    const wrapper = mountWith(() => "#112233");
    expect(metas()).toHaveLength(2);
    expect(staticTags.map((t) => t.getAttribute("content"))).toEqual(["rgb(17, 34, 51)", "rgb(17, 34, 51)"]);
    wrapper.unmount();
    expect(metas()).toHaveLength(2);
    expect(staticTags.map((t) => t.getAttribute("content"))).toEqual(["#e0e9e8", "#0f1a18"]);
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
