import { describe, it, expect, afterEach, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import { createPinia } from "pinia";
import en from "@i18n/en.json";
import ResourceVideoTile from "./ResourceVideoTile.vue";
import ResourceVideoSheet from "./ResourceVideoSheet.vue";
import { formatDuration } from "./videoFormat";
import type { PartnerResourceItem } from "../../composables/usePartnerResources";

const mountedWrappers: VueWrapper[] = [];
afterEach(() => {
  for (const w of mountedWrappers.splice(0)) w.unmount();
  document.body.innerHTML = "";
  vi.useRealTimers();
});

function video(overrides: Partial<PartnerResourceItem> = {}): PartnerResourceItem {
  return {
    id: "27",
    partner: "orthoapnea",
    kind: "video",
    title: "Cómo detectar pacientes con AOS en la clínica dental",
    description: "Dr. Eduardo Vázquez",
    mediaUrl: "https://api.test/media/27?locale=mx&t=tok",
    fileType: "video",
    languages: [
      { code: "es", mediaUrl: "https://api.test/media/27?lang=Es&t=tok" },
      { code: "en", mediaUrl: "https://api.test/media/27?lang=En&t=tok" },
    ],
    category: "Webinar",
    subcategory: null,
    weight: 1,
    posterUrl: "https://api.test/poster/27?t=tok",
    durationSec: 2919,
    ...overrides,
  };
}

function plugins() {
  return [
    createI18n({ legacy: false, locale: "en", messages: { en } }),
    createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives }),
    createPinia(),
  ];
}

describe("formatDuration", () => {
  it("formats like a video player", () => {
    expect(formatDuration(2652)).toBe("44:12");
    expect(formatDuration(4361)).toBe("1:12:41");
    expect(formatDuration(59)).toBe("0:59");
  });
});

describe("ResourceVideoTile", () => {
  function mountTile(v = video()) {
    const w = mount(ResourceVideoTile, { props: { video: v, index: 0 }, global: { plugins: plugins() } });
    mountedWrappers.push(w);
    return w;
  }

  it("shows the poster, title, length and one flag per language — no player", () => {
    const w = mountTile();
    expect(w.get("img").attributes("src")).toBe("https://api.test/poster/27?t=tok");
    expect(w.text()).toContain("Cómo detectar pacientes");
    expect(w.text()).toContain("48:39");
    expect(w.findAll(".video-tile__lang").map((l) => l.text())).toEqual(["ES", "EN"]);
    expect(w.find("video").exists()).toBe(false);
  });

  it("shimmers until the poster loads, then fades it in", async () => {
    const w = mountTile();
    const poster = w.get(".video-tile__poster");
    expect(poster.attributes("data-state")).toBe("loading");
    await w.get("img").trigger("load");
    expect(poster.attributes("data-state")).toBe("ready");
  });

  it("falls back to the cover when the poster fails or doesn't exist", async () => {
    const w = mountTile();
    await w.get("img").trigger("error");
    expect(w.find("img").exists()).toBe(false);
    expect(w.get(".video-tile__poster").attributes("data-state")).toBe("error");

    const none = mountTile(video({ posterUrl: null, durationSec: null }));
    expect(none.find("img").exists()).toBe(false);
    expect(none.find(".video-tile__duration").exists()).toBe(false);
  });

  it("opens on click and on Enter", async () => {
    const w = mountTile();
    await w.trigger("click");
    await w.trigger("keydown", { key: "Enter" });
    expect(w.emitted("open")).toHaveLength(2);
    expect(w.attributes("aria-label")).toBe("Play Cómo detectar pacientes con AOS en la clínica dental");
  });
});

describe("ResourceVideoSheet", () => {
  function mountSheet(v: PartnerResourceItem | null = video()) {
    const w = mount(ResourceVideoSheet, { props: { video: v }, global: { plugins: plugins() }, attachTo: document.body });
    mountedWrappers.push(w);
    return w;
  }
  const $ = (sel: string) => document.body.querySelector(sel);

  it("renders nothing while no video is open", () => {
    mountSheet(null);
    expect($("[data-testid=resource-video-sheet]")).toBeNull();
  });

  it("plays the default-language file and says honestly that it's loading", async () => {
    vi.useFakeTimers();
    mountSheet();
    await nextTick();
    const player = $("video") as HTMLVideoElement;
    expect(player.getAttribute("src")).toBe("https://api.test/media/27?locale=mx&t=tok");

    player.dispatchEvent(new Event("loadstart"));
    await nextTick();
    expect($("[data-testid=resource-video-loading]")?.textContent).toContain("Webinars are large files");

    vi.advanceTimersByTime(26_000);
    await nextTick();
    const loading = $("[data-testid=resource-video-loading]")?.textContent ?? "";
    expect(loading).toContain("Still loading");
    expect(loading).toContain("26 s");
  });

  it("hides the overlay once a frame can play", async () => {
    mountSheet();
    await nextTick();
    const player = $("video") as HTMLVideoElement;
    player.dispatchEvent(new Event("loadstart"));
    player.dispatchEvent(new Event("canplay"));
    await nextTick();
    expect($("[data-testid=resource-video-loading]")).toBeNull();
    expect($(".video-sheet__stage")?.getAttribute("data-state")).toBe("playing");
  });

  it("shows an error with Try again, which reloads the player", async () => {
    mountSheet();
    await nextTick();
    const player = $("video") as HTMLVideoElement;
    const load = vi.spyOn(player, "load").mockImplementation(() => undefined);
    player.dispatchEvent(new Event("error"));
    await nextTick();
    const error = $("[data-testid=resource-video-error]");
    expect(error?.textContent).toContain("The video didn't load");

    (error?.querySelector("button") as HTMLButtonElement).click();
    await nextTick();
    expect(load).toHaveBeenCalled();
    expect($("[data-testid=resource-video-error]")).toBeNull();
  });

  it("switches language by swapping the file", async () => {
    mountSheet();
    await nextTick();
    const buttons = [...document.body.querySelectorAll<HTMLButtonElement>(".video-sheet__lang")];
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(["ES", "EN"]);
    buttons[1]!.click();
    await nextTick();
    expect(($("video") as HTMLVideoElement).getAttribute("src")).toBe("https://api.test/media/27?lang=En&t=tok");
    expect(buttons[1]!.getAttribute("aria-pressed")).toBe("true");
  });

  it("emits close from the X", async () => {
    const w = mountSheet();
    await nextTick();
    ($("[data-testid=resource-video-close]") as HTMLButtonElement).click();
    expect(w.emitted("close")).toHaveLength(1);
  });
});
