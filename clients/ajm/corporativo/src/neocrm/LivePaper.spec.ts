import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import LivePaper from "./LivePaper.vue";
import type { PaperOptions } from "./paper";

const paper = vi.hoisted(() => ({ started: [] as PaperOptions[], stopped: 0 }));
vi.mock("./paper", () => ({
  startPaper: (o: PaperOptions) => {
    paper.started.push(o);
    return () => {
      paper.stopped++;
    };
  },
}));

function browser(env: { reduced?: boolean; saveData?: boolean; webgl?: boolean }) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: !!env.reduced && query.includes("reduce"), addEventListener() {}, removeEventListener() {} }));
  if (env.webgl) vi.stubGlobal("WebGLRenderingContext", class {});
  Object.defineProperty(navigator, "connection", { configurable: true, value: { saveData: !!env.saveData } });
}

afterEach(() => {
  document.body.innerHTML = "";
  document.documentElement.className = "";
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "connection");
  paper.started.length = 0;
  paper.stopped = 0;
});

describe("neocrm page › living paper and the 3D parcel (CORE-215 rounds 7 to 10)", () => {
  it("a browser with WebGL gets the canvases: decoration only, nothing to focus", () => {
    browser({ webgl: true });
    const w = mount(LivePaper, { attachTo: document.body });
    expect(w.find(".paper").attributes("aria-hidden")).toBe("true");
    expect(w.findAll(".paper canvas")).toHaveLength(2);
    expect(w.findAll("a, button, input, [tabindex]")).toHaveLength(0);
    expect(w.find(".trail").exists()).toBe(false);
    expect(paper.started).toHaveLength(1);
    // the canvas draws the dots, so the page's printed grid steps back
    expect(document.documentElement.classList.contains("ncrm-live")).toBe(true);
  });
  it("without WebGL the flat object stays, and three is never asked for", () => {
    browser({ webgl: false });
    const w = mount(LivePaper, { attachTo: document.body });
    expect(w.find(".trail").exists()).toBe(true);
    expect(w.find(".paper").exists()).toBe(false);
    expect(paper.started).toHaveLength(0);
    expect(document.documentElement.classList.contains("ncrm-live")).toBe(false);
  });
  it("a data saver keeps the flat object too", () => {
    browser({ webgl: true, saveData: true });
    const w = mount(LivePaper, { attachTo: document.body });
    expect(w.find(".trail").exists()).toBe(true);
    expect(paper.started).toHaveLength(0);
  });
  it("reduced motion draws nothing that moves", () => {
    browser({ webgl: true, reduced: true });
    const w = mount(LivePaper, { attachTo: document.body });
    expect(w.find(".paper").exists()).toBe(false);
    expect(w.find(".trail").exists()).toBe(false);
    expect(paper.started).toHaveLength(0);
  });
  it("when the 3D scene cannot start after all, the flat object takes over", async () => {
    browser({ webgl: true });
    const w = mount(LivePaper, { attachTo: document.body });
    paper.started[0]?.fail();
    await w.vm.$nextTick();
    expect(w.find(".trail").exists()).toBe(true);
    expect(w.find(".paper").exists()).toBe(false);
    expect(paper.stopped).toBe(1);
    expect(document.documentElement.classList.contains("ncrm-live")).toBe(false);
  });
  it("the plane's landing is passed on, and the parcel comes in front only when asked", async () => {
    browser({ webgl: true });
    const w = mount(LivePaper, { attachTo: document.body });
    expect(w.find(".paper").classes()).not.toContain("is-over");
    paper.started[0]?.over(true);
    paper.started[0]?.land(true);
    await w.vm.$nextTick();
    expect(w.find(".paper").classes()).toContain("is-over");
    expect(w.emitted("land")).toEqual([[true]]);
  });
  it("stops drawing when the page goes away", () => {
    browser({ webgl: true });
    const w = mount(LivePaper, { attachTo: document.body });
    w.unmount();
    expect(paper.stopped).toBe(1);
    expect(document.documentElement.classList.contains("ncrm-live")).toBe(false);
  });
});
