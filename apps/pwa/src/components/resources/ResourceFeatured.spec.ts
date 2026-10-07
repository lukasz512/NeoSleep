import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import en from "@i18n/en.json";
import mx from "@i18n/mx.json";
import pl from "@i18n/pl.json";
import {
  FEATURED_RESOURCES,
  featuredResourceHref,
  featuredCoverHref,
  isNewEdition,
  type FeaturedResource,
} from "../../config/featuredResources";
import { isServedAsFile } from "../../config/pwaFiles";

/** The app's own PDFs on Resources: cards like the webinar cards, with opened state per user. */
const markOpened = vi.fn(async () => undefined);
const markNotOpened = vi.fn(async () => undefined);
const opened: Record<string, { completedAt: string | null }> = {};
vi.mock("../../composables/useFeaturedProgress", async () => {
  const { reactive } = await import("vue");
  const state = reactive(opened);
  return { useFeaturedProgress: () => ({ opened: state, load: vi.fn(), markOpened, markNotOpened }) };
});

const { default: ResourceDocumentTile } = await import("./ResourceDocumentTile.vue");

const mounted: VueWrapper[] = [];
beforeEach(() => {
  for (const k of Object.keys(opened)) delete opened[k];
  markOpened.mockClear();
  markNotOpened.mockClear();
});
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

function item(id: string): FeaturedResource {
  return FEATURED_RESOURCES.find((r) => r.id === id)!;
}

function mountTile(id: string, { locale = "mx", now = new Date("2026-10-10T12:00:00Z"), layout = "card" as "card" | "row" } = {}) {
  const w = mount(ResourceDocumentTile, {
    props: { item: item(id), now, layout },
    global: {
      plugins: [
        createI18n({ legacy: false, locale, messages: { en, mx, pl } }),
        createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives }),
      ],
    },
    attachTo: document.body,
  });
  mounted.push(w);
  return w;
}

