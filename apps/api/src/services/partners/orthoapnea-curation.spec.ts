import { describe, it, expect, vi } from "vitest";
import type { PartnerResourceItem } from "./types.js";

/** NEO-214: which partner videos reach the app, and under which title. Pure, no partner call. */
async function load() {
  vi.doMock("../../env.js", () => ({ ORTHOAPNEA_BASE_URL: "https://apneadock.test", ORTHOAPNEA_EMAIL: undefined, ORTHOAPNEA_PASSWORD: undefined }));
  vi.resetModules();
  return import("./orthoapnea.js");
}

function video(id: string, title: string): PartnerResourceItem {
  return {
    id, partner: "orthoapnea", kind: "video", title, description: "",
    mediaUrl: `/media/${id}`, fileType: "video", languages: [{ code: "es", mediaUrl: `/media/${id}` }],
    category: "Webinar", subcategory: null, weight: Number(id), topic: "other",
  };
}

describe("curateResources", () => {
  const list = [
    video("27", "Cómo detectar pacientes con AOS"),
    video("31", "WatchPAT: Herramienta de diagnóstico domiciliario"),
    video("55", "OrthoApnea NOA y cómo solicitarlo en Apneadock"),
    video("30", "Apneadock: plataforma de gestión de tratamientos"),
    video("52", "Colocación OrthoApnea NOA"),
  ];

  it("hides WatchPAT and the partner-platform ordering videos, so 'Pedir el dispositivo' is empty", async () => {
    const { curateResources } = await load();
    expect(curateResources(list, "mx").map((v) => v.id)).toEqual(["27", "52"]);
  });

  it("shows video 52 as 'Colocación de DAM' in Spanish, and translated in EN/PL", async () => {
    const { curateResources } = await load();
    const title = (locale: string) => curateResources(list, locale).find((v) => v.id === "52")!.title;
    expect(title("mx")).toBe("Colocación de DAM");
    expect(title("en")).toBe("Fitting the DAM");
    expect(title("pl")).toBe("Zakładanie DAM");
  });

  it("leaves every other video untouched", async () => {
    const { curateResources } = await load();
    expect(curateResources(list, "mx")[0]).toEqual(list[0]);
  });
});
