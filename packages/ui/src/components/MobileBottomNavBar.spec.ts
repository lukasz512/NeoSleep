import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import MobileBottomNavBar from "./MobileBottomNavBar.vue";

describe("MobileBottomNavBar", () => {
  it("renders as a nav landmark with a default aria-label", () => {
    const wrapper = mount(MobileBottomNavBar, { slots: { default: "<button>Item</button>" } });
    const nav = wrapper.find("nav.mobile-bottom-nav-bar");
    expect(nav.exists()).toBe(true);
    expect(nav.attributes("aria-label")).toBe("Mobile navigation");
  });

  it("accepts a custom aria-label", () => {
    const wrapper = mount(MobileBottomNavBar, { props: { ariaLabel: "App sections" } });
    expect(wrapper.find("nav").attributes("aria-label")).toBe("App sections");
  });

  it("renders slotted items", () => {
    const wrapper = mount(MobileBottomNavBar, {
      slots: { default: "<button>Home</button><button>Contact</button>" },
    });
    expect(wrapper.findAll("button")).toHaveLength(2);
  });
});
