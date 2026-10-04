import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import en from "@i18n/en.json";
import mx from "@i18n/mx.json";
import pl from "@i18n/pl.json";
import ResourceFeaturedList from "./ResourceFeaturedList.vue";
import { FEATURED_RESOURCES, featuredResourceHref } from "../../config/featuredResources";
import { isServedAsFile } from "../../config/pwaFiles";

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

  it("keeps every featured file out of the service worker's index.html fallback", () => {
    for (const item of FEATURED_RESOURCES) expect(isServedAsFile(featuredResourceHref(item, "/"))).toBe(true);
    expect(isServedAsFile("/resources")).toBe(false);
  });

  it("caps the card width on desktop, full width on phones", () => {
    const css = readFileSync(resolve(__dirname, "ResourceFeaturedList.vue"), "utf8");
    expect(css).toMatch(/@media \(min-width: 600px\)\s*{\s*\.resource-featured\s*{\s*max-width: \d+px;/);
  });

  it("joins the base URL with exactly one slash", () => {
    const item = FEATURED_RESOURCES[0]!;
    expect(featuredResourceHref(item, "/")).toBe("/resources/protocolo-atencion-neosleep.pdf");
    expect(featuredResourceHref(item, "/app")).toBe("/app/resources/protocolo-atencion-neosleep.pdf");
  });
});
