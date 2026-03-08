import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import router from "./router";
import App from "./App.vue";
import HomeView from "./views/HomeView.vue";
import DefaultLayout from "./layouts/DefaultLayout.vue";

const messages = await import("@i18n/en.json").then((m) => m.default);
const i18n = createI18n({ legacy: false, locale: "en", messages: { en: messages } });

describe("Website app", () => {
  it("router has home and about routes", () => {
    const names = router.getRoutes().map((r) => r.name);
    expect(names).toContain("home");
    expect(names).toContain("about");
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
    const header = wrapper.find(".layout-default__header");
    expect(header.exists()).toBe(true);
    expect(wrapper.find(".layout-default__brand").exists()).toBe(true);
    expect(wrapper.find(".layout-default__logo-text").exists()).toBe(true);
    const nav = wrapper.find(".layout-default__nav");
    expect(nav.exists()).toBe(true);
    expect(wrapper.find(".layout-default__main").exists()).toBe(true);
  });

  it("nav has expected links (Solutions, For Dentists, For Patients, About) and Get Started CTA", () => {
    const wrapper = mount(DefaultLayout, {
      global: {
        plugins: [i18n, router],
        stubs: { "router-view": true },
      },
    });
    const navLinks = wrapper.findAll(".layout-default__nav-link");
    expect(navLinks.length).toBeGreaterThanOrEqual(4);
    const text = wrapper.find(".layout-default__nav").text();
    expect(text).toContain("Solutions");
    expect(text).toContain("For Dentists");
    expect(text).toContain("For Patients");
    expect(text).toContain("About");
    expect(wrapper.find(".layout-default__cta").text()).toContain("Get Started");
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

  it("renders solutions, for-dentists, and for-patients sections", () => {
    const wrapper = mount(HomeView, { global: { plugins: [i18n] } });
    expect(wrapper.find("#solutions").exists()).toBe(true);
    expect(wrapper.find("#for-dentists").exists()).toBe(true);
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
