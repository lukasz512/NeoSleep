import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import AppInlineAlert from "./AppInlineAlert.vue";

describe("AppInlineAlert", () => {
  it("announces warnings and errors as alerts, info and success as status", () => {
    expect(mount(AppInlineAlert, { props: { type: "error", text: "x" } }).attributes("role")).toBe("alert");
    expect(mount(AppInlineAlert, { props: { type: "warning", text: "x" } }).attributes("role")).toBe("alert");
    expect(mount(AppInlineAlert, { props: { type: "success", text: "x" } }).attributes("role")).toBe("status");
    expect(mount(AppInlineAlert, { props: { text: "x" } }).classes()).toContain("app-inline-alert--info");
  });

  it("renders title, body and the action link, and emits action on click", async () => {
    const wrapper = mount(AppInlineAlert, {
      props: { type: "warning", title: "Unanswered questions: 3", text: "Answer every question to send.", actionLabel: "Go to the first one" },
    });
    expect(wrapper.find(".app-inline-alert__title").text()).toBe("Unanswered questions: 3");
    expect(wrapper.find(".app-inline-alert__body").text()).toBe("Answer every question to send.");
    await wrapper.find(".app-inline-alert__action").trigger("click");
    expect(wrapper.emitted("action")).toHaveLength(1);
  });

  it("the default slot wins over text; no body element when neither is given", () => {
    expect(mount(AppInlineAlert, { props: { text: "prop" }, slots: { default: "slot" } }).find(".app-inline-alert__body").text()).toBe("slot");
    expect(mount(AppInlineAlert, { props: { title: "Only a title" } }).find(".app-inline-alert__body").exists()).toBe(false);
  });

  it("shows a close button only with a closeLabel, and emits close", async () => {
    expect(mount(AppInlineAlert, { props: { text: "x" } }).find(".app-inline-alert__close").exists()).toBe(false);
    const wrapper = mount(AppInlineAlert, { props: { text: "x", closeLabel: "Close" } });
    const close = wrapper.find(".app-inline-alert__close");
    expect(close.attributes("aria-label")).toBe("Close");
    await close.trigger("click");
    expect(wrapper.emitted("close")).toHaveLength(1);
  });
});
