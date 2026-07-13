import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("LoginView (shared)", () => {
  const source = readFileSync(path.resolve(__dirname, "LoginView.vue"), "utf-8");

  describe("template", () => {
    it("renders email field", () => {
      expect(source).toMatch(/type="email"/);
    });

    it("renders password field with show/hide toggle", () => {
      expect(source).toMatch(/['"]password['"]/);
      expect(source).toMatch(/showPassword/);
      expect(source).toMatch(/append-inner-icon/);
    });

    it("renders remember-me checkbox", () => {
      expect(source).toMatch(/rememberMe/);
      expect(source).toMatch(/VCheckbox/);
    });

    it("renders submit button with loading state", () => {
      expect(source).toMatch(/:loading="loading"/);
    });

    it("renders forgot password stub (disabled)", () => {
      expect(source).toMatch(/forgotPassword/);
      expect(source).toMatch(/disabled/);
    });

    it("renders error alert driven by errorKey", () => {
      expect(source).toMatch(/v-if="errorKey"/);
      expect(source).toMatch(/VAlert/);
    });

    it("renders tenant logo when logoUrl is set", () => {
      expect(source).toMatch(/v-if="logoUrl"/);
      expect(source).toMatch(/VImg/);
    });

    it("renders dev panel only in dev mode", () => {
      expect(source).toMatch(/isDev/);
      expect(source).toMatch(/defineAsyncComponent/);
    });

    it("uses VForm for native submit handling", () => {
      expect(source).toMatch(/VForm/);
      expect(source).toMatch(/@submit\.prevent/);
    });
  });

  describe("script", () => {
    it("injects apiFetch via neo:apiFetch key", () => {
      expect(source).toMatch(/neo:apiFetch/);
      expect(source).toMatch(/inject/);
    });

    it("calls createUseLoginFlow with injected apiFetch", () => {
      expect(source).toMatch(/createUseLoginFlow\(apiFetch\)/);
    });

    it("reads logo from configStore", () => {
      expect(source).toMatch(/configStore/);
      expect(source).toMatch(/logo_url/);
    });

    it("has no hardcoded user-facing strings", () => {
      expect(source).not.toMatch(/"Sign in"/);
      expect(source).not.toMatch(/"Password"/);
      expect(source).not.toMatch(/"Email"/);
    });
  });

  describe("styles", () => {
    it("uses scoped styles", () => {
      expect(source).toMatch(/<style[^>]*\sscoped/);
    });

    it("uses 100dvh for full viewport height", () => {
      expect(source).toMatch(/100dvh/);
    });
  });
});
