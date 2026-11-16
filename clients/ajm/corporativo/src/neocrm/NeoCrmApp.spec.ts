import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

describe("neocrm page › every section is drawn, not only written", () => {
  it("each drawn screen is one labelled image, so a screen reader hears one sentence instead of its parts", () => {
    const w = page();
    for (const id of ["inicio", "product", "brand", "security", "access", "privacy"]) {
      const figures = w.findAll(`#${id} [role="img"]`);
      expect(figures, id).toHaveLength(1);
      expect(figures[0]?.attributes("aria-label"), id).toBeTruthy();
    }
  });
  it("the hero says its screen is an illustration with example companies", () => {
    expect(page().find("#inicio .shot__note").text()).toContain("ilustrativa");
  });
  it("security draws three layers around the customer data", () => {
    const w = page();
    expect(w.findAll("#security .layer")).toHaveLength(3);
    expect(w.find("#security .layers__core").text()).toBe("Vuestros clientes");
  });
  it("onboarding is a numbered path of four steps", () => {
    const w = page();
    expect(w.findAll("#onboarding .path__num").map((n) => n.text())).toEqual(["1", "2", "3", "4"]);
    expect(w.find("#onboarding h3").text()).toBe("Demo");
  });
  it("every roadmap item carries its status as a pill, apart from its title", () => {
    const w = page();
    expect(w.findAll("#roadmap .pill").map((p) => p.text())).toEqual(["en curso", "en curso", "planificado", "planificado"]);
    expect(w.find("#roadmap h3").text()).not.toContain("·");
  });
  it("the warm accent marks one element per section; in the roadmap, only what is in progress", () => {
    const w = page();
    for (const section of w.findAll("main > section")) {
      const id = section.attributes("id");
      const warm = section.findAll(".is-warm");
      if (id === "roadmap") expect(warm.every((el) => el.classes("pill--progress"))).toBe(true);
      else expect(warm.length, id).toBeLessThanOrEqual(1);
    }
    expect(w.find("#demo a[href^='mailto:']").classes()).toContain("is-warm");
  });
});

describe("neocrm look › the warm accent stays readable", () => {
  const css = readFileSync(join(__dirname, "neocrm.css"), "utf8");
  const token = (name: string) => css.match(new RegExp(`--ncrm-${name}:\\s*(#[0-9a-f]{6})`))?.[1] ?? "";
  // WCAG relative luminance of a #rrggbb color
  const luminance = (hex: string) =>
    [
      [1, 0.2126],
      [3, 0.7152],
      [5, 0.0722],
    ]
      .map(([i = 0, weight = 0]) => [parseInt(hex.slice(i, i + 2), 16) / 255, weight] as const)
      .reduce((sum, [c, weight]) => sum + weight * (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4), 0);
  const contrast = (a: string, b: string) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);

  it("text on the warm accent has at least 4.5:1 contrast", () => {
    expect(contrast(token("warm"), token("warm-ink"))).toBeGreaterThanOrEqual(4.5);
  });
  it("the warm accent is one color in both themes", () => {
    expect(css.match(/--ncrm-warm:/g)).toHaveLength(1);
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
    expect(w.find("#who h3").text()).toBe("Distribuidoras y mayoristas");
    expect(w.findAll("#who h3")).toHaveLength(4);
  });
  it("without a sector the page opens with general business, clinics come last", () => {
    const titles = page().findAll("#who h3").map((h) => h.text());
    expect(titles[0]).toBe("Equipos comerciales");
    expect(titles.at(-1)).toBe("Clínicas y centros sanitarios");
  });
});
