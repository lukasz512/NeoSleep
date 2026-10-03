import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import { createPinia } from "pinia";
import en from "@i18n/en.json";
import type { PartnerResourceItem } from "../../composables/usePartnerResources";

/** NEO-209: watch status on the tile, and resume + saving in the player. */
const reportPosition = vi.fn(async () => undefined);
const markStatus = vi.fn(async () => undefined);
const progress: Record<string, unknown> = {};
vi.mock("../../composables/useResourceProgress", async (orig) => {
  const actual = await orig<typeof import("../../composables/useResourceProgress")>();
  const { reactive } = await import("vue");
  const state = reactive(progress);
  return {
    ...actual,
    useResourceProgress: () => ({ progress: state, reportPosition, markStatus, load: vi.fn() }),
  };
});

const { default: ResourceVideoTile } = await import("./ResourceVideoTile.vue");
const { default: ResourceVideoSheet } = await import("./ResourceVideoSheet.vue");

const mounted: VueWrapper[] = [];
beforeEach(() => {
  for (const k of Object.keys(progress)) delete progress[k];
  reportPosition.mockClear();
  markStatus.mockClear();
});
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount();
  document.body.innerHTML = "";
  vi.useRealTimers();
});

function video(): PartnerResourceItem {
  return {
    id: "47",
    partner: "orthoapnea",
    kind: "video",
    title: "Cómo hacer un pedido OrthoApnea",
    description: "OrthoApnea",
    mediaUrl: "https://api.test/media/47?t=tok",
    fileType: "video",
    languages: [{ code: "es", mediaUrl: "https://api.test/media/47?t=tok" }],
    category: "Webinar",
    subcategory: null,
    weight: 1,
    posterUrl: null,
    durationSec: 665,
  };
}
function saved(status: string, positionSec: number, percent: number) {
  progress["47"] = { resourceId: "47", status, source: "watched", positionSec, durationSec: 665, percent, completedAt: null, updatedAt: "" };
}
const plugins = () => [
  createI18n({ legacy: false, locale: "en", messages: { en } }),
  createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives }),
  createPinia(),
];

describe("ResourceVideoTile status", () => {
  function tile() {
    const w = mount(ResourceVideoTile, { props: { video: video() }, global: { plugins: plugins() }, attachTo: document.body });
    mounted.push(w);
    return w;
  }

  it("not started: 'Not watched' badge, no bar", () => {
    const w = tile();
    expect(w.get("[data-testid=video-status]").text()).toBe("Not watched");
    expect(w.find(".video-card__progress").exists()).toBe(false);
  });

  it("in progress: percent badge, 'Continue from' line and a bar of that width", async () => {
    saved("in_progress", 252, 38);
    const w = tile();
    await nextTick();
    expect(w.get("[data-testid=video-status]").text()).toBe("In progress · 38%");
    expect(w.text()).toContain("Continue from 4:12");
    expect(w.get(".video-card__progress i").attributes("style")).toContain("width: 38%");
  });

  it("completed: 'Watched' badge and the tile dims", async () => {
    saved("completed", 600, 100);
    const w = tile();
    await nextTick();
    expect(w.get("[data-testid=video-status]").text()).toBe("✓ Watched");
    expect(w.classes()).toContain("video-card--done");
  });

  it("the tile menu marks watched / not watched without opening the video", async () => {
    const w = tile();
    await w.get("[data-testid=video-menu]").trigger("click");
    await nextTick();
    (document.body.querySelector("[data-testid=video-mark-completed]") as HTMLElement).click();
    expect(markStatus).toHaveBeenCalledWith("47", "completed");
    expect(w.emitted("open")).toBeUndefined();
  });
});

describe("ResourceVideoSheet resume (D1: ask first)", () => {
  function sheet() {
    const w = mount(ResourceVideoSheet, { props: { video: video() }, global: { plugins: plugins() }, attachTo: document.body });
    mounted.push(w);
    return w;
  }
  const $ = (s: string) => document.body.querySelector(s);
  /** The prompt waits for the first frame — over a loading spinner it would hide the wait message. */
  async function ready(): Promise<HTMLVideoElement> {
    await nextTick();
    const player = $("video") as HTMLVideoElement;
    player.dispatchEvent(new Event("canplay"));
    await nextTick();
    return player;
  }

  it("with a saved position it opens paused and asks: Continue from 4:12 / From the start", async () => {
    saved("in_progress", 252, 38);
    sheet();
    const player = await ready();
    expect(player.autoplay).toBe(false);
    const buttons = [...document.body.querySelectorAll<HTMLButtonElement>("[data-testid=resume-prompt] button")];
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(["Continue from 4:12", "From the start"]);

    const play = vi.spyOn(player, "play").mockResolvedValue(undefined);
    buttons[0]!.click();
    await nextTick();
    expect(player.currentTime).toBe(252);
    expect(play).toHaveBeenCalled();
    expect($("[data-testid=resume-prompt]")).toBeNull();
  });

  it("'From the start' plays from 0", async () => {
    saved("in_progress", 252, 38);
    sheet();
    const player = await ready();
    vi.spyOn(player, "play").mockResolvedValue(undefined);
    document.body.querySelectorAll<HTMLButtonElement>("[data-testid=resume-prompt] button")[1]!.click();
    await nextTick();
    expect(player.currentTime).toBe(0);
  });

  it("no saved position: no prompt, autoplay as before", async () => {
    sheet();
    const player = await ready();
    expect(player.autoplay).toBe(true);
    expect($("[data-testid=resume-prompt]")).toBeNull();
  });

  it("throttled save: every 10 s of playback, on pause and on close — not every frame", async () => {
    vi.useFakeTimers();
    const w = sheet();
    await nextTick();
    const player = $("video") as HTMLVideoElement;
    Object.defineProperty(player, "duration", { value: 665, configurable: true });
    const at = (sec: number) => {
      player.currentTime = sec;
      player.dispatchEvent(new Event("timeupdate"));
    };
    at(1);
    at(2);
    expect(reportPosition).toHaveBeenCalledTimes(0);
    vi.advanceTimersByTime(10_000);
    at(12);
    expect(reportPosition).toHaveBeenLastCalledWith("47", 12, 665, false);
    at(13);
    expect(reportPosition).toHaveBeenCalledTimes(1);
    player.dispatchEvent(new Event("pause"));
    expect(reportPosition).toHaveBeenCalledTimes(2);
    player.dispatchEvent(new Event("ended"));
    expect(reportPosition).toHaveBeenLastCalledWith("47", 13, 665, true);
    await w.setProps({ video: null });
    expect(reportPosition).toHaveBeenCalledTimes(4);
  });
});