describe("Featured resources config", () => {
  it("puts Protocolo de atención first, the user guide second", () => {
    expect(FEATURED_RESOURCES.map((r) => r.id)).toEqual(["protocolo-atencion", "guia-uso"]);
  });

  it("carries a cover, a slide count and a language per document", () => {
    expect(FEATURED_RESOURCES.map((r) => r.slides)).toEqual([24, 25]);
    for (const r of FEATURED_RESOURCES) {
      expect(r.cover).toMatch(/^files\/.+\.cover\.jpg$/);
      expect(r.language).toBe("es");
    }
    expect(item("guia-uso").editionDate).toBe("2026-10-07");
    expect(item("protocolo-atencion").editionDate).toBeUndefined();
  });

  it("ships every featured file and cover in the public folder", () => {
    for (const r of FEATURED_RESOURCES) {
      expect(existsSync(resolve(__dirname, "../../../public", r.file))).toBe(true);
      expect(existsSync(resolve(__dirname, "../../../public", r.cover))).toBe(true);
    }
  });

  it("keeps every featured file and cover out of the service worker's index.html fallback", () => {
    for (const r of FEATURED_RESOURCES) {
      expect(isServedAsFile(featuredResourceHref(r, "/"))).toBe(true);
      expect(isServedAsFile(featuredCoverHref(r, "/"))).toBe(true);
    }
    expect(isServedAsFile("/resources")).toBe(false);
  });

  it("has no public/ folder named like an app route (the server would 403 that route on reload)", () => {
    const routes = readFileSync(resolve(__dirname, "../../router/routes.ts"), "utf8");
    const firstSegments = new Set([...routes.matchAll(/path: "\/([a-z0-9-]+)/g)].map((m) => m[1]));
    const publicDir = resolve(__dirname, "../../../public");
    const folders = readdirSync(publicDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
    expect(folders.filter((f) => firstSegments.has(f))).toEqual([]);
  });

  it("joins the base URL with exactly one slash", () => {
    const r = FEATURED_RESOURCES[0]!;
    expect(featuredResourceHref(r, "/")).toBe("/files/protocolo-atencion-neosleep.pdf");
    expect(featuredResourceHref(r, "/app")).toBe("/app/files/protocolo-atencion-neosleep.pdf");
    expect(featuredCoverHref(r, "/app")).toBe("/app/files/protocolo-atencion-neosleep.cover.jpg");
  });

  it("is new for 30 days after the edition date, never before it, never without one", () => {
    const edition = "2026-10-07";
    expect(isNewEdition(edition, new Date("2026-10-06T12:00:00Z"))).toBe(false);
    expect(isNewEdition(edition, new Date("2026-10-07T00:00:00Z"))).toBe(true);
    expect(isNewEdition(edition, new Date("2026-11-06T00:00:00Z"))).toBe(true);
    expect(isNewEdition(edition, new Date("2026-11-07T00:00:01Z"))).toBe(false);
    expect(isNewEdition(undefined, new Date("2026-10-10T00:00:00Z"))).toBe(false);
  });
});

describe("ResourceDocumentTile", () => {
  it("has the anatomy of a webinar card: cover, state badge, slide count, title, language", () => {
    const w = mountTile("guia-uso");
    expect(w.get("img").attributes("src")).toMatch(/files\/guia-uso-neosleep\.cover\.jpg$/);
    expect(w.get('[data-testid="document-status"]').text()).toBe("Sin abrir");
    expect(w.get('[data-testid="document-slides"]').text()).toBe("25 diap.");
    expect(w.get(".video-card__title").text()).toBe("Guía de uso");
    expect(w.get(".video-card__lang").text()).toContain("ES");
    expect(w.classes()).toContain("video-card");
  });

  it("shows the Nuevo badge within 30 days of the edition and not after; the protocol never has it", () => {
    expect(mountTile("guia-uso").find('[data-testid="document-new"]').text()).toBe("Nuevo");
    expect(mountTile("guia-uso", { now: new Date("2026-12-01T00:00:00Z") }).find('[data-testid="document-new"]').exists()).toBe(false);
    expect(mountTile("protocolo-atencion").find('[data-testid="document-new"]').exists()).toBe(false);
  });

  it("says the edition date while not opened, the opened date once opened", () => {
    expect(mountTile("guia-uso").get(".video-card__author").text()).toBe("Edición 7 oct 2026");
    opened["guia-uso"] = { completedAt: "2026-10-03T09:00:00Z" };
    const w = mountTile("guia-uso");
    expect(w.get('[data-testid="document-status"]').text()).toBe("✓ Abierto");
    expect(w.get('[data-testid="document-status-line"]').text()).toBe("Abierto el 3 oct");
  });

  it("never says where a file comes from", () => {
    for (const locale of ["en", "mx", "pl"]) {
      for (const r of FEATURED_RESOURCES) expect(mountTile(r.id, { locale }).text()).not.toMatch(/neosleep|orthoapnea/i);
    }
  });

  it("opens the PDF in a new tab and records it as opened", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const w = mountTile("guia-uso");
    await w.trigger("click");
    expect(open).toHaveBeenCalledWith(expect.stringMatching(/files\/guia-uso-neosleep\.pdf$/), "_blank", "noopener");
    expect(markOpened).toHaveBeenCalledWith("guia-uso");
  });

  it("opens with Enter too", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    await mountTile("protocolo-atencion").trigger("keydown", { key: "Enter" });
    expect(open).toHaveBeenCalledTimes(1);
    expect(markOpened).toHaveBeenCalledWith("protocolo-atencion");
  });

  it("the card menu marks as opened when not, as not opened when opened, without opening the file", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const w = mountTile("guia-uso");
    await w.get('[data-testid="document-menu"]').trigger("click");
    const item1 = document.body.querySelector('[data-testid="document-mark-opened"]') as HTMLElement;
    expect(item1.textContent).toContain("Marcar como abierto");
    item1.click();
    expect(markOpened).toHaveBeenCalledWith("guia-uso");
    expect(open).not.toHaveBeenCalled();
  });

  it("the menu offers 'not opened' for an opened document", async () => {
    opened["guia-uso"] = { completedAt: "2026-10-03T09:00:00Z" };
    const w = mountTile("guia-uso");
    await w.get('[data-testid="document-menu"]').trigger("click");
    const entry = document.body.querySelector('[data-testid="document-mark-not-opened"]') as HTMLElement;
    expect(entry.textContent).toContain("Marcar como no abierto");
    entry.click();
    expect(markNotOpened).toHaveBeenCalledWith("guia-uso");
  });

  it("lies flat as a list row when asked", () => {
    expect(mountTile("guia-uso", { layout: "row" }).classes()).toContain("video-card--row");
  });
});
