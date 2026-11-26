import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import en from "@i18n/en.json";
import TmjSkull from "./TmjSkull.vue";

/** NEO-237: the sketch skull — each side's colour grows with its number of findings (0–5). */
const mountSkull = (props: Record<string, unknown>) =>
  mount(TmjSkull, { props, global: { plugins: [createI18n({ legacy: false, locale: "en", messages: { en } })] } });

const level = (wrapper: ReturnType<typeof mountSkull>, side: string) => wrapper.find(`[data-joint='${side}']`);

describe("TmjSkull", () => {
  it("intensity follows the number of findings per side (0–5)", () => {
    const wrapper = mountSkull({ counts: { right: 3, left: 1 } });
    expect(level(wrapper, "right").attributes("data-level")).toBe("3");
    expect(level(wrapper, "right").attributes("style")).toContain("--n: 3");
    expect(level(wrapper, "left").attributes("data-level")).toBe("1");
    expect(level(wrapper, "right").classes()).toContain("tmj-skull__joint--on");
  });

  it("no findings: nothing lit, caption says so", () => {
    const wrapper = mountSkull({ counts: { right: 0, left: 0 } });
    expect(wrapper.findAll(".tmj-skull__joint--on")).toHaveLength(0);
    expect(wrapper.text()).toContain("No findings marked");
  });

  it("the caption names the count per side; more than 5 never goes past full colour", () => {
    const wrapper = mountSkull({ counts: { right: 7, left: 2 } });
    expect(level(wrapper, "right").attributes("data-level")).toBe("5");
    expect(wrapper.text()).toContain("Right 5 · Left 2");
  });

  it("mini: no caption and no glass panel, still lit per side", () => {
    const wrapper = mountSkull({ counts: { right: 2, left: 0 }, mini: true });
    expect(wrapper.find("figcaption").exists()).toBe(false);
    expect(wrapper.classes()).toContain("tmj-skull--mini");
    expect(level(wrapper, "right").attributes("data-level")).toBe("2");
  });

  it("is a sketch: hatched hollows and construction lines, in ink by default", () => {
    const wrapper = mountSkull({ counts: { right: 0, left: 0 } });
    expect(wrapper.find(".tmj-skull__grid").exists()).toBe(true);
    expect(wrapper.findAll("[data-hatch]").length).toBeGreaterThan(0);
    expect(wrapper.find("svg").classes()).toContain("tmj-skull__svg--ink");
  });
});
