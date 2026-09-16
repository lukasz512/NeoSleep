import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { mount, type VueWrapper } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import PhoneField from "./PhoneField.vue";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getSource(): string {
  return readFileSync(path.resolve(__dirname, "PhoneField.vue"), "utf-8");
}

const mountedWrappers: VueWrapper[] = [];

afterEach(() => {
  for (const w of mountedWrappers.splice(0)) w.unmount();
  document.body.innerHTML = "";
});

function mountPhoneField(props: { disabled?: boolean } = {}) {
  setActivePinia(createPinia());
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const el = document.createElement("div");
  document.body.appendChild(el);
  const wrapper = mount(PhoneField, {
    attachTo: el,
    props: { modelValue: "+52 5512345678", ...props },
    global: { plugins: [vuetify] },
  });
  mountedWrappers.push(wrapper);
  return wrapper;
}

describe("PhoneField", () => {
  it("derives its area-code list from the shared PHONE_AREA_CODES (PL/MX/TH) rather than duplicating it", () => {
    const source = getSource();
    expect(source).toContain("PHONE_AREA_CODES");
    expect(source).toContain("AREA_CODES = PHONE_AREA_CODES.map");
  });

  it("defaults the area code from the logged-in user's own country", () => {
    const source = getSource();
    expect(source).toContain("useAuthStore()");
    expect(source).toContain("countryCodeToAreaCode(props.defaultCountryCode ?? authStore.user?.country_code)");
  });

  it("parses/formats through the shared utils/phone helpers rather than reimplementing the logic", () => {
    const source = getSource();
    expect(source).toContain('from "../utils/phone"');
    expect(source).toContain("parsePhone");
    expect(source).toContain("formatPhone");
  });

  it("re-parses on external modelValue changes without re-emitting its own last value (no feedback loop)", () => {
    const source = getSource();
    expect(source).toMatch(/watch\(\s*\(\)\s*=>\s*props\.modelValue/);
    expect(source).toContain("formatPhone(areaCode.value, localDigits.value)");
  });

  it("strips non-digit characters from the local number on input", () => {
    const source = getSource();
    expect(source).toContain('replace(/\\D/g, "")');
  });

  it("renders a VCombobox (area code) beside a VTextField (local number)", () => {
    const source = getSource();
    expect(source).toContain("<VCombobox");
    expect(source).toContain("<VTextField");
    expect(source).toContain("pwa-phone-field");
  });

  it("allows typing a custom area code, not just the listed suggestions", () => {
    const source = getSource();
    // VCombobox (not VSelect) is what makes free typed values possible in
    // the first place; onAreaCodeInput normalizes a missing leading "+".
    expect(source).toContain("function onAreaCodeInput");
    expect(source).toContain('`+${raw.replace(/\\D/g, "")}`');
  });

  it("shows a rectangular flag for the current area code via FlagIcon", () => {
    const source = getSource();
    expect(source).toContain('from "./FlagIcon.vue"');
    expect(source).toContain("currentFlagCountry");
  });

  it("disables return-object on the VCombobox so selecting a suggestion emits the code string, not the raw item", () => {
    // Vuetify's VCombobox defaults to returnObject: true, which would make
    // onAreaCodeInput receive { code, label, country } instead of "+52" on
    // selection, collapsing areaCode to "+" and unmounting the flag icon.
    const source = getSource();
    expect(source).toContain(':return-object="false"');
  });

  it("forwards a declared disabled prop to both inner inputs", () => {
    // The two Vuetify inputs live inside this component's own wrapping div,
    // so a `disabled` attribute passed from FormRenderer falls through onto
    // that div (inert for form controls) unless it's declared as a real prop
    // here and bound explicitly to each input.
    const source = getSource();
    expect(source).toMatch(/disabled\?:\s*boolean/);
    const disabledBindings = [...source.matchAll(/:disabled="disabled"/g)];
    expect(disabledBindings.length).toBe(2);
  });

  it("actually disables both real inputs in the DOM when disabled=true (not just the wrapping div)", () => {
    const enabled = mountPhoneField({ disabled: false });
    expect(enabled.find(".pwa-phone-field__code input").attributes("disabled")).toBeUndefined();
    expect(enabled.find(".pwa-phone-field__number input").attributes("disabled")).toBeUndefined();

    const disabled = mountPhoneField({ disabled: true });
    expect(disabled.find(".pwa-phone-field__code input").attributes("disabled")).toBeDefined();
    expect(disabled.find(".pwa-phone-field__number input").attributes("disabled")).toBeDefined();
  });
});
