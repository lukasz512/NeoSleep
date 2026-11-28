import { describe, it, expect, vi, afterEach } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { useSearchShortcut } from "./useSearchShortcut";

const mounted: Array<{ unmount: () => void }> = [];

function setup() {
  const toggle = vi.fn();
  const open = vi.fn();
  const wrapper = mount(
    defineComponent({
      setup() {
        useSearchShortcut({ toggle, open });
        return () => h("div");
      },
    }),
    { attachTo: document.body }
  );
  mounted.push(wrapper);
  return { toggle, open };
}

function press(init: KeyboardEventInit, target: EventTarget = document.body): KeyboardEvent {
  const ev = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(ev);
  return ev;
}

afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount());
  document.body.innerHTML = "";
});

describe("useSearchShortcut (CORE-292)", () => {
  it("Cmd+K and Ctrl+K toggle and prevent the browser default", () => {
    const { toggle } = setup();
    expect(press({ key: "k", metaKey: true }).defaultPrevented).toBe(true);
    expect(press({ key: "K", ctrlKey: true }).defaultPrevented).toBe(true);
    expect(toggle).toHaveBeenCalledTimes(2);
  });

  it("Cmd+K works even while typing in an input", () => {
    const { toggle } = setup();
    const input = document.createElement("input");
    document.body.appendChild(input);
    press({ key: "k", metaKey: true }, input);
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it("a plain k does nothing", () => {
    const { toggle, open } = setup();
    press({ key: "k" });
    expect(toggle).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });

  it("/ opens outside inputs and is ignored inside them", () => {
    const { open } = setup();
    expect(press({ key: "/" }).defaultPrevented).toBe(true);
    expect(open).toHaveBeenCalledTimes(1);

    for (const el of [document.createElement("input"), document.createElement("textarea")]) {
      document.body.appendChild(el);
      press({ key: "/" }, el);
    }
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    document.body.appendChild(editable);
    press({ key: "/" }, editable);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("stops listening after unmount", () => {
    const { toggle } = setup();
    mounted.splice(0).forEach((w) => w.unmount());
    press({ key: "k", metaKey: true });
    expect(toggle).not.toHaveBeenCalled();
  });
});
