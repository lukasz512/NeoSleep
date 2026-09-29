// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolveAppVersion } from "./appVersion";

describe("resolveAppVersion", () => {
  it("reads version, build number and channel from a CI build", () => {
    expect(resolveAppVersion({ VITE_APP_VERSION: "1.0.0", VITE_APP_BUILD: "12", VITE_APP_CHANNEL: "prod" }))
      .toEqual({ version: "1.0.0", build: 12, channel: "prod" });
  });

  it("treats a build without CI variables as local with no build number", () => {
    expect(resolveAppVersion({ VITE_APP_VERSION: "1.0.0" }))
      .toEqual({ version: "1.0.0", build: null, channel: "local" });
  });

  it("drops a missing, zero, negative or non-numeric build number instead of showing it", () => {
    for (const bad of ["", "0", "-3", "12a", "1.5"]) {
      expect(resolveAppVersion({ VITE_APP_VERSION: "1.0.0", VITE_APP_BUILD: bad }).build).toBeNull();
    }
  });

  it("falls back to local for an unknown channel", () => {
    expect(resolveAppVersion({ VITE_APP_VERSION: "1.0.0", VITE_APP_CHANNEL: "staging" }).channel).toBe("local");
  });

  it("starts numbering at 1.0.0 in apps/pwa/package.json", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version?: string };
    expect(pkg.version).toBe("1.0.0");
  });
});
