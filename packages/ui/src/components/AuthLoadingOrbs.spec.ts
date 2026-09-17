import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { useMotionPreferenceStore } from "@stores";
import AuthLoadingOrbs from "./AuthLoadingOrbs.vue";

const wrappers: VueWrapper[] = [];

beforeEach(() => {
  setActivePinia(createPinia());
});

afterEach(() => {
  for (const w of wrappers.splice(0)) w.unmount();
});

describe("AuthLoadingOrbs", () => {
  it("renders the three decorative orbs", () => {
    const wrapper = mount(AuthLoadingOrbs);
    wrappers.push(wrapper);

    expect(wrapper.findAll(".auth-loading-orbs__orb")).toHaveLength(3);
  });

  it("pulses (no static class) when motion is not reduced", () => {
    useMotionPreferenceStore().setPreference("full");
    const wrapper = mount(AuthLoadingOrbs);
    wrappers.push(wrapper);

    for (const orb of wrapper.findAll(".auth-loading-orbs__orb")) {
      expect(orb.classes()).not.toContain("auth-loading-orbs__orb--static");
    }
  });

  it("renders static orbs (no pulse) when motion should be reduced", () => {
    useMotionPreferenceStore().setPreference("reduced");
    const wrapper = mount(AuthLoadingOrbs);
    wrappers.push(wrapper);

    for (const orb of wrapper.findAll(".auth-loading-orbs__orb")) {
      expect(orb.classes()).toContain("auth-loading-orbs__orb--static");
    }
  });
});
