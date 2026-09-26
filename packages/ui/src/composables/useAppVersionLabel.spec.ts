import { describe, it, expect } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import en from "@i18n/en.json";
import { APP_VERSION_KEY, type AppVersionInfo } from "@stores";
import { useAppVersionLabel, useAppVersionParts } from "./useAppVersionLabel";

const Probe = defineComponent({
  setup() {
    const label = useAppVersionLabel();
    return () => h("span", label.value);
  },
});

function labelFor(appVersion?: AppVersionInfo): string {
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const wrapper = mount(Probe, {
    global: {
      plugins: [i18n],
      provide: appVersion ? { [APP_VERSION_KEY as symbol]: appVersion } : {},
    },
  });
  return wrapper.text();
}

describe("useAppVersionLabel", () => {
  it("is empty when the app provides no version", () => {
    expect(labelFor()).toBe("");
  });

  it("shows version and build without a suffix on prod", () => {
    expect(labelFor({ version: "1.0.0", build: 12, channel: "prod" })).toBe("Version 1.0.0 (build 12)");
  });

  it("appends the channel on dev and local", () => {
    expect(labelFor({ version: "1.0.0", build: 3, channel: "dev" })).toBe("Version 1.0.0 (build 3) · DEV");
    expect(labelFor({ version: "1.0.0", build: null, channel: "local" })).toBe("Version 1.0.0 · LOCAL");
  });
});

// NEO-102: the account menu shows the version, the app bar shows the channel.
describe("useAppVersionParts", () => {
  const PartsProbe = defineComponent({
    setup() {
      const parts = useAppVersionParts();
      return () => h("span", `${parts.value.version}|${parts.value.channel ?? "-"}`);
    },
  });

  function partsFor(appVersion?: AppVersionInfo): string {
    const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
    return mount(PartsProbe, {
      global: { plugins: [i18n], provide: appVersion ? { [APP_VERSION_KEY as symbol]: appVersion } : {} },
    }).text();
  }

  it("splits version and channel, with no channel on prod", () => {
    expect(partsFor({ version: "1.0.0", build: 105, channel: "dev" })).toBe("Version 1.0.0 (build 105)|DEV");
    expect(partsFor({ version: "1.0.0", build: 105, channel: "prod" })).toBe("Version 1.0.0 (build 105)|-");
    expect(partsFor()).toBe("|-");
  });
});
