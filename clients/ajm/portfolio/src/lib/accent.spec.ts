import { describe, expect, it } from "vitest";
import { MARKER_VARIANTS, groupAccent, markerVariant, parseAccent, plainAccent } from "./accent";
import es from "../locales/es.json";
import en from "../locales/en.json";

describe("accent › headline markup", () => {
  it("plain text is one plain segment", () => {
    expect(parseAccent("Grandes ideas.")).toEqual([{ text: "Grandes ideas.", acc: false, mk: false }]);
  });
  it("[word] is the Bodoni italic word", () => {
    expect(parseAccent("que [conectan] a")).toEqual([
      { text: "que ", acc: false, mk: false },
      { text: "conectan", acc: true, mk: false },
      { text: " a", acc: false, mk: false },
    ]);
  });
  it("~phrase~ carries the marker and can hold the italic word", () => {
    expect(parseAccent("construida ~a través del [tiempo.]~")).toEqual([
      { text: "construida ", acc: false, mk: false },
      { text: "a través del ", acc: false, mk: true },
      { text: "tiempo.", acc: true, mk: true },
    ]);
  });
  it("a marked phrase is one group, so it draws one continuous marker", () => {
    const g = groupAccent("Dando vida a ~marcas [globales.]~");
    expect(g.map((x) => x.mk)).toEqual([false, true]);
    expect(g[1]?.parts.map((p) => p.text)).toEqual(["marcas ", "globales."]);
  });
  it("a phrase always gets the same marker stroke, within the styled range", () => {
    const v = markerVariant("Dando vida a ~marcas [globales.]~");
    expect(v).toBe(markerVariant("Dando vida a ~marcas [globales.]~"));
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(MARKER_VARIANTS);
  });
  it("plainAccent strips the markup", () => {
    expect(plainAccent("construida ~a través del [tiempo.]~")).toBe("construida a través del tiempo.");
  });
});

describe("accent › house rules in the copy", () => {
  const cases = ["universal", "planeta", "privalia", "mendel"] as const;
  const all = (o: unknown): string[] =>
    typeof o === "string" ? [o] : Array.isArray(o) ? o.flatMap(all) : o && typeof o === "object" ? Object.values(o).flatMap(all) : [];

  it.each([
    ["es", es],
    ["en", en],
  ])("%s: one marker per partner, one in the hero, one on Flawless, one on One partner (round 8), nowhere else", (_l, loc) => {
    for (const c of cases) expect((loc[c].title.match(/~[^~]+~/g) ?? []).length).toBe(1);
    expect((loc.hero.line2.match(/~[^~]+~/g) ?? []).length).toBe(1);
    expect((loc.what.title2.match(/~[^~]+~/g) ?? []).length).toBe(1);
    expect(loc.what.title1).toMatch(/\[[^\]]+\]/); // the pen writes "ideas"
    const markers = all(loc).join(" ").match(/~[^~]+~/g) ?? [];
    expect((loc.capabilities.title1.match(/~[^~]+~/g) ?? []).length).toBe(1);
    expect(markers.length).toBe(cases.length + 3);
  });
  it.each([
    ["es", es],
    ["en", en],
  ])("%s: the marker sits on the verb, apart from the pen word (M2: two beats per title)", (_l, loc) => {
    for (const c of cases) {
      const title: string = loc[c].title;
      const marked = title.match(/~([^~]+)~/)?.[1] ?? "";
      expect(marked).not.toContain("[");
      // the marker comes first in the line, the pen word closes it
      expect(title.indexOf("~")).toBeLessThan(title.indexOf("["));
    }
  });
  it.each([
    ["es", es],
    ["en", en],
  ])("%s: no headline has more than one italic word", (_l, loc) => {
    for (const s of all(loc)) expect((s.match(/\[/g) ?? []).length).toBeLessThanOrEqual(1);
  });
  it.each([
    ["es", es],
    ["en", en],
  ])("%s: headlines end without a period (Łukasz, 2026-09-29)", (_l, loc) => {
    const heads = all(loc).filter((s) => /[[~]/.test(s));
    for (const s of heads) expect(s.replace(/[\]~]+$/, "")).not.toMatch(/\.$/);
  });
});
