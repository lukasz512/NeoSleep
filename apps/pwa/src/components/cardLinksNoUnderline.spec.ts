import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// CORE-118: a link inside a card never underlines on hover; the pointer
// cursor is the only hover cue. jsdom can't evaluate scoped :hover rules, so
// this guards the stylesheets of every component that renders card links.
const CARD_LINK_SOURCES = ["./EntityLink.vue", "./ItemDetailLayout.vue", "./patient/PatientDetailsTab.vue"];

function read(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

function hoverRules(css: string): string[] {
  return [...css.matchAll(/([^{}]*:hover[^{}]*)\{([^}]*)\}/g)].map((m) => `${m[1].trim()} { ${m[2].trim()} }`);
}

describe("card links (CORE-118)", () => {
  for (const rel of CARD_LINK_SOURCES) {
    it(`${rel} has no hover underline on links`, () => {
      const src = read(rel);
      const style = src.slice(src.indexOf("<style"));
      const underlined = hoverRules(style).filter((r) => /link/.test(r) && /text-decoration:\s*underline/.test(r));
      expect(underlined).toEqual([]);
    });
  }

  it("EntityLink keeps the pointer cursor", () => {
    expect(read("./EntityLink.vue")).toMatch(/\.entity-link \{[^}]*cursor: pointer;/);
  });
});
