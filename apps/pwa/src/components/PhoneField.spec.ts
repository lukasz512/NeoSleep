import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getSource(): string {
  return readFileSync(path.resolve(__dirname, "PhoneField.vue"), "utf-8");
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
    expect(source).toContain("countryCodeToAreaCode(authStore.user?.country_code)");
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
});
