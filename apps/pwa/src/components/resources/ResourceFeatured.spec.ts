import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import en from "@i18n/en.json";
import mx from "@i18n/mx.json";
import pl from "@i18n/pl.json";
import ResourceFeaturedList from "./ResourceFeaturedList.vue";
import { FEATURED_RESOURCES, featuredResourceHref } from "../../config/featuredResources";

function mountList(locale = "en") {
  return mount(ResourceFeaturedList, {
    global: { plugins: [createI18n({ legacy: false, locale, messages: { en, mx, pl } })] },
  });
}

describe("Featured resources (NEO-242)", () => {
  it("puts Protocolo de atención first", () => {
    expect(FEATURED_RESOURCES[0]?.id).toBe("protocolo-atencion");
    expect(mountList().findAll("a")[0]?.text()).toContain("Protocolo de atención");
  });

  it("keeps the name Protocolo de atención in every language", () => {
    for (const locale of ["en", "pl", "mx"]) {
      expect(mountList(locale).find("a").text()).toContain("Protocolo de atención");
    }
  });

  it("opens the deck PDF in a new tab", () => {
    const link = mountList().find('[data-testid="resources-featured-protocolo-atencion"]');
    expect(link.attributes("href")).toMatch(/resources\/protocolo-atencion-neosleep\.pdf$/);
    expect(link.attributes("target")).toBe("_blank");
  });

  it("ships every featured file in the public folder", () => {
    for (const item of FEATURED_RESOURCES) {
      expect(existsSync(resolve(__dirname, "../../../public", item.file))).toBe(true);
    }
  });

  it("joins the base URL with exactly one slash", () => {
    const item = FEATURED_RESOURCES[0]!;
    expect(featuredResourceHref(item, "/")).toBe("/resources/protocolo-atencion-neosleep.pdf");
    expect(featuredResourceHref(item, "/app")).toBe("/app/resources/protocolo-atencion-neosleep.pdf");
  });
});
