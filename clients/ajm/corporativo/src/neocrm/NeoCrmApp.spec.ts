import { afterEach, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import NeoCrmApp from "./NeoCrmApp.vue";
import { makeNeoCrmI18n } from "./i18n";
import { SECTIONS, sectionOrder } from "./lens";

function page(search = "") {
  return mount(NeoCrmApp, { props: { locale: "es", search }, global: { plugins: [makeNeoCrmI18n("es")] }, attachTo: document.body });
}

const sectionIds = (w: ReturnType<typeof page>) => w.findAll("main > section").map((s) => s.attributes("id"));

afterEach(() => {
  document.body.innerHTML = "";
  window.history.replaceState(null, "", "/");
});

describe("neocrm page › role lens (CORE-215)", () => {
  it("shows every section in the normal order without a role", () => {
    expect(sectionIds(page())).toEqual(["inicio", ...SECTIONS, "demo"]);
  });
  it("?rol=it puts security first, in the DOM itself so screen readers follow", () => {
    const w = page("?rol=it");
    expect(sectionIds(w)).toEqual(["inicio", ...sectionOrder("it"), "demo"]);
    expect(w.find('[data-role="it"]').attributes("aria-pressed")).toBe("true");
  });
  it("the switch reorders the page, announces it and keeps the rest of the link", async () => {
    window.history.replaceState(null, "", "/?para=clinica-sol");
    const w = page("?para=clinica-sol");
    await w.find('[data-role="operaciones"]').trigger("click");
    expect(sectionIds(w)[1]).toBe("product");
    expect(w.find('[data-role="operaciones"]').attributes("aria-pressed")).toBe("true");
    expect(w.find('[data-role="all"]').attributes("aria-pressed")).toBe("false");
    expect(w.find('[aria-live="polite"]').text()).toContain("operaciones");
    expect(window.location.search).toBe("?para=clinica-sol&rol=operaciones");
  });
  it("section numbers follow the order on screen", () => {
    const w = page("?rol=it");
    expect(w.find("#security .sec__num").text()).toBe("01");
  });
});

describe("neocrm page › greeting and sector", () => {
  it("greets the company named in the link, here and in the demo request", () => {
    const w = page("?para=clinica-sol");
    expect(w.find(".hero__greeting").text()).toBe("Hola, Clinica Sol:");
    expect(w.find("#demo h2").text()).toContain("Clinica Sol");
    expect(decodeURIComponent(w.find("#demo a[href^='mailto:']").attributes("href") ?? "")).toContain("somos Clinica Sol");
  });
  it("no name, no greeting", () => {
    expect(page().find(".hero__greeting").exists()).toBe(false);
  });
  it("a name can't inject markup", () => {
    const w = page("?para=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E");
    expect(w.find(".hero__greeting img").exists()).toBe(false);
  });
  it("the sector changes the headline and lists its own use case first", () => {
    const w = page("?sector=distribucion");
    expect(w.find("h1").text()).toContain("distribuidoras");
    expect(w.find("#who h3").text()).toBe("Distribuidoras y laboratorios");
    expect(w.findAll("#who h3")).toHaveLength(3);
  });
});
