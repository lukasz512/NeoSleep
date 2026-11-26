import { describe, expect, it } from "vitest";
import { pwaBranding } from "./pwaBranding";

describe("pwaBranding (CORE-178)", () => {
  it("leaves prod exactly as it was", () => {
    expect(pwaBranding({ channel: "prod", version: "1.1.0", build: 142 })).toEqual({
      name: "NeoSleep",
      shortName: "NeoSleep",
      icon192: "/icon-192.png",
      icon512: "/icon-512.png",
      iconMaskable512: "/icon-maskable-512.png",
      appleTouchIcon: "/apple-touch-icon.png",
    });
  });

  it("treats a local build like prod", () => {
    expect(pwaBranding({ channel: undefined, version: "1.1.0", build: undefined }).name).toBe("NeoSleep");
  });

  it("gives dev the badged icons, a DEV label and the full version in the name", () => {
    expect(pwaBranding({ channel: "dev", version: "1.1.0", build: 142 })).toEqual({
      name: "NeoSleep DEV 1.1.0.142",
      shortName: "NeoSleep DEV",
      icon192: "/icon-dev-192.png",
      icon512: "/icon-dev-512.png",
      iconMaskable512: "/icon-dev-maskable-512.png",
      appleTouchIcon: "/apple-touch-icon-dev.png",
    });
  });

  it("keeps the label under the icon free of the version, which iOS freezes at install", () => {
    expect(pwaBranding({ channel: "dev", version: "1.1.0", build: 142 }).shortName).not.toContain("1.1.0");
  });

  it("drops the build number when CI did not set one", () => {
    expect(pwaBranding({ channel: "dev", version: "1.1.0", build: undefined }).name).toBe("NeoSleep DEV 1.1.0");
  });
});
