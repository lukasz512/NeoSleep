import { describe, it, expect, vi } from "vitest";
import type { PartnerResourceItem } from "./types.js";

/** Pure mapping, no DB and no partner call (NEO-151: topics by stage + one entry per multi-language clip). */
async function load() {
  vi.doMock("../../env.js", () => ({ ORTHOAPNEA_BASE_URL: "https://apneadock.test", ORTHOAPNEA_EMAIL: undefined, ORTHOAPNEA_PASSWORD: undefined }));
  vi.resetModules();
  return import("./orthoapnea.js");
}

function video(id: string, lang: string, weight: number): PartnerResourceItem {
  return {
    id, partner: "orthoapnea", kind: "video", title: `Galga ${lang}`, description: "",
    mediaUrl: `/media/${id}`, fileType: "video", languages: [{ code: lang, mediaUrl: `/media/${id}?lang=${lang}` }],
    category: "Webinar", subcategory: null, weight, topic: "records",
  };
}

describe("mergeLanguageTwins", () => {
  const galga = [video("47", "es", 20), video("48", "en", 21), video("49", "de", 22), video("59", "es", 23)];

  it("shows the George Gauge clip once, with all three flags, under its first id", async () => {
    const { mergeLanguageTwins } = await load();
    const out = mergeLanguageTwins(galga, "mx");
    expect(out.map((v) => v.id)).toEqual(["47", "59"]);
    expect(out[0]!.languages.map((l) => l.code)).toEqual(["es", "en", "de"]);
    expect(out[0]!.weight).toBe(20);
  });

  it("opens the variant in the app's language by default (MX → Spanish, EN/PL → English)", async () => {
    const { mergeLanguageTwins } = await load();
    expect(mergeLanguageTwins(galga, "mx")[0]!.title).toBe("Galga es");
    expect(mergeLanguageTwins(galga, "en")[0]!.title).toBe("Galga en");
    expect(mergeLanguageTwins(galga, "pl")[0]!.mediaUrl).toBe("/media/48");
  });

  it("leaves the list alone when a twin is missing (e.g. deleted upstream)", async () => {
    const { mergeLanguageTwins } = await load();
    const only = [video("47", "es", 20), video("59", "es", 23)];
    expect(mergeLanguageTwins(only, "mx")).toEqual(only);
  });

  it("lists the topics in the order of a dentist's work with a patient", async () => {
    const { VIDEO_TOPICS } = await load();
    expect(VIDEO_TOPICS).toEqual(["detect", "diagnose", "records", "order", "followup", "other"]);
  });
});
