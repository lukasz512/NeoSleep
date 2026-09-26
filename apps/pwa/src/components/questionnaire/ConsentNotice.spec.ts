import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import en from "@i18n/en.json";
import pl from "@i18n/pl.json";
import mx from "@i18n/mx.json";
import ConsentNotice from "./ConsentNotice.vue";

function mountNotice(clinicEmail: string | null = "contact@clinic.example.com") {
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  return mount(ConsentNotice, {
    props: { clinic: "Test Clinic", clinicEmail, privacyNoticeUrl: "https://example.com/privacy" },
    global: { plugins: [i18n] },
  });
}

describe("ConsentNotice (NEO-116)", () => {
  it("starts collapsed: only the toggle line is reachable, the notice body is inert", () => {
    const wrapper = mountNotice();
    const toggle = wrapper.get(".consent-notice__toggle");
    expect(toggle.attributes("aria-expanded")).toBe("false");
    expect(toggle.text()).toContain(en["app.questionnaire.consentNotice.toggle"]);
    const body = wrapper.get(".consent-notice__body");
    expect(toggle.attributes("aria-controls")).toBe(body.attributes("id"));
    expect(body.attributes("inert")).toBeDefined();
    expect(wrapper.classes()).not.toContain("consent-notice--open");
  });

  it("opens in place on tap and closes again, keeping the full notice and its link", async () => {
    const wrapper = mountNotice();
    const toggle = wrapper.get(".consent-notice__toggle");
    await toggle.trigger("click");
    expect(toggle.attributes("aria-expanded")).toBe("true");
    expect(wrapper.get(".consent-notice__body").attributes("inert")).toBeUndefined();
    expect(wrapper.findAll(".consent-notice__item")).toHaveLength(6);
    expect(wrapper.text()).toContain("Test Clinic");
    expect(wrapper.text()).toContain("contact@clinic.example.com");
    expect(wrapper.get(".consent-notice__link").attributes("href")).toBe("https://example.com/privacy");
    await toggle.trigger("click");
    expect(toggle.attributes("aria-expanded")).toBe("false");
  });

  it("falls back to 'ask at the clinic' when the clinic has no email", () => {
    const wrapper = mountNotice(null);
    expect(wrapper.text()).toContain(en["app.questionnaire.consentNotice.rights.textNoEmail"]);
  });

  // First layer (the checkbox itself) carries controller, data, purpose and the right to withdraw — /legal, NEO-116.
  it("consent checkbox points below, to the notice, and names the right to withdraw, in every language", () => {
    expect(en["app.questionnaire.consent"]).toContain("described below");
    expect(pl["app.questionnaire.consent"]).toContain("opisanych poniżej");
    expect(mx["app.questionnaire.consent"]).toContain("descritos abajo");
    expect(en["app.questionnaire.consent"]).toContain("withdraw it at any time");
    expect(pl["app.questionnaire.consent"]).toContain("wycofać");
    expect(mx["app.questionnaire.consent"]).toContain("revocarlo");
    for (const messages of [en, pl, mx]) expect(messages["app.questionnaire.consentNotice.toggle"]).toBeTruthy();
  });
});
