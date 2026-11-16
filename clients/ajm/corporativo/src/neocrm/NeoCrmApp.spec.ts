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
    window.history.replaceState(null, "", "/?para=talleres-rivas");
    const w = page("?para=talleres-rivas");
    await w.find('[data-role="operaciones"]').trigger("click");
    expect(sectionIds(w)[1]).toBe("product");
    expect(w.find('[data-role="operaciones"]').attributes("aria-pressed")).toBe("true");
    expect(w.find('[data-role="all"]').attributes("aria-pressed")).toBe("false");
    expect(w.find(".lens__note").text()).toContain("operaciones");
    expect(window.location.search).toBe("?para=talleres-rivas&rol=operaciones");
  });
  it("section numbers follow the order on screen", () => {
    const w = page("?rol=it");
    expect(w.find("#security .sec__num").text()).toBe("01");
  });
});

describe("neocrm page › every section is drawn, not only written", () => {
  // the drawings can be tried since round 3, so each is a labelled group of real buttons, no longer one image
  it("each drawn screen is one labelled group with at least one real button inside", () => {
    const w = page();
    for (const id of ["inicio", "product", "brand", "security", "access", "privacy"]) {
      const figures = w.findAll(`#${id} [data-fig]`);
      expect(figures, id).toHaveLength(1);
      expect(figures[0]?.attributes("role"), id).toBe("group");
      expect(figures[0]?.attributes("aria-label"), id).toBeTruthy();
      expect(figures[0]?.findAll("button").length, id).toBeGreaterThan(0);
    }
    expect(w.find('[role="img"]').exists()).toBe(false);
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
    // the number sits inside the step's button since the steps can be picked
    expect(w.find("#onboarding h3").text()).toBe("1 Demo");
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

describe("neocrm page › every section can be tried, each in its own way", () => {
  it("hero: picking a visit shows its next step", async () => {
    const w = page();
    expect(w.find("#inicio .toast").text()).toContain("Talleres Rivas");
    await w.findAll("#inicio .visit")[2]?.trigger("click");
    expect(w.find("#inicio .toast").text()).toContain("Bodegas Lera");
    expect(w.findAll("#inicio .visit").map((v) => v.attributes("aria-pressed"))).toEqual(["false", "false", "true"]);
  });
  it("who: picking a sector adjusts the headline and the link; picking it again goes back", async () => {
    const w = page();
    await w.find('[data-sector="distribucion"]').trigger("click");
    expect(w.find("h1").text()).toContain("distribuidoras");
    expect(window.location.search).toBe("?sector=distribucion");
    expect(w.find("#who .sec__note").text()).toContain("Distribuidoras y mayoristas");
    // no card moves under the reader's finger
    expect(w.find("#who h3").text()).toBe("Equipos comerciales");
    await w.find('[data-sector="distribucion"]').trigger("click");
    expect(window.location.search).toBe("");
    expect(w.find('[data-sector="distribucion"]').attributes("aria-pressed")).toBe("false");
  });
  it("product: the report is saved with the next step picked", async () => {
    const w = page();
    expect(w.find("#product .card__saved").text()).toBe("");
    await w.findAll("#product .chip")[2]?.trigger("click");
    await w.find("#product .card__btn").trigger("click");
    expect(w.find("#product .card__saved").text()).toBe("Informe guardado. Próximo paso: Segunda visita.");
    // changing the step means it is not saved any more
    await w.findAll("#product .chip")[0]?.trigger("click");
    expect(w.find("#product .card__saved").text()).toBe("");
  });
  it("brand: the same screen takes the brand and the language picked", async () => {
    const w = page();
    expect(w.find("#brand .brand__hello").text()).toBe("Buenos días, Marta");
    await w.find('#brand [data-brand="1"]').trigger("click");
    await w.find('#brand [data-lang="2"]').trigger("click");
    expect(w.find("#brand .brand__head").text()).toBe("Bodegas Lera");
    expect(w.find("#brand .brand__hello").text()).toBe("Dzień dobry, Marta");
    expect(w.find("#brand .brand__btn").text()).toBe("Nowa wizyta");
  });
  it("security: pressing a layer explains that layer", async () => {
    const w = page();
    const detail = () => w.find("#security .layers__detail").text();
    const first = detail();
    await w.findAll("#security .layer__label")[2]?.trigger("click");
    expect(detail()).not.toBe(first);
    expect(detail()).toBe(makeNeoCrmI18n("es").global.t("sections.security.items.2.body"));
    expect(w.findAll("#security .layer--on")).toHaveLength(1);
  });
  it("access: the example screen changes theme and can hide its measures", async () => {
    const w = page();
    expect(w.find("#access .tone").classes()).toContain("ncrm-tone-light");
    await w.find('#access [data-tone="dark"]').trigger("click");
    expect(w.find("#access .tone").classes()).toContain("ncrm-tone-dark");
    expect(w.find("#access .tone__measure").text()).toBe("44 px");
    await w.find('#access [role="switch"]').trigger("click");
    expect(w.find('#access [role="switch"]').attributes("aria-checked")).toBe("false");
    expect(w.find("#access .tone__measure").exists()).toBe(false);
  });
  it("privacy: the consent record opens its access log", async () => {
    const w = page();
    const link = w.find("#privacy .card__link");
    expect(link.attributes("aria-expanded")).toBe("false");
    expect(w.find("#consent-log").isVisible()).toBe(false);
    await link.trigger("click");
    expect(link.attributes("aria-expanded")).toBe("true");
    expect(w.find("#consent-log").isVisible()).toBe(true);
    expect(w.findAll("#consent-log li")).toHaveLength(2);
  });
  it("onboarding: one step is explained at a time", async () => {
    const w = page();
    const t = makeNeoCrmI18n("es").global.t;
    expect(w.find("#onboarding .steps__detail").text()).toBe(t("sections.onboarding.items.0.body"));
    await w.findAll("#onboarding .path__btn")[2]?.trigger("click");
    expect(w.find("#onboarding .steps__detail").text()).toBe(t("sections.onboarding.items.2.body"));
    expect(w.findAll("#onboarding .path__btn").map((b) => b.attributes("aria-current"))).toEqual([undefined, undefined, "step", undefined]);
  });
  it("roadmap: the filter leaves only the status picked", async () => {
    const w = page();
    const visible = () => w.findAll("#roadmap .item").filter((i) => i.isVisible());
    expect(visible()).toHaveLength(4);
    await w.find('#roadmap [data-filter="planned"]').trigger("click");
    expect(visible().map((i) => i.find(".pill").text())).toEqual(["planificado", "planificado"]);
    await w.find('#roadmap [data-filter="all"]').trigger("click");
    expect(visible()).toHaveLength(4);
  });
  it("faq: one answer is open at a time", async () => {
    const w = page();
    const open = () => w.findAll("#faq .faq__q").map((q) => q.attributes("aria-expanded"));
    expect(open().filter((v) => v === "true")).toHaveLength(1);
    expect(open()[0]).toBe("true");
    await w.findAll("#faq .faq__q")[1]?.trigger("click");
    expect(open().slice(0, 2)).toEqual(["false", "true"]);
    expect(w.find("#faq-0").isVisible()).toBe(false);
    expect(w.find("#faq-1").isVisible()).toBe(true);
    await w.findAll("#faq .faq__q")[1]?.trigger("click");
    expect(open().filter((v) => v === "true")).toHaveLength(0);
  });
  it("every control is a real button", () => {
    const w = page();
    for (const el of w.findAll("[aria-pressed], [aria-expanded], [role='switch'], [aria-current]")) expect(el.element.tagName).toBe("BUTTON");
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
    const w = page("?para=talleres-rivas");
    expect(w.find(".hero__greeting").text()).toBe("Hola, Talleres Rivas:");
    expect(w.find("#demo h2").text()).toContain("Talleres Rivas");
    expect(decodeURIComponent(w.find("#demo a[href^='mailto:']").attributes("href") ?? "")).toContain("somos Talleres Rivas");
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
  it("without a sector the page lists four general kinds of business", () => {
    const titles = page().findAll("#who h3").map((h) => h.text());
    expect(titles).toEqual(["Equipos comerciales", "Distribuidoras y mayoristas", "Empresas de servicios", "Tiendas y negocios locales"]);
  });
  it("the hero's second button leads to what the CRM includes", () => {
    expect(page().find("#inicio .btn--quiet").attributes("href")).toBe("#product");
  });
});
