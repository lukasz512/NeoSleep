import { describe, it, expect } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import en from "@i18n/en.json";
import { APP_VERSION_KEY, type AppVersionInfo } from "@stores";
import { useAppVersionLabel } from "./useAppVersionLabel";

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
