import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import AuthOrbs from "./AuthOrbs.vue";

describe("AuthOrbs", () => {
  // Vue unwraps a top-level ref passed as an argument in the template, so the
  // moon's function ref used to receive null and threw "e is null" on every
  // render (production error on /patients, 2026-10-20).
  it("mounts and unmounts without a render error from the orbit function ref", () => {
    const errors: unknown[] = [];
    const wrapper = mount(AuthOrbs, {
      global: { config: { errorHandler: (err: unknown) => void errors.push(err) } },
    });
    expect(wrapper.find(".auth-orbs__anchor--small .auth-orbs__orbit").exists()).toBe(true);
    wrapper.unmount();
    expect(errors).toEqual([]);
  });
});
