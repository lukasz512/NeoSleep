import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import LoopVideo from "./LoopVideo.vue";

const props = {
  src: "/media/hero/loop-720.mp4",
  poster: { avif: "/media/hero/poster.avif", jpg: "/media/hero/poster.jpg" },
  label: "Hero",
  playLabel: "Play video",
};

describe("media › weak-network loading", () => {
  it("lite mode shows only the poster and a play button; no video is fetched", () => {
    const w = mount(LoopVideo, { props: { ...props, lite: true } });
    expect(w.find("video").exists()).toBe(false);
    expect(w.find("img").attributes("src")).toBe("/media/hero/poster.jpg");
    expect(w.find("button[aria-label='Play video']").exists()).toBe(true);
  });

  it("the play button loads the video on demand", async () => {
    const w = mount(LoopVideo, { props: { ...props, lite: true } });
    await w.find("button").trigger("click");
    expect(w.find("video").attributes("src")).toBe("/media/hero/loop-720.mp4");
  });

  it("the video never preloads and never plays with sound", async () => {
    const w = mount(LoopVideo, { props: { ...props, lite: true } });
    await w.find("button").trigger("click");
    const v = w.find("video");
    expect(v.attributes("preload")).toBe("none");
    expect((v.element as HTMLVideoElement).muted).toBe(true);
  });
});
