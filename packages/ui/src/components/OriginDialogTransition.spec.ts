import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { defineComponent, nextTick } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { useMotionPreferenceStore } from "@stores";

const mockAnimate = vi.fn(() => ({ finished: Promise.resolve() }));
vi.mock("motion", () => ({
  animate: (...args: unknown[]) => mockAnimate(...args),
}));

import OriginDialogTransition from "./OriginDialogTransition.vue";

const TestHost = defineComponent({
  components: { OriginDialogTransition },
  props: { show: { type: Boolean, default: false } },
  template: `<OriginDialogTransition><div v-if="show" class="content">content</div></OriginDialogTransition>`,
});

const wrappers: VueWrapper[] = [];

beforeEach(() => {
  setActivePinia(createPinia());
});

afterEach(() => {
  for (const w of wrappers.splice(0)) w.unmount();
  mockAnimate.mockClear();
});

describe("OriginDialogTransition", () => {
  it("skips the spring animation and applies instantly when motion should be reduced", async () => {
    useMotionPreferenceStore().setPreference("reduced");
    const wrapper = mount(TestHost, {
      props: { show: false },
      global: { stubs: { transition: false } },
    });
    wrappers.push(wrapper);

    await wrapper.setProps({ show: true });
    await nextTick();

    expect(mockAnimate).not.toHaveBeenCalled();
    const el = wrapper.find(".content").element as HTMLElement;
    expect(el.style.opacity).toBe("1");
  });

  it("runs a spring animation via motion's animate() when motion is not reduced", async () => {
    useMotionPreferenceStore().setPreference("full");
    const wrapper = mount(TestHost, {
      props: { show: false },
      global: { stubs: { transition: false } },
    });
    wrappers.push(wrapper);

    await wrapper.setProps({ show: true });
    await nextTick();

    expect(mockAnimate).toHaveBeenCalledTimes(1);
    const [, , options] = mockAnimate.mock.calls[0]!;
    expect(options).toMatchObject({ type: "spring" });
  });
});
