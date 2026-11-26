import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { defineComponent, nextTick } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { useMotionPreferenceStore } from "@stores";

const mockAnimate = vi.fn(() => ({ finished: Promise.resolve() }));
vi.mock("motion", () => ({
  animate: (...args: unknown[]) => mockAnimate(...args),
}));

import SheetDialogTransition from "./SheetDialogTransition.vue";

const TestHost = defineComponent({
  components: { SheetDialogTransition },
  props: { show: { type: Boolean, default: false } },
  template: `<SheetDialogTransition><div v-if="show" class="content">content</div></SheetDialogTransition>`,
});

const wrappers: VueWrapper[] = [];

beforeEach(() => {
  setActivePinia(createPinia());
});

afterEach(() => {
  for (const w of wrappers.splice(0)) w.unmount();
  mockAnimate.mockClear();
});

function mountHost() {
  const wrapper = mount(TestHost, { props: { show: false }, global: { stubs: { transition: false } } });
  wrappers.push(wrapper);
  return wrapper;
}

describe("SheetDialogTransition", () => {
  it("shows the sheet instantly, without sliding, when motion should be reduced", async () => {
    useMotionPreferenceStore().setPreference("reduced");
    const wrapper = mountHost();
    await wrapper.setProps({ show: true });
    await nextTick();
    expect(mockAnimate).not.toHaveBeenCalled();
    expect((wrapper.find(".content").element as HTMLElement).style.opacity).toBe("1");
  });

  it("slides up from below the screen edge on enter, and leaves faster than it came", async () => {
    useMotionPreferenceStore().setPreference("full");
    const wrapper = mountHost();
    await wrapper.setProps({ show: true });
    await nextTick();
    const [, enterKeyframes, enter] = mockAnimate.mock.calls[0]! as unknown as [unknown, { transform: string[] }, { duration: number }];
    expect(enterKeyframes.transform).toEqual(["translateY(100%)", "translateY(0)"]);

    await wrapper.setProps({ show: false });
    await nextTick();
    const [, leaveKeyframes, leave] = mockAnimate.mock.calls[1]! as unknown as [unknown, { transform: string[] }, { duration: number }];
    expect(leaveKeyframes.transform).toEqual(["translateY(0)", "translateY(100%)"]);
    expect(leave.duration).toBeLessThan(enter.duration);
  });
});
