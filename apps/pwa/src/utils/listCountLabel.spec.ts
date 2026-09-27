import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { listCountKey } from "./listCountLabel";

const load = (lang: string) =>
  JSON.parse(readFileSync(path.resolve(__dirname, `../../../../packages/i18n/${lang}.json`), "utf-8")) as Record<string, string>;

// NEO-152: the record count under a list's title.
describe("listCountKey", () => {
  it("picks Polish one / few / many forms", () => {
    expect(listCountKey(1, "pl")).toBe("app.list.count.one");
    expect(listCountKey(3, "pl")).toBe("app.list.count.few");
    expect(listCountKey(5, "pl")).toBe("app.list.count.many");
    expect(listCountKey(22, "pl")).toBe("app.list.count.few");
    expect(listCountKey(128, "pl")).toBe("app.list.count.many");
  });

  it("uses one / other for English and Mexican Spanish (mx → es-MX)", () => {
    expect(listCountKey(1, "en")).toBe("app.list.count.one");
    expect(listCountKey(8, "en")).toBe("app.list.count.other");
    expect(listCountKey(1, "mx")).toBe("app.list.count.one");
    expect(listCountKey(8, "mx")).toBe("app.list.count.other");
  });

  it("every key it can return exists in every language, with the count in it", () => {
    for (const lang of ["en", "pl", "mx"]) {
      const messages = load(lang);
      for (const category of ["one", "few", "many", "other"]) {
        expect(messages[`app.list.count.${category}`], `${lang} ${category}`).toContain("{count}");
      }
    }
    expect(load("pl")["app.list.count.many"]).toBe("{count} rekordów");
  });
});
