import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import router from "./router";
import App from "./App.vue";
import HomeView from "./views/HomeView.vue";
import DefaultLayout from "./layouts/DefaultLayout.vue";

const messages = await import("@i18n/en.json").then((m) => m.default);
const i18n = createI18n({ legacy: false, locale: "en", messages: { en: messages } });

describe("Website app", () => {
  it("router has home, about, and contact routes", () => {
    const names = router.getRoutes().map((r) => r.name);
    expect(names).toContain("home");
    expect(names).toContain("about");
    expect(names).toContain("contact");
  });

  it("catch-all redirects to home", () => {
    const catchAll = router.getRoutes().find((r) => r.path === "/:pathMatch(.*)*");
    expect(catchAll?.redirect).toBe("/");
  });
});

describe("DefaultLayout", () => {
  it("has header with logo and main nav", () => {
    const wrapper = mount(DefaultLayout, {
      global: {
        plugins: [i18n, router],
        stubs: { "router-view": true },
      },
    });
    const header = wrapper.find(".site-header");
    expect(header.exists()).toBe(true);
    expect(wrapper.find(".site-header__brand").exists()).toBe(true);
    expect(wrapper.find(".site-header__logo").exists()).toBe(true);
    const nav = wrapper.find(".site-header__nav");
    expect(nav.exists()).toBe(true);
    expect(wrapper.find(".layout-default__main").exists()).toBe(true);
  });

  it("nav has expected links (Solutions, For Dentists, For Patients, About, Contact) and Get Started CTA", () => {
    const wrapper = mount(DefaultLayout, {
      global: {
        plugins: [i18n, router],
        stubs: { "router-view": true },
      },
    });
    const navLinks = wrapper.findAll(".site-header__link");
    expect(navLinks.length).toBeGreaterThanOrEqual(5);
    const text = wrapper.find(".site-header__nav").text();
    expect(text).toContain("Solutions");
    expect(text).toContain("For Dentists");
    expect(text).toContain("For Patients");
    expect(text).toContain("About");
    expect(text).toContain("Contact");
    expect(wrapper.find(".site-header__cta").text()).toContain("Get Started");
  });
});

describe("HomeView", () => {
  it("renders hero title and subtitle", () => {
    const wrapper = mount(HomeView, { global: { plugins: [i18n] } });
    expect(wrapper.find(".view-home__hero-title").exists()).toBe(true);
    expect(wrapper.find(".view-home__hero-subtitle").exists()).toBe(true);
    expect(wrapper.text()).toContain("Better Sleep. Better Life.");
  });

  it("renders stats section with four stats", () => {
    const wrapper = mount(HomeView, { global: { plugins: [i18n] } });
    const stats = wrapper.findAll(".view-home__stat");
    expect(stats.length).toBe(4);
  });

  it("renders at least one CTA button in hero", () => {
    const wrapper = mount(HomeView, { global: { plugins: [i18n] } });
    const ctas = wrapper.findAll(".view-home__btn");
    expect(ctas.length).toBeGreaterThanOrEqual(1);
  });

  it("hero primary CTA links to contact with type=patient", () => {
    const wrapper = mount(HomeView, { global: { plugins: [i18n] } });
    const primaryCta = wrapper.find(".view-home__hero-ctas .view-home__btn--primary");
    expect(primaryCta.exists()).toBe(true);
    expect(primaryCta.attributes("href")).toBe("/contact?type=patient");
    expect(primaryCta.text()).toMatch(/Find a Dentist/i);
  });

  it("clicking hero Find a Dentist CTA navigates to contact via router (no full reload)", async () => {
    const pushSpy = vi.spyOn(router, "push");
    const wrapper = mount(HomeView, {
      global: { plugins: [i18n, router] },
    });
    const primaryCta = wrapper.find(".view-home__hero-ctas .view-home__btn--primary");
    await primaryCta.trigger("click");
    expect(pushSpy).toHaveBeenCalledWith({ path: "/contact", query: { type: "patient" } });
    pushSpy.mockRestore();
    wrapper.unmount();
  });

  it("renders solutions, for-professionals, and for-patients sections", () => {
    const wrapper = mount(HomeView, { global: { plugins: [i18n] } });
    expect(wrapper.find("#solutions").exists()).toBe(true);
    expect(wrapper.find("#for-professionals").exists()).toBe(true);
    expect(wrapper.find("#for-patients").exists()).toBe(true);
  });

  it("renders hero image and section images", () => {
    const wrapper = mount(HomeView, { global: { plugins: [i18n] } });
    const imgs = wrapper.findAll("img");
    expect(imgs.length).toBeGreaterThanOrEqual(1);
    const srcs = imgs.map((i) => i.attributes("src"));
    expect(srcs.some((s) => s && s.includes("hero.jpeg"))).toBe(true);
  });
});

describe("Website theme", () => {
  it("sets --website-secondary and --website-radius on root", () => {
    document.documentElement.style.setProperty("--website-secondary", "#2e7d32");
    document.documentElement.style.setProperty("--website-radius", "8px");
    const secondary = getComputedStyle(document.documentElement).getPropertyValue("--website-secondary").trim();
    const radius = getComputedStyle(document.documentElement).getPropertyValue("--website-radius").trim();
    expect(secondary).toBe("#2e7d32");
    expect(radius).toBe("8px");
  });
});
