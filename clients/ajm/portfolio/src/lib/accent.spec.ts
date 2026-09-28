import { describe, expect, it } from "vitest";
import { parseAccent, plainAccent } from "./accent";
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
  ])("%s: exactly one marker per partner, and only in case titles", (_l, loc) => {
    for (const c of cases) expect((loc[c].title.match(/~[^~]+~/g) ?? []).length).toBe(1);
    const markers = all(loc).join(" ").match(/~[^~]+~/g) ?? [];
    expect(markers.length).toBe(cases.length);
  });
  it.each([
    ["es", es],
    ["en", en],
  ])("%s: no headline has more than one italic word", (_l, loc) => {
    for (const s of all(loc)) expect((s.match(/\[/g) ?? []).length).toBeLessThanOrEqual(1);
  });
});
